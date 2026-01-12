from pydantic import BaseModel, Field


class StopSummary(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    lines: list[int] = Field(default_factory=list)


class StopSearchResponse(BaseModel):
    total: int
    stops: list[StopSummary]


class ArrivalBus(BaseModel):
    bus_id: int
    eta_minutes: int | None = None
    distance_meters: int | None = None
    status: int | None = None
    last_stop_id: int | None = None


class LineArrivals(BaseModel):
    line_id: int
    line_name: str | None = None
    color_hex: str | None = None
    buses: list[ArrivalBus]
    is_ida: bool = Field(default=False, description="True si la parada es de ida (se aleja de casa), False si es vuelta")


class ArrivalsResponse(BaseModel):
    stop_id: int
    lines: list[LineArrivals]
