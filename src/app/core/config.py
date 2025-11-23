from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application runtime configuration."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = Field(default="dev", validation_alias="ENV")
    api_title: str = Field(default="BusCorunaMayores", validation_alias="API_TITLE")
    default_stop_id: int = Field(default=42, validation_alias="DEFAULT_STOP_ID")
    stops_source_url: AnyHttpUrl = Field(
        default="https://itranvias.com/queryitr_v3.php?dato=20160101T000000_gl_0_20160101T000000&func=7",
        validation_alias="STOPS_SOURCE_URL",
    )
    arrivals_url_template: str = Field(
        default="https://itranvias.com/queryitr_v3.php?func=0&dato={stop_id}",
        validation_alias="ARRIVALS_URL_TEMPLATE",
    )
    cache_ttl_seconds: int = Field(default=0, validation_alias="CACHE_TTL_SECONDS")
    http_timeout_seconds: float = Field(default=8.0, validation_alias="HTTP_TIMEOUT_SECONDS")
    cors_origins: str = Field(default="*", validation_alias="CORS_ORIGINS")
    request_id_header: str = Field(default="X-Request-ID")
    app_config_path: str = Field(
        default="config/app_config.json", validation_alias="APP_CONFIG_PATH"
    )
    root_path: str = Field(default="", validation_alias="ROOT_PATH")

    @property
    def allowed_origins(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
