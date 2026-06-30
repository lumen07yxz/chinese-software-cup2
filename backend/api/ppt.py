"""AI PPT 生成 API —— 两阶段流水线 + 历史记录

Stage 1: LLM 生成大纲（SSE 流式推送）
Stage 2: 大纲 → 讯飞 API / 本地降级 → 生成 PPT
历史: 所有 PPT 自动保存到数据库，可随时查看/下载
"""

import json
import logging
import os
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from auth import get_current_user
from models import User, StudentProfile, PPTRecord
from db import async_session
from services.ppt_service import ppt_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ppt", tags=["ppt"])

# 本地 PPT 存储目录
PPT_STORE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ppt_store")


def _ensure_store():
    os.makedirs(PPT_STORE_DIR, exist_ok=True)


# ── Schemas ──────────────────────────────────────────────────────────

class PPTRequest(BaseModel):
    query: str
    language: str = "cn"
    search: int = 1


class OutlineRequest(BaseModel):
    topic: str
    language: str = "cn"


class SaveRecordRequest(BaseModel):
    title: str
    outline: dict = {}
    task_id: str = ""
    file_url: str = ""
    source: str = "xfyun"


class UpdateRecordRequest(BaseModel):
    file_url: str = ""
    file_path: str = ""
    status: str = ""


# ── Profile 引用 ─────────────────────────────────────────────────────

async def _build_profile_context(user_id: str) -> str:
    """从 DB 读取学生画像，生成注入文本"""
    async with async_session() as session:
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()
    if not profile:
        return ""

    parts = []
    if profile.knowledge_base:
        sorted_kb = sorted(profile.knowledge_base.items(), key=lambda x: x[1], reverse=True)[:5]
        kb_text = "、".join(f"{k}({v:.0%})" for k, v in sorted_kb)
        parts.append(f"知识掌握度：{kb_text}")
    if profile.cognitive_style:
        style_map = {"visual": "视觉型", "verbal": "言语型", "active": "主动型", "reflective": "反思型"}
        parts.append(f"认知风格：{style_map.get(profile.cognitive_style, profile.cognitive_style)}")
    if profile.weak_points:
        parts.append(f"薄弱环节：{'、'.join(profile.weak_points[:5])}")
    if profile.learning_goal:
        parts.append(f"学习目标：{profile.learning_goal[:100]}")
    if profile.interests:
        parts.append(f"兴趣方向：{'、'.join(profile.interests[:5])}")

    if parts:
        return "学习者画像：\n" + "\n".join(parts)
    return ""


# ── 历史记录 API ────────────────────────────────────────────────────

@router.get("/records")
async def list_records(
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的 PPT 历史记录"""
    async with async_session() as session:
        result = await session.execute(
            select(PPTRecord)
            .where(PPTRecord.user_id == current_user.id)
            .order_by(PPTRecord.created_at.desc())
            .limit(50)
        )
        records = result.scalars().all()
    return {
        "records": [
            {
                "id": r.id,
                "title": r.title,
                "outline": r.outline,
                "source": r.source,
                "file_url": r.file_url,
                "has_local_file": bool(r.file_path) and os.path.exists(r.file_path),
                "task_id": r.task_id,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in records
        ]
    }


@router.post("/records")
async def save_record(
    req: SaveRecordRequest,
    current_user: User = Depends(get_current_user),
):
    """保存一条 PPT 生成记录"""
    _ensure_store()
    async with async_session() as session:
        record = PPTRecord(
            user_id=current_user.id,
            title=req.title,
            outline=req.outline,
            source=req.source,
            task_id=req.task_id,
            file_url=req.file_url,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return {"id": record.id, "title": record.title}


@router.put("/records/{record_id}")
async def update_record(
    record_id: int,
    req: UpdateRecordRequest,
    current_user: User = Depends(get_current_user),
):
    """更新 PPT 记录（生成完成后回填 file_url / file_path）"""
    async with async_session() as session:
        result = await session.execute(
            select(PPTRecord).where(
                PPTRecord.id == record_id,
                PPTRecord.user_id == current_user.id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        if req.file_url:
            record.file_url = req.file_url
        if req.file_path:
            record.file_path = req.file_path
        await session.commit()
        return {"ok": True}


@router.delete("/records/{record_id}")
async def delete_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除 PPT 记录"""
    async with async_session() as session:
        result = await session.execute(
            select(PPTRecord).where(
                PPTRecord.id == record_id,
                PPTRecord.user_id == current_user.id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(status_code=404, detail="记录不存在")
        # 删除本地文件
        if record.file_path and os.path.exists(record.file_path):
            try:
                os.remove(record.file_path)
            except OSError:
                pass
        await session.delete(record)
        await session.commit()
        return {"ok": True}


@router.get("/records/{record_id}/file")
async def serve_record_file(
    record_id: int,
    current_user: User = Depends(get_current_user),
):
    """下载 PPT 记录对应的文件

    优先使用本地缓存文件；若无则从讯飞 CDN 下载并缓存。
    """
    async with async_session() as session:
        result = await session.execute(
            select(PPTRecord).where(
                PPTRecord.id == record_id,
                PPTRecord.user_id == current_user.id,
            )
        )
        record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 有本地文件 → 直接返回
    if record.file_path and os.path.exists(record.file_path):
        return FileResponse(
            path=record.file_path,
            filename=f"{record.title}.pptx",
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )

    # 有讯飞 URL → 下载到本地并缓存
    if record.file_url:
        _ensure_store()
        local_path = os.path.join(PPT_STORE_DIR, f"{record.id}_{record.title}.pptx")
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                resp = await client.get(record.file_url)
                if resp.status_code == 200:
                    with open(local_path, "wb") as f:
                        f.write(resp.content)
                    # 更新 DB
                    async with async_session() as sess:
                        rec = await sess.get(PPTRecord, record_id)
                        if rec:
                            rec.file_path = local_path
                            await sess.commit()
                    return FileResponse(
                        path=local_path,
                        filename=f"{record.title}.pptx",
                        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    )
        except Exception as e:
            logger.error("下载 PPT 文件失败: %s", e)

    raise HTTPException(status_code=404, detail="文件不可用")


# ── Stage 1: 大纲生成（SSE）─────────────────────────────────────────

OUTLINE_SYSTEM_PROMPT = """你是一个专业的 PPT 大纲设计师。根据用户给出的主题和学习者画像，生成一份结构化的 PPT 大纲 JSON。

## 输出格式（严格 JSON，不要 markdown 代码块）

{
  "title": "PPT 标题（简洁，≤15字）",
  "description": "PPT 主题描述（1-2句）",
  "pages": [
    {
      "id": 1,
      "title": "页面标题",
      "type": "content",
      "keyPoints": ["要点1", "要点2", "要点3"]
    }
  ]
}

## 规则
- pages 数组包含 6-10 个页面
- 第一页 type 固定为 "cover"（封面），只有 title 和 description
- 最后一页 type 固定为 "summary"（总结）
- 中间页面 type 为 "content"，每页 2-4 个 keyPoints
- 如果主题适合，可插入 1 页 type="chart"（数据可视化页）
- 内容深度根据学习者画像自适应：薄弱环节相关的页面要更详细
- 直接输出 JSON，不要任何解释"""


@router.post("/outline")
async def generate_outline(
    req: OutlineRequest,
    current_user: User = Depends(get_current_user),
):
    """Stage 1: SSE 流式生成 PPT 大纲"""

    profile_ctx = await _build_profile_context(current_user.id)
    user_msg = f"主题：{req.topic}"
    if profile_ctx:
        user_msg += f"\n\n{profile_ctx}"
    user_msg += "\n\n请直接输出 JSON 大纲。"

    async def event_stream():
        from services.spark_service import spark_service

        messages = [
            {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ]

        full_text = ""
        try:
            async for chunk in spark_service.chat_stream(messages, temperature=0.7):
                full_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"

            outline = _parse_outline(full_text)
            if outline:
                yield f"data: {json.dumps({'type': 'outline', 'data': outline}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'content': '大纲解析失败，请重试'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error("大纲生成失败: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _parse_outline(text: str) -> dict | None:
    """从 LLM 响应中提取 JSON 大纲（多层容错）"""
    try:
        return json.loads(text)
    except Exception:
        pass

    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    if start != -1 and end > start:
        fragment = text[start : end + 1]
        fixed = re.sub(r",\s*([}\]])", r"\1", fragment)
        try:
            return json.loads(fixed)
        except Exception:
            pass

    return None


# ── Stage 2: PPT 创建（基于确认的大纲）─────────────────────────────

class CreateFromOutlineRequest(BaseModel):
    outline: dict
    language: str = "cn"
    search: int = 1


def _outline_to_query(outline: dict) -> str:
    """将大纲 JSON 拼接为讯飞 API 的 query 字符串"""
    title = outline.get("title", "")
    desc = outline.get("description", "")
    pages = outline.get("pages", [])

    parts = [f"主题：{title}"]
    if desc:
        parts.append(f"简介：{desc}")

    sections = []
    for page in pages:
        page_title = page.get("title", "")
        kp = page.get("keyPoints", [])
        if page.get("type") == "cover":
            sections.append(f"封面：{page_title}")
        elif page.get("type") == "summary":
            sections.append(f"总结：{page_title}。要点：{'、'.join(kp)}")
        else:
            sections.append(f"第{page.get('id', '')}部分 {page_title}：{'；'.join(kp)}")

    if sections:
        parts.append("内容结构：" + " | ".join(sections))

    return "\n".join(parts)


@router.post("/create-from-outline")
async def create_from_outline(
    req: CreateFromOutlineRequest,
    current_user: User = Depends(get_current_user),
):
    """Stage 2: 基于用户确认的大纲生成 PPT"""
    if not req.outline.get("title"):
        raise HTTPException(status_code=400, detail="大纲标题不能为空")

    base_query = _outline_to_query(req.outline)
    profile_ctx = await _build_profile_context(current_user.id)
    full_query = base_query
    if profile_ctx:
        full_query += f"\n\n{profile_ctx}"

    # --- 尝试讯飞 API ---
    if ppt_service.available:
        try:
            result = await ppt_service.create_ppt(query=full_query, search=req.search)
            # 保存记录
            async with async_session() as session:
                record = PPTRecord(
                    user_id=current_user.id,
                    title=req.outline.get("title", "PPT"),
                    outline=req.outline,
                    source="xfyun",
                    task_id=result.get("sid", ""),
                )
                session.add(record)
                await session.commit()
                await session.refresh(record)
                result["record_id"] = record.id
            logger.info("讯飞 PPT API 调用成功，记录 ID: %s", record.id)
            return result
        except Exception as e:
            logger.warning("讯飞 PPT API 失败，降级本地生成: %s", e)
    else:
        logger.info("讯飞 PPT API 未配置，使用本地生成")

    # --- 降级：本地生成 ---
    try:
        from services.local_ppt_service import create_local_task
        task_id = create_local_task(full_query, req.language)
        # 保存记录
        async with async_session() as session:
            record = PPTRecord(
                user_id=current_user.id,
                title=req.outline.get("title", "PPT"),
                outline=req.outline,
                source="local",
                task_id=task_id,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
        return {"sid": task_id, "code": 0, "local": True, "record_id": record.id}
    except Exception as e:
        logger.error("本地 PPT 生成失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PPT 生成失败: {e}")


# ── 兼容旧接口 ──────────────────────────────────────────────────────

@router.post("/create")
async def create_ppt(
    req: PPTRequest,
    current_user: User = Depends(get_current_user),
):
    """兼容旧接口 — 直接传 query 生成 PPT"""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="PPT 主题不能为空")

    profile_ctx = await _build_profile_context(current_user.id)
    full_query = req.query.strip()
    if profile_ctx:
        full_query += f"\n\n{profile_ctx}"

    if ppt_service.available:
        try:
            result = await ppt_service.create_ppt(query=full_query, search=req.search)
            async with async_session() as session:
                record = PPTRecord(
                    user_id=current_user.id,
                    title=req.query.strip()[:50],
                    outline={},
                    source="xfyun",
                    task_id=result.get("sid", ""),
                )
                session.add(record)
                await session.commit()
                await session.refresh(record)
                result["record_id"] = record.id
            return result
        except Exception as e:
            logger.warning("讯飞 PPT API 失败，降级本地: %s", e)
    else:
        logger.info("讯飞 PPT API 未配置，使用本地生成")

    try:
        from services.local_ppt_service import create_local_task
        task_id = create_local_task(full_query, req.language)
        async with async_session() as session:
            record = PPTRecord(
                user_id=current_user.id,
                title=req.query.strip()[:50],
                outline={},
                source="local",
                task_id=task_id,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
        return {"sid": task_id, "code": 0, "local": True, "record_id": record.id}
    except Exception as e:
        logger.error("本地 PPT 生成失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PPT 生成失败: {e}")


# ── Progress / Download ─────────────────────────────────────────────

@router.get("/progress")
async def query_progress(
    sid: str,
    current_user: User = Depends(get_current_user),
):
    """查询 PPT 生成进度"""
    if not sid:
        raise HTTPException(status_code=400, detail="sid 不能为空")

    if not sid.startswith("sid_"):
        from services.local_ppt_service import get_local_task
        task = get_local_task(sid)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        return {
            "code": 0,
            "progress": task["progress"],
            "pptStatus": task["status"],
            "fileUrl": "",
            "local": True,
            "error": task.get("error", ""),
            "_raw": task,
        }

    try:
        result = await ppt_service.query_progress(sid)
        return result
    except RuntimeError as e:
        logger.error("PPT 进度查询失败: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{task_id}")
async def download_local_ppt(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """下载本地生成的 PPT 文件"""
    from services.local_ppt_service import get_local_task
    task = get_local_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    if task["status"] != "done":
        raise HTTPException(status_code=400, detail="文件尚未生成完成")

    filepath = task["file_path"]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=filepath,
        filename=f"AI_{task.get('title', task_id)}.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
