"""PeriNest Queen 核心配置。

所有配置通过环境变量注入，前缀 PERINEST_Q_，启动时加载 .env 文件。
版本号单一源：仓库根目录 VERSION 文件（见 /CHANGELOG.md 发版流程）。
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 仓库根 = queen/app/core/config.py 上溯 3 级
_REPO_ROOT = Path(__file__).resolve().parents[3]


def read_repo_version() -> str:
    """读根 VERSION 文件；读不到（如打包部署）则回退内置版本。"""
    try:
        return (_REPO_ROOT / "VERSION").read_text(encoding="utf-8").strip()
    except OSError:
        return "0.1.0"



class QueenSettings(BaseSettings):
    """Queen 全局配置。环境变量格式：PERINEST_Q_<FIELD>，如 PERINEST_Q_DB_HOST。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="PERINEST_Q_",
        case_sensitive=True,
        extra="ignore",
    )

    # ---- 应用元信息 ----
    APP_NAME: str = "PeriNest Queen"
    APP_VERSION: str = read_repo_version()  # 唯一版本源：根 VERSION 文件，可用环境变量覆盖
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # ---- Core 腺体 (MySQL 8) ----
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_USER: str = "perinest"
    DB_PASSWORD: str = "change_me"
    DB_NAME: str = "perinest_db"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False

    # ---- Nectar 花蜜 (Redis 8，向量投影用 Vector Sets) ----
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # ---- Carapace 加密 (JWT) ----
    SECRET_KEY: str = "change_me_in_prod"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ---- Antenna (微信小程序) ----
    WX_APPID: str = ""
    WX_SECRET: str = ""

    # ---- Nerve 神经索 (AI 网关，OpenAI 兼容多 provider) ----
    # 任何 OpenAI 兼容服务均可：DeepSeek/Kimi/Qwen/Ollama/vLLM...
    # AI_API_KEY 留空时自动进入 mock 模式（返回模拟流，demo/CI 零成本可跑）
    AI_API_BASE: str = "https://api.deepseek.com/v1"
    AI_API_KEY: str = ""
    AI_MODEL: str = "deepseek-chat"
    AI_TIMEOUT_SECONDS: int = 60
    AI_MOCK: bool = False  # 显式开启 mock；未配 key 时隐式生效

    # ---- Cercus 尾须 (企微私域，未配自动禁用——demo 零成本) ----
    WECOM_CORP_ID: str = ""
    WECOM_CORP_SECRET: str = ""
    WECOM_AGENT_ID: int = 0
    WECOM_TOKEN: str = ""  # 回调验签 token
    WECOM_ENCODING_AES_KEY: str = ""  # 回调加解密 key（43 字符）

    @property
    def wecom_enabled(self) -> bool:
        return bool(self.WECOM_CORP_ID and self.WECOM_CORP_SECRET and self.WECOM_AGENT_ID)

    # ---- Crop 嗦囊 (RAG 知识库 embedding，OpenAI 兼容) ----
    # 与 Nerve 同哲学：EMBEDDING_API_KEY 留空自动 mock（哈希伪向量，
    # demo/CI 零成本跑真实检索链路）
    EMBEDDING_API_BASE: str = "https://api.deepseek.com/v1"
    EMBEDDING_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-v3"
    EMBEDDING_DIM: int = 1536
    EMBEDDING_TIMEOUT_SECONDS: int = 60
    EMBEDDING_MOCK: bool = False

    @property
    def ai_mock_enabled(self) -> bool:
        return self.AI_MOCK or not self.AI_API_KEY

    @property
    def embedding_mock_enabled(self) -> bool:
        return self.EMBEDDING_MOCK or not self.EMBEDDING_API_KEY

    # ---- Pheromone (Celery broker，默认复用 Redis) ----
    CELERY_BROKER_URL: str = "redis://127.0.0.1:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://127.0.0.1:6379/2"

    # ---- CORS ----
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    @property
    def db_url(self) -> str:
        """异步 MySQL 连接串 (aiomysql driver)。"""
        return (
            f"mysql+aiomysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> QueenSettings:
    """单例配置，避免重复解析 .env。"""
    return QueenSettings()


settings = get_settings()
