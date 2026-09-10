from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables prefixed with PP_."""

    model_config = SettingsConfigDict(env_prefix="PP_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    github_token: SecretStr | None = None

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
