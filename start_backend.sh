#!/bin/bash
# 智学 · AI个性化学习系统 — 后端启动脚本

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$DIR/backend"

echo "============================================"
echo " 智学 · AI个性化学习系统 — 后端启动脚本"
echo "============================================"
echo

cd "$BACKEND"

# ---- 首次运行：初始化 .env ----
if [ ! -f ".env" ]; then
    echo "[INFO] 首次运行：正在从 .env.example 创建 .env ..."
    cp .env.example .env
    echo "[INFO] 已创建 backend/.env"
    echo "[INFO] ⚠ 请编辑 backend/.env 填入你的讯飞星火 API 凭证后再启动"
    echo
    echo "     需要设置以下变量："
    echo "       SPARK_APP_ID"
    echo "       SPARK_API_KEY"
    echo "       SPARK_API_SECRET"
    echo
    exit 1
fi

# ---- 安装/检查依赖 ----
echo "[INFO] 检查依赖..."
pip install -r requirements.txt

echo
echo "[INFO] 启动后端服务（http://localhost:8000）..."
echo
exec uvicorn main:app --reload --host 0.0.0.0 --port 8000
