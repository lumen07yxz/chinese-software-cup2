"""智学后端启动脚本

用法：
    python run.py          # 生产模式启动
    python run.py --dev    # 开发模式（热重载）
"""

import sys
import os
import uvicorn

if __name__ == "__main__":
    dev = "--dev" in sys.argv

    print("=" * 50)
    print("智学 AI 个性化学习系统 - 后端服务器")
    print("=" * 50)
    print(f"模式：{'开发(热重载)' if dev else '生产'}")
    print(f"地址：http://0.0.0.0:8000")
    print(f"文档：http://localhost:8000/docs")
    print()

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=dev,
    )
