"""学习路径 API"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import LearningPath, AssessmentRecord, User
from auth import get_current_user
from services.spark_service import spark_service
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
import json
import asyncio
import logging
import sys
import os

# knowledge_graph 在项目根目录的 knowledge_base/ 下
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from knowledge_base.knowledge_graph import generate_path_data, EDGES, CHAPTERS

router = APIRouter(prefix="/api/learning-path", tags=["learning-path"])


class PathRequest(BaseModel):
    profile: dict = {}
    chapter: str = ""
    knowledge_graph: dict = {}


class ToggleNodeRequest(BaseModel):
    node_id: str


logger = logging.getLogger(__name__)


def _extract_json_from_llm(text: str) -> dict | None:
    """从 LLM 回复中提取 JSON 对象，处理 markdown 包裹"""
    import re
    text = text.strip()
    m = re.search(r'```(?:json)?\s*\n([\s\S]*?)```', text)
    if m:
        text = m.group(1).strip()
    # 找 { ... }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


PATH_STRUCTURE_PROMPT = """\
你是课程学习路径规划专家。请根据学生的需求动态生成个性化的学习路径结构。

学生信息：
- 学习目标：{learning_goal}
- 已掌握的知识领域：{knowledge_base_summary}
- 薄弱环节：{weak_points}
- 兴趣领域：{interests}
- 认知风格：{cognitive_style}
- 每日可用时间：{available_time}

请生成一个个性化的学习路径，包含若干学习节点和它们之间的依赖关系。
要求：
1. 节点数量：5-12 个，根据学习目标的复杂度灵活调整
2. 每个节点是一个独立的学习主题，从基础到进阶排列
3. 依赖关系表示前置知识要求（A→B 表示要先学 A 再学 B）
4. 如果学生已有掌握度高的领域，可以跳过或缩短相关节点
5. 如果学生有明确的薄弱环节，应增加相关节点的详细度和时间
6. 根据学生兴趣适当增加相关方向的深度

输出严格的 JSON（不要加 markdown 代码块标记）：
{{
  "nodes": [
    {{
      "id": "node_1",
      "title": "节点标题",
      "description": "节点描述",
      "goals": "学习目标",
      "key_concepts": ["概念1", "概念2"],
      "difficulty": 0.3,
      "estimated_hours": 8,
      "sub_topics": [
        {{"title": "子主题", "description": "描述", "key_points": ["点1", "点2"]}}
      ],
      "learning_methods": ["方法1"],
      "milestones": ["里程碑1"],
      "prerequisites": [],
      "resources_hint": ["推荐资源类型"]
    }}
  ],
  "edges": [
    {{"from": "node_1", "to": "node_2", "label": "依赖说明"}}
  ]
}}

注意：
- id 用 node_1, node_2, ... 格式
- prerequisites 填写前置节点的 id
- 确保无环依赖
- difficulty 0.0-1.0
- 标题要具体，支持任意主题
- learning_goal 为空时根据画像推荐通用路径"""


async def _llm_generate_structure(learning_goal: str, profile: dict) -> dict:
    """调用 LLM 动态生成路径结构 {nodes, edges}"""
    kb_summary = ", ".join(
        f"{k}({round(v*100)}%)" for k, v in (profile.get("knowledge_base", {}) or {}).items()
    ) or "暂无"
    weak = ", ".join(profile.get("weak_points", []) or []) or "暂无"
    interests = ", ".join(profile.get("interests", []) or []) or "暂无"
    cognitive = profile.get("cognitive_style", "verbal")
    available = profile.get("available_time", "3-5h/周")

    prompt = PATH_STRUCTURE_PROMPT.format(
        learning_goal=learning_goal or "未指定（根据画像推荐通用路径）",
        knowledge_base_summary=kb_summary,
        weak_points=weak,
        interests=interests,
        cognitive_style=cognitive,
        available_time=available,
    )

    raw = await spark_service.chat([
        {"role": "system", "content": "你是一个学习路径规划专家，输出严格的 JSON 格式，不包含任何 markdown 代码块标记或额外文字。输出节点标题和内容要贴近学生实际需求。"},
        {"role": "user", "content": prompt},
    ], temperature=0.7)

    logger.info("LLM path structure raw: %s", raw[:300])

    parsed = _extract_json_from_llm(raw)
    if not parsed or "nodes" not in parsed:
        raise ValueError(f"LLM 返回无效结构，前200字符: {raw[:200]}")

    nodes = parsed.get("nodes", [])
    if len(nodes) < 3:
        raise ValueError(f"节点数太少: {len(nodes)}")

    logger.info("LLM 路径结构生成成功，%d 个节点", len(nodes))

    # 补全缺失字段
    from knowledge_base.knowledge_graph import enrich_llm_nodes
    return enrich_llm_nodes(parsed, profile)


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


async def _fetch_user_study_context(username: str) -> dict:
    """获取用户学习上下文（测评记录、学习时长等），用于丰富 LLM prompt"""
    context = {
        "total_study_hours": 0,
        "quiz_scores_summary": "",
        "recent_activity": "",
    }
    try:
        async with async_session() as session:
            since = datetime.now(timezone.utc) - timedelta(days=30)
            result = await session.execute(
                select(AssessmentRecord)
                .where(AssessmentRecord.user_id == username)
                .where(AssessmentRecord.created_at >= since)
                .order_by(AssessmentRecord.created_at.desc())
                .limit(20)
            )
            records = result.scalars().all()

            total_minutes = sum(r.study_time_minutes for r in records)
            context["total_study_hours"] = round(total_minutes / 60, 1)

            # 汇总测验成绩
            all_scores = []
            for r in records:
                if r.quiz_scores and isinstance(r.quiz_scores, list):
                    for s in r.quiz_scores:
                        if isinstance(s, dict) and "score" in s:
                            all_scores.append(s)
            if all_scores:
                context["quiz_scores_summary"] = json.dumps(all_scores[:10], ensure_ascii=False)

            # 最近活动
            if records:
                latest = records[0]
                context["recent_activity"] = (
                    f"最近30天学习{total_minutes}分钟，完成{len(records)}次学习活动"
                )
    except Exception:
        pass
    return context


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

    LLM-first: 先尝试让 LLM 动态生成路径结构 {nodes, edges}，
    失败时回退到知识图谱算法。
    """

    # Step 1: 获取用户学习上下文
    study_context = await _fetch_user_study_context(current_user.username)

    # Step 1b: 尝试 LLM 动态生成路径结构
    path_data = None
    try:
        goal = req.learning_goal or (req.profile or {}).get("learning_goal", "")
        path_data = await _llm_generate_structure(goal, req.profile)
    except Exception as e:
        logger.warning("LLM 路径结构生成失败，回退到算法: %s", e)

    # Step 1c: 回退到算法生成
    if path_data is None:
        path_data = generate_path_data(req.profile)

    # Step 2: 构建 LLM prompt 生成 Markdown 分析
    nodes_summary = []
    for n in path_data["nodes"]:
        nodes_summary.append({
            "title": n["title"],
            "difficulty": n["difficulty"],
            "estimated_hours": n["estimated_hours"],
            "mastery": n.get("mastery", 0.5),
            "sub_topics_count": len(n.get("sub_topics", [])),
            "prerequisites": n.get("prerequisites", []),
        })

    prompt = f"""你是一位资深的学习路径规划专家。以下是基于知识图谱和学生画像生成的个性化学习路径：

## 学生画像
{json.dumps(req.profile, ensure_ascii=False, indent=2) if req.profile else '画像数据暂无'}

## 学习上下文
- 累计学习时长：{study_context['total_study_hours']}小时
- {study_context.get('recent_activity', '暂无学习活动记录')}
{f"- 测验成绩记录：{study_context['quiz_scores_summary']}" if study_context.get('quiz_scores_summary') else ''}

## 算法排序后的章节（已按掌握度和薄弱点加权）
{json.dumps(nodes_summary, ensure_ascii=False, indent=2)}

## 依赖关系
{json.dumps([f"{e['from']}→{e['to']}({e['label']})" for e in path_data['edges']], ensure_ascii=False)}

## 学习路径总览
- 总计 {path_data['summary']['total_chapters']} 章，约 {path_data['summary']['total_hours']} 学时
- 每日可用学习时间：{path_data['summary']['daily_hours']}小时
- 预计完成天数：{path_data['summary']['total_days']}天
- 平均难度：{path_data['summary']['avg_difficulty']}

请基于以上信息，生成一份详细的个性化学习路径规划分析（Markdown格式），要求：

1. **整体规划概览**：用 2-3 段话概括学习路线的设计逻辑和时间安排，突出本次推荐的与画像的关联
2. **分阶段学习策略**：将 {len(path_data['nodes'])} 个章节划分为 3-4 个阶段，为每个阶段起一个形象的名字（如"筑基阶段：核心概念"），每阶段列出包含的章节和具体学习方法
3. **薄弱环节针对性建议**：针对学生掌握度 < 0.4 的章节，每条给出具体的弥补方案
4. **个性化学习方法推荐**：根据认知风格和兴趣方向推荐差异化学习方式
5. **里程碑与检查点**：设置 3-4 个关键检查节点及通过标准
6. **常见问题预警**：针对每个阶段指出 1-2 个典型困难及应对策略

要求：
- 每章节分析要引用具体知识点名称，不要只说"本章"
- 针对画像中 knowledge_base 较低的领域给出额外关注
- 如果有 weak_points，必须专门分析每个薄弱点的攻克方法
- 输出格式用 ## 和 ### 分层次"""

    async def generate():
        full_text = ""
        try:
            # 先输出路径骨架 JSON（给前端即时渲染）
            yield f"data: {json.dumps({'type': 'path_data', 'data': path_data}, ensure_ascii=False)}\n\n"

            messages = [
                {"role": "system", "content": (
                    "你是学习路径规划专家，擅长根据学生的知识水平、认知风格和学习目标定制个性化学习方案。"
                    "请基于给定的拓扑排序结果和学生画像，输出专业、具体、有操作性的规划分析（Markdown格式）。"
                    "每个建议都要有具体的行动步骤，避免笼统的描述。"
                    "如果学生画像中有薄弱点，必须针对每个薄弱点单独给出攻克方案。"
                    "将章节划分为 3-4 个形象命名的阶段，为每个阶段命名（如「筑基期」「进阶期」等）。"
                    "你的输出应该每次都不一样，根据画像差异做出针对性调整。"
                )},
                {"role": "user", "content": prompt},
            ]
            async for chunk in spark_service.chat_stream(messages, temperature=0.85, max_tokens=4096):
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
                            current_node=path_data["nodes"][0]["id"] if path_data["nodes"] else "node_1",
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
