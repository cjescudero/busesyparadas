from importlib import metadata
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1 import health, transit
from app.core import errors
from app.core.app_config import load_app_config
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.middleware import RequestIdMiddleware
from app.services.transit import TransitService, get_transit_service

setup_logging()
settings = get_settings()
app_config = load_app_config()

try:
    app_version = metadata.version("busesyparadas")
except metadata.PackageNotFoundError:
    app_version = "0.1.0"

app = FastAPI(title=settings.api_title, version=app_version)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(transit.router)

app.add_exception_handler(StarletteHTTPException, errors.http_exception_handler)
app.add_exception_handler(RequestValidationError, errors.validation_exception_handler)
app.add_exception_handler(Exception, errors.unhandled_exception_handler)

TEMPLATES_DIR = Path(__file__).parent / "frontend" / "templates"
STATIC_DIR = Path(__file__).parent / "frontend" / "static"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    service: TransitService = Depends(get_transit_service),
) -> HTMLResponse:
    primary_stop_id = app_config.primary_stop_id
    default_stop = await service.get_stop(primary_stop_id)
    context = {
        "request": request,
        "default_stop": default_stop,
        "primary_stop_id": primary_stop_id,
    }
    return templates.TemplateResponse("index.html", context)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon_redirect() -> FileResponse:
    return FileResponse(STATIC_DIR / "favicon-64.png", media_type="image/png")


@app.get("/manifest.webmanifest", include_in_schema=False)
async def manifest() -> FileResponse:
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js", include_in_schema=False)
async def service_worker() -> FileResponse:
    return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")
