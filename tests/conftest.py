from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.transit import ArrivalBus, ArrivalsResponse, LineArrivals, StopSummary
from app.services.transit import TransitService, get_transit_service


class FakeTransitService(TransitService):
    def __init__(self) -> None:  # pragma: no cover - simple data wiring
        self.stop = StopSummary(
            id=42,
            name="Emilio Gonzalez Lopez",
            latitude=43.374,
            longitude=-8.432,
            lines=[3, 12, 14],
        )
        self.arrivals = ArrivalsResponse(
            stop_id=42,
            lines=[
                LineArrivals(
                    line_id=3,
                    line_name="Línea 3",
                    color_hex="#C0910F",
                    buses=[
                        ArrivalBus(bus_id=301, eta_minutes=2, distance_meters=350),
                        ArrivalBus(bus_id=302, eta_minutes=9, distance_meters=1200),
                    ],
                )
            ],
        )

    async def search_stops(self, query: str | None, limit: int = 8):
        if query and query.lower() not in self.stop.name.lower():
            return []
        return [self.stop][:limit]

    async def get_stop(self, stop_id: int):
        return self.stop if stop_id == self.stop.id else None

    async def get_arrivals(self, stop_id: int):
        return self.arrivals


@pytest.fixture()
def fake_service() -> FakeTransitService:
    return FakeTransitService()


@pytest.fixture(autouse=True)
def override_transit_service(fake_service: FakeTransitService) -> Generator[None, None, None]:
    app.dependency_overrides[get_transit_service] = lambda: fake_service
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def client(fake_service: FakeTransitService) -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"
