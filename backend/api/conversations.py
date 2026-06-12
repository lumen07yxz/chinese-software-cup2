"""对话管理 API —— 创建、列表、删除历史对话"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete

from db import async_session
from models import User, Conversation, ConversationMessage
from auth import get_current_user

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class CreateConversationRequest(BaseModel):
    title: str = "新对话"


@router.get("/")
async def list_conversations(current_user: User = Depends(get_current_user)):
    """获取当前用户的对话列表"""
    async with async_session() as session:
        result = await session.execute(
            select(Conversation)
            .where(Conversation.user_id == current_user.username)
            .order_by(Conversation.updated_at.desc())
            .limit(50)
        )
        conversations = result.scalars().all()
        return {
            "conversations": [
                {
                    "id": c.id,
                    "title": c.title,
                    "created_at": c.created_at.isoformat() if c.created_at else "",
                    "updated_at": c.updated_at.isoformat() if c.updated_at else "",
                }
                for c in conversations
            ]
        }


@router.post("/")
async def create_conversation(
    req: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
):
    """创建新对话"""
    async with async_session() as session:
        conversation = Conversation(
            user_id=current_user.username,
            title=req.title,
        )
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)
        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat() if conversation.created_at else "",
        }


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
):
    """获取对话的所有消息"""
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv or conv.user_id != current_user.username:
            raise HTTPException(status_code=404, detail="对话不存在")
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.created_at)
        )
        messages = result.scalars().all()
        return {
            "messages": [
                {"role": m.role, "content": m.content}
                for m in messages
            ]
        }


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除对话及其所有消息"""
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv or conv.user_id != current_user.username:
            raise HTTPException(status_code=404, detail="对话不存在")
        # 删除消息（SQLite async 需用 delete() 而非 select().delete()）
        await session.execute(
            delete(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation_id
            )
        )
        await session.delete(conv)
        await session.commit()
        return {"status": "deleted"}
