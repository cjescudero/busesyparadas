from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.transit import ArrivalsResponse, StopSearchResponse, StopSummary
from app.services.transit import TransitService, TransitServiceError, get_transit_service

router = APIRouter(prefix="/api", tags=["transit"])


@router.get("/stops", response_model=StopSearchResponse)
async def search_stops(
    q: str | None = Query(None, description="Fragmento del nombre de la parada"),
    limit: int = Query(50, ge=1, le=400),
    service: TransitService = Depends(get_transit_service),
) -> StopSearchResponse:
    stops = await service.search_stops(q, limit=limit)
    return StopSearchResponse(total=len(stops), stops=stops)


@router.get("/stops/{stop_id}", response_model=StopSummary)
async def get_stop_details(
    stop_id: int,
    service: TransitService = Depends(get_transit_service),
) -> StopSummary:
    stop = await service.get_stop(stop_id)
    if not stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stop_not_found")
    return stop


@router.get("/stops/{stop_id}/arrivals", response_model=ArrivalsResponse)
async def get_stop_arrivals(
    stop_id: int,
    service: TransitService = Depends(get_transit_service),
) -> ArrivalsResponse:
    stop = await service.get_stop(stop_id)
    if not stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stop_not_found")

    try:
        return await service.get_arrivals(stop_id)
    except TransitServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
