@echo off
chcp 65001 >nul

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"

echo ============================================
echo  智学 · AI个性化学习系统 — 后端启动脚本
echo ============================================
echo.

cd /d "%BACKEND%"

rem ---- 首次运行：初始化 .env ----
if not exist ".env" (
    echo [INFO] 首次运行：正在从 .env.example 创建 .env ...
    copy .env.example .env >nul
    echo [INFO] 已创建 backend\.env
    echo [INFO] ⚠ 请编辑 backend\.env 填入你的讯飞星火 API 凭证后再启动
    echo.
    echo     需要设置以下变量：
	echo       SPARK_APP_ID
	echo       SPARK_API_KEY
	echo       SPARK_API_SECRET
    echo.
    pause
    exit /b
)

rem ---- 安装/检查依赖 ----
echo [INFO] 检查依赖...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] 依赖安装失败，请检查网络或 pip 配置
    pause
    exit /b
)

echo.
echo [INFO] 启动后端服务（http://localhost:8000）...
echo.
uvicorn main:app --reload --host 0.0.0.0 --port 8000

pause
