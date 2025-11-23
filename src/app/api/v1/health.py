from fastapi import APIRouter, Query, Request

from app.models.common import HealthResponse, SumResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    version = request.app.version or "0.0.0"
    return HealthResponse(version=str(version))


@router.get("/sum", response_model=SumResponse)
async def sum_numbers(
    a: int = Query(..., description="Primer sumando"),
    b: int = Query(..., description="Segundo sumando"),
) -> SumResponse:
    return SumResponse(result=a + b)
