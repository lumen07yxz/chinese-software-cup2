from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000

    database_url: str = "sqlite+aiosqlite:///app.db"
    redis_url: str = "redis://localhost:6379/0"
    chroma_url: str = "http://localhost:8001"

    spark_app_id: str = ""
    spark_api_key: str = ""
    spark_api_secret: str = ""
    spark_embedding_url: str = "https://emb-cn-huabei-1.xf-yun.com/"
    spark_api_url: str = "wss://spark-api.xf-yun.com/v1.1/chat"
    spark_rest_url: str = "https://spark-api-open.xf-yun.com/agent/v1/chat/completions"

    # 讯飞 AI PPT 生成 WebAPI
    ppt_app_id: str = ""
    ppt_api_secret: str = ""

    # 讯飞超拟人数字人交互 WebAPI
    digital_human_app_id: str = ""
    digital_human_api_key: str = ""
    digital_human_api_secret: str = ""
    digital_human_avatar_id: str = "cnrn9jgi2000000005"  # 诗雅
    digital_human_ws_url: str = "wss://sparkos.xfyun.cn/v1/openapi/chat"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"

    # CORS 允许的源（逗号分隔）
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 多模态视觉模型（拍照搜题/图片理解）
    # 兼容 OpenAI 格式的 API 均可：讯飞 Spark 4.0 Ultra、通义千问 VL、百度文心、
    # 智谱 GLM-4V、DeepSeek VL、本地 Ollama 等
    vision_api_url: str = ""
    vision_api_key: str = ""
    vision_model: str = ""

    # 讯飞图片理解（WebSocket v2.1）
    image_understanding_api_url: str = ""
    image_understanding_api_key: str = ""
    image_understanding_api_secret: str = ""
    image_understanding_api_app_id: str = ""

    # JWT 认证配置
    jwt_secret_key: str = "change-me-in-production-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24 小时

    # 星火知识库 (ChatDoc)
    spark_kb_enabled: bool = True
    spark_kb_app_id: str = ""
    spark_kb_app_secret: str = ""
    spark_kb_repo_id: str = ""  # 默认知识库 ID（可选，留空自动创建）

    # 豆包 Embedding API（星火失败时的备用向量化模型）
    doubao_api_key: str = ""
    doubao_embed_url: str = "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal"
    doubao_embed_model: str = "doubao-embedding-vision-251215"


settings = Settings()
