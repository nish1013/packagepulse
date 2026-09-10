from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PP_", env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    env: Literal["development", "test", "production"] = "development"
    github_token: SecretStr | None = None
    signing_secret: SecretStr | None = None
    signing_secret_previous: SecretStr | None = None
    package_requests_per_minute: int = Field(default=30, ge=1)
    scans_per_10_minutes: int = Field(default=4, ge=1)
    streams_per_client: int = Field(default=2, ge=1)
    concurrent_scans: int = Field(default=6, ge=1)

    @model_validator(mode="after")
    def check_signing_secrets(self) -> Self:
        if self.is_production and self.signing_secret is None:
            raise ValueError("PP_SIGNING_SECRET is required in production")
        if any(len(secret) < MIN_SECRET_LENGTH for secret in self.signing_secrets):
            raise ValueError(f"signing secrets must be at least {MIN_SECRET_LENGTH} characters")
        return self

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def signing_secrets(self) -> tuple[str, ...]:
        return tuple(
            secret.get_secret_value()
            for secret in (self.signing_secret, self.signing_secret_previous)
            if secret is not None
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
