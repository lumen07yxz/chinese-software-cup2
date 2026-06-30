"""认证 API —— 注册、登录、找回密码、修改密码、密保设置"""

import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from db import async_session
from models import User
from auth import hash_password, verify_password, create_access_token, get_current_user
from rate_limit import login_limiter, forgot_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_一-鿿]{2,20}$")
_PASSWORD_DIGIT_RE = re.compile(r"\d")
_PASSWORD_LETTER_RE = re.compile(r"[a-zA-Z]")


# ── Pydantic 请求模型 ─────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: str = ""
    security_question: str = ""
    security_answer: str = ""

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
        if not _PASSWORD_DIGIT_RE.search(v):
            raise ValueError("密码需包含至少一个数字")
        if not _PASSWORD_LETTER_RE.search(v):
            raise ValueError("密码需包含至少一个字母")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        return v.strip()


class VerifyUsernameRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        return v.strip()


class ForgotPasswordRequest(BaseModel):
    step: str  # "get_question" | "verify_and_reset"
    username: str
    answer: str = ""
    new_password: str = ""

    @field_validator("step")
    @classmethod
    def validate_step(cls, v: str) -> str:
        if v not in ("get_question", "verify_and_reset"):
            raise ValueError("step 必须为 get_question 或 verify_and_reset")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        return v.strip()


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 4 or len(v) > 20:
            raise ValueError("新密码长度需在 4-20 位之间")
        if not _PASSWORD_DIGIT_RE.search(v):
            raise ValueError("新密码需包含至少一个数字")
        if not _PASSWORD_LETTER_RE.search(v):
            raise ValueError("新密码需包含至少一个字母")
        return v


class SetSecurityQuestionRequest(BaseModel):
    question: str
    answer: str

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 128:
            raise ValueError("密保问题长度需在 2-128 位之间")
        return v

    @field_validator("answer")
    @classmethod
    def validate_answer(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 128:
            raise ValueError("密保答案长度需在 1-128 位之间")
        return v


# ── 端点 ──────────────────────────────────────────────────────────────


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

        # 可选：注册时设置密保
        if req.security_question and req.security_answer:
            user.security_question = req.security_question.strip()
            user.security_answer = hash_password(req.security_answer.strip().lower())

        session.add(user)
        await session.commit()

        token = create_access_token({"sub": user.username})
        return {
            "token": token,
            "user": {"username": user.username, "nickname": user.nickname},
        }


@router.post("/login")
async def login(req: LoginRequest):
    """用户登录（支持记住我 + 限流）"""
    # 限流检查
    if login_limiter.is_locked_out(req.username):
        remaining = login_limiter.get_remaining_seconds(req.username)
        raise HTTPException(
            status_code=429,
            detail=f"登录尝试过多，请 {int(remaining)} 秒后重试",
        )

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == req.username)
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.hashed_password):
            login_limiter.record_failure(req.username)
            count = len(login_limiter._failures.get(req.username, []))
            remaining = login_limiter.get_remaining_seconds(req.username)
            detail = "用户名或密码错误"
            if count >= login_limiter.max_attempts:
                detail = f"登录尝试过多，请 {int(remaining)} 秒后重试"
            elif count >= 3:
                detail = f"用户名或密码错误（剩余 {login_limiter.max_attempts - count} 次机会）"
            raise HTTPException(status_code=401, detail=detail)

        login_limiter.record_success(req.username)

        # remember_me → 7 天，否则 24 小时
        expires = timedelta(days=7) if req.remember_me else None
        token = create_access_token({"sub": user.username}, expires_delta=expires)
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


@router.post("/verify-username")
async def verify_username(req: VerifyUsernameRequest):
    """实时检查用户名是否可用"""
    username = req.username.strip()
    if not _USERNAME_RE.match(username):
        return {"available": False, "message": "用户名格式不正确"}

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == username)
        )
        exists = result.scalar_one_or_none() is not None
    if exists:
        return {"available": False, "message": "用户名已存在"}
    return {"available": True}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """找回密码 —— 分步式：获取密保问题 → 验证答案并重置"""
    # 限流检查
    if forgot_limiter.is_locked_out(req.username):
        remaining = forgot_limiter.get_remaining_seconds(req.username)
        raise HTTPException(
            status_code=429,
            detail=f"操作过于频繁，请 {int(remaining)} 秒后重试",
        )

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == req.username)
        )
        user = result.scalar_one_or_none()

    # 用户不存在或未设置密保 → 统一错误信息（防用户枚举）
    if not user or not user.security_question:
        forgot_limiter.record_failure(req.username)
        raise HTTPException(status_code=400, detail="用户名或答案不正确")

    if req.step == "get_question":
        return {"question": user.security_question}

    if req.step == "verify_and_reset":
        if not req.answer or not req.new_password:
            raise HTTPException(status_code=400, detail="请提供答案和新密码")

        # 验证答案
        if not verify_password(req.answer.strip().lower(), user.security_answer):
            forgot_limiter.record_failure(req.username)
            raise HTTPException(status_code=400, detail="用户名或答案不正确")

        # 密码策略校验
        if len(req.new_password) < 4 or len(req.new_password) > 20:
            raise HTTPException(status_code=400, detail="密码长度需在 4-20 位之间")
        if not _PASSWORD_DIGIT_RE.search(req.new_password):
            raise HTTPException(status_code=400, detail="密码需包含至少一个数字")
        if not _PASSWORD_LETTER_RE.search(req.new_password):
            raise HTTPException(status_code=400, detail="密码需包含至少一个字母")

        # 重置密码
        forgot_limiter.record_success(req.username)
        async with async_session() as session:
            result = await session.execute(
                select(User).where(User.username == req.username)
            )
            user = result.scalar_one()
            user.hashed_password = hash_password(req.new_password)
            await session.commit()

        return {"success": True, "message": "密码已重置，请使用新密码登录"}

    raise HTTPException(status_code=400, detail="无效的 step 参数")


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    """已登录用户修改密码"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.id == current_user.id)
        )
        user = result.scalar_one()

        if not verify_password(req.old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="旧密码不正确")

        user.hashed_password = hash_password(req.new_password)
        await session.commit()

    return {"success": True, "message": "密码修改成功"}


@router.post("/set-security-question")
async def set_security_question(
    req: SetSecurityQuestionRequest,
    current_user: User = Depends(get_current_user),
):
    """已登录用户设置/修改密保问题"""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.id == current_user.id)
        )
        user = result.scalar_one()
        user.security_question = req.question
        user.security_answer = hash_password(req.answer.strip().lower())
        await session.commit()

    return {"success": True, "message": "密保问题设置成功"}
