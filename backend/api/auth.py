"""认证 API —— 注册、登录、当前用户信息"""

import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from db import async_session
from models import User
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_一-鿿]{2,20}$")


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: str = ""

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("用户名需 2-20 位字母、数字、下划线或中文")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 4 or len(v) > 20:
            raise ValueError("密码长度需在 4-20 位之间")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        return v.strip()


@router.post("/register")
async def register(req: RegisterRequest):
    """用户注册"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == req.username)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="用户名已存在")

        user = User(
            username=req.username,
            hashed_password=hash_password(req.password),
            nickname=req.nickname or req.username,
        )
        session.add(user)
        await session.commit()

        token = create_access_token({"sub": user.username})
        return {
            "token": token,
            "user": {"username": user.username, "nickname": user.nickname},
        }


@router.post("/login")
async def login(req: LoginRequest):
    """用户登录"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == req.username)
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        token = create_access_token({"sub": user.username})
        return {
            "token": token,
            "user": {"username": user.username, "nickname": user.nickname},
        }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "user": {
            "username": current_user.username,
            "nickname": current_user.nickname,
        }
    }
