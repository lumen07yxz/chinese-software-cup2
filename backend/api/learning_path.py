"""学习路径 API"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import LearningPath
from services.spark_service import spark_service
from services.rag_service import rag_service
import json
import asyncio

router = APIRouter(prefix="/api/learning-path", tags=["learning-path"])


class PathRequest(BaseModel):
    user_id: str = "default"
    profile: dict = {}
    chapter: str = ""
    knowledge_graph: dict = {}


@router.get("/")
async def get_learning_path(user_id: str = "default"):
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(LearningPath).where(LearningPath.user_id == user_id)
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
                "updated_at": path.updated_at.isoformat() if path.updated_at else "",
            }
        }


@router.post("/generate")
async def generate_path(req: PathRequest):
    """流式生成个性化学习路径"""
    chapters = ["人工智能导论", "机器学习基础", "深度学习基础", "Transformer架构",
                 "自然语言处理", "计算机视觉", "强化学习", "AI伦理与安全",
                 "MLOps与AI工程实践", "前沿方向与多模态AI"]

    prompt = f"""你是一位学习路径规划专家。请根据以下信息生成个性化学习路径。

用户画像：{json.dumps(req.profile, ensure_ascii=False)}

课程章节：{json.dumps(chapters, ensure_ascii=False)}

请输出 JSON 格式的学习路径规划：
{{
  "nodes": [
    {{"id": "ch01", "title": "章节名", "duration": "建议学习时长", "priority": 1-10, "description": "学习建议"}},
    ...
  ],
  "edges": [
    {{"from": "ch01", "to": "ch02", "label": "前置知识"}},
    ...
  ],
  "suggestions": ["个性化的学习建���1", "建议2", ...]
}}

要求：
1. 根据用户画像中的知识基础调整顺序（已掌握内容可跳过或快速复习）
2. 优先安排薄弱环节的学习
3. 给出每个章节的建议学习时长
4. 标注章节间的依赖关系"""

    async def generate():
        full_content = ""
        try:
            messages = [
                {"role": "system", "content": "你是学习路径规划专家。请直接输出 JSON，不要多余内容。"},
                {"role": "user", "content": prompt},
            ]
            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=4096):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            # Try to parse and save
            try:
                json_match = full_content.strip()
                if "```json" in json_match:
                    json_match = json_match.split("```json")[1].split("```")[0]
                elif "```" in json_match:
                    json_match = json_match.split("```")[1].split("```")[0]
                path_data = json.loads(json_match)

                async with async_session() as session:
                    from sqlalchemy import select
                    result = await session.execute(
                        select(LearningPath).where(LearningPath.user_id == req.user_id)
                    )
                    existing = result.scalars().first()
                    if existing:
                        existing.path_data = path_data
                        existing.updated_at = __import__('datetime').datetime.utcnow()
                    else:
                        new_path = LearningPath(
                            user_id=req.user_id,
                            path_data=path_data,
                            current_node=chapters[0],
                            progress=0.0,
                        )
                        session.add(new_path)
                    await session.commit()
            except:
                pass

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
