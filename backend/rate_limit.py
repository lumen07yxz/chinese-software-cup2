"""内存级登录限流器 —— 无需 Redis，适用于单进程 FastAPI 部署"""

import time
from collections import defaultdict


class LoginRateLimiter:
    """基于滑动窗口的登录失败限流器。

    默认策略：同一用户名 15 分钟内失败 5 次后锁定，直到窗口滑过。
    """

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: float = 900,  # 15 分钟
    ):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # username → [timestamp, ...]
        self._failures: dict[str, list[float]] = defaultdict(list)

    def _prune(self, username: str) -> None:
        """清理过期记录"""
        cutoff = time.time() - self.window_seconds
        self._failures[username] = [
            t for t in self._failures[username] if t > cutoff
        ]

    def record_failure(self, username: str) -> int:
        """记录一次失败，返回当前窗口内失败次数"""
        self._prune(username)
        self._failures[username].append(time.time())
        return len(self._failures[username])

    def record_success(self, username: str) -> None:
        """登录成功，清除失败记录"""
        self._failures.pop(username, None)

    def is_locked_out(self, username: str) -> bool:
        """是否已被锁定"""
        self._prune(username)
        return len(self._failures[username]) >= self.max_attempts

    def get_remaining_seconds(self, username: str) -> float:
        """返回锁定剩余秒数（0 表示未锁定）"""
        self._prune(username)
        attempts = self._failures[username]
        if len(attempts) < self.max_attempts:
            return 0.0
        oldest_in_window = attempts[0]
        remaining = self.window_seconds - (time.time() - oldest_in_window)
        return max(0.0, remaining)


# 登录限流：5 次 / 15 分钟
login_limiter = LoginRateLimiter(max_attempts=5, window_seconds=900)

# 找回密码限流：3 次 / 10 分钟
forgot_limiter = LoginRateLimiter(max_attempts=3, window_seconds=600)
