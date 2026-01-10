"""
Configuration settings using Pydantic Settings
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


def _is_docker() -> bool:
    return os.path.exists("/.dockerenv") or bool(os.environ.get("DOCKER"))


IS_DOCKER = _is_docker()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    # IPQS
    ipqs_api_key: str | None = Field(default=None, alias="IPQS_API_KEY")
    ipqs_domain: str = Field(default="indeed.com", alias="IPQS_DOMAIN")

    # PostgreSQL
    postgres_host: str = Field(default="db", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str = Field(default="ipqs", alias="POSTGRES_USER")
    postgres_password: str = Field(default="ipqs_secret", alias="POSTGRES_PASSWORD")
    postgres_db: str = Field(default="ipqs_checker", alias="POSTGRES_DB")

    # Admin
    admin_password: str = Field(default="admin123", alias="ADMIN_PASSWORD")
    admin_token_secret: str = Field(default="change_me_secret_key_here", alias="ADMIN_TOKEN_SECRET")
    admin_token: str = Field(default="", alias="ADMIN_TOKEN")  # Legacy

    # Server
    port: int = Field(default=8000, alias="PORT")
    workers: int = Field(default=1, alias="WORKERS")

    @property
    def effective_host(self) -> str:
        return self.postgres_host if IS_DOCKER else "127.0.0.1"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.effective_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


SETTINGS = get_settings()
