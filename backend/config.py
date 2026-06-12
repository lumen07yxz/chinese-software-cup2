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
    spark_api_url: str = "wss://spark-api.xf-yun.com/v1.1/chat"
    spark_rest_url: str = "https://spark-api.xf-yun.com/v1.1/chat"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"

    # JWT 认证配置
    jwt_secret_key: str = "change-me-in-production-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24 小时


settings = Settings()
