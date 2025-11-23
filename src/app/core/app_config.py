from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from app.core.config import get_settings


class AppConfig(BaseModel):
    primary_stop_id: int = 42
    interest_lines: list[str] = Field(default_factory=lambda: ["3", "3A", "12", "14"])


@lru_cache
def load_app_config() -> AppConfig:
    settings = get_settings()
    path = Path(settings.app_config_path)
    if path.exists():
        data = json.loads(path.read_text())
        return AppConfig(**data)
    return AppConfig()
