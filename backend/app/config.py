import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Jeeves AI Backend"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    openai_temperature: float = 0.2
    openai_max_retries: int = 2
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    database_path: str = "data/jeeves.db"
    auth_username: str = "admin"
    auth_password: str = "admin123"
    auth_session_secret: str = "jeeves-session-secret-change-me"
    auth_session_cookie_name: str = "jeeves_session"
    auth_session_max_age: int = 60 * 60 * 24 * 30
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str]:
        if value is None or value == "":
            return ["http://localhost:3000"]

        if isinstance(value, str):
            value = value.strip()
            if not value:
                return ["http://localhost:3000"]

            if value.startswith("["):
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("CORS_ORIGINS JSON value must be a list of strings.")
                return [str(origin).strip() for origin in parsed if str(origin).strip()]

            return [origin.strip() for origin in value.split(",") if origin.strip()]

        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]

        return value

    @field_validator("auth_cookie_samesite")
    @classmethod
    def validate_auth_cookie_samesite(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("AUTH_COOKIE_SAMESITE must be one of: lax, strict, none.")
        return normalized


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
