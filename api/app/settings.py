from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore")

    app_secret_key: str | None = None
    cookie_secure: bool = False
    database_url: str = "sqlite:///./competitoriq.db"
    redis_url: str = "redis://localhost:6379/0"
    tinyfish_api_key: str | None = None
    tinyfish_fetch_url: str = "https://api.fetch.tinyfish.ai"
    tinyfish_search_url: str = "https://api.search.tinyfish.ai"
    tinyfish_agent_url: str = "https://agent.tinyfish.ai/v1/automation"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4.1-mini"
    cors_origins: str = "http://localhost:3000"

    @property
    def tinyfish_configured(self) -> bool:
        return bool(self.tinyfish_api_key)

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()