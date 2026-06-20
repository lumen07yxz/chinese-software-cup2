"""学习路径 API"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import LearningPath, User
from auth import get_current_user
from services.spark_service import spark_service
from datetime import datetime, timezone
from sqlalchemy import select
import json
import asyncio
import sys
import os

# knowledge_graph 在项目根目录的 knowledge_base/ 下
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from knowledge_base.knowledge_graph import generate_path_data, EDGES

router = APIRouter(prefix="/api/learning-path", tags=["learning-path"])


class PathRequest(BaseModel):
    profile: dict = {}
    chapter: str = ""
    knowledge_graph: dict = {}


class ToggleNodeRequest(BaseModel):
    node_id: str


def _compute_next_node(path_data: dict, completed_nodes: list[str]) -> str:
    """计算下一个推荐学习节点：前置全部完成但自身未完成的最高优先节点"""
    completed_set = set(completed_nodes)
    edges = path_data.get("edges", [])
    nodes = path_data.get("nodes", [])

    # 构建前置关系
    predecessors: dict[str, list[str]] = {}
    for node in nodes:
        predecessors[node["id"]] = []
    for edge in edges:
        if edge["to"] in predecessors:
            predecessors[edge["to"]].append(edge["from"])

    best_node = ""
    best_priority = -1
    for node in nodes:
        nid = node["id"]
        if nid in completed_set:
            continue
        # 检查前置是否全部完成
        if all(p in completed_set for p in predecessors[nid]):
            prio = node.get("priority", 1)
            if prio > best_priority:
                best_priority = prio
                best_node = nid

    return best_node or (nodes[0]["id"] if nodes else "")


@router.get("/")
async def get_learning_path(current_user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(LearningPath).where(LearningPath.user_id == current_user.username)
            .order_by(LearningPath.updated_at.desc())
        )
        path = result.scalars().first()
        if not path:
            return {"path": None}
        return {
            "path": {
                "data": path.path_data,
                "current_node": path.current_node,
                "progress": path.progress,
                "completed_nodes": path.completed_nodes or [],
                "updated_at": path.updated_at.isoformat() if path.updated_at else "",
            }
        }


@router.post("/toggle-node")
async def toggle_node_completion(
    req: ToggleNodeRequest,
    current_user: User = Depends(get_current_user),
):
    """切换节点完成状态并重算进度"""
    async with async_session() as session:
        result = await session.execute(
            select(LearningPath).where(LearningPath.user_id == current_user.username)
            .order_by(LearningPath.updated_at.desc())
        )
        path = result.scalars().first()
        if not path:
            raise HTTPException(status_code=404, detail="No learning path found")

        completed = list(path.completed_nodes or [])
        if req.node_id in completed:
            completed.remove(req.node_id)
        else:
            completed.append(req.node_id)

        path.completed_nodes = completed
        total = len(path.path_data.get("nodes", []))
        path.progress = len(completed) / total if total > 0 else 0.0
        path.current_node = _compute_next_node(path.path_data, completed)
        path.updated_at = datetime.now(timezone.utc)
        await session.commit()

    return {
        "completed_nodes": completed,
        "progress": path.progress,
        "current_node": path.current_node,
    }


@router.post("/generate")
async def generate_path(
    req: PathRequest,
    current_user: User = Depends(get_current_user),
):
    """流式生成个性化学习路径

    使用知识图谱 Kahn 拓扑排序确定章节顺序，LLM 负责生成个性化建议和描述。
    """

    # Step 1: 用知识图谱算法生成路径骨架
    path_data = generate_path_data(req.profile)

    # Step 2: 让 LLM 补充个性化建议和描述
    prompt = f"""你是一位学习路径规划专家。以下是基于知识图谱拓扑排序生成的学习路径骨架：

用户画像：{json.dumps(req.profile, ensure_ascii=False) if req.profile else '未知'}

算法排序后的节点顺序（已按掌握度和薄弱点加权）：
{json.dumps([n['title'] for n in path_data['nodes']], ensure_ascii=False)}

依赖关系（前置知识约束）：
{json.dumps([f"{e['from']}→{e['to']}({e['label']})" for e in path_data['edges'][:6]], ensure_ascii=False)}

请分析这个学习路径规划的合理性，给出充实后的每个章节学习建议和整体规划说明，以 Markdown 格式输出。"""

    async def generate():
        full_text = ""
        try:
            # 先输出算法生成的路径骨架 JSON（给前端即时渲染）
            yield f"data: {json.dumps({'type': 'path_data', 'data': path_data}, ensure_ascii=False)}\n\n"

            messages = [
                {"role": "system", "content": "你是学习路径规划专家。请基于给定的拓扑排序结果，输出贴合学生画像的个性化规划分析（Markdown格式）。"},
                {"role": "user", "content": prompt},
            ]
            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=2048):
                full_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            # 保存到 DB
            try:
                async with async_session() as session:
                    result = await session.execute(
                        select(LearningPath).where(LearningPath.user_id == current_user.username)
                    )
                    existing = result.scalars().first()
                    if existing:
                        existing.path_data = path_data
                        existing.updated_at = datetime.now(timezone.utc)
                    else:
                        new_path = LearningPath(
                            user_id=current_user.username,
                            path_data=path_data,
                            current_node=path_data["nodes"][0]["id"] if path_data["nodes"] else "ch01",
                            progress=0.0,
                            completed_nodes=[],
                        )
                        session.add(new_path)
                    await session.commit()
            except Exception:
                pass

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
