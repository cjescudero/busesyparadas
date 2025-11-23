FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
WORKDIR /app
ENV PYTHONPATH=/app/src

COPY pyproject.toml uv.lock ./
RUN uv sync --all-groups --frozen || uv sync --all-groups

COPY src ./src

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
