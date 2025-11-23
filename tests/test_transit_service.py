import pytest

from app.core.config import Settings
from app.services.transit import TransitService, TransitServiceError

STOPS_PAYLOAD = {
    "iTranvias": {
        "actualizacion": {
            "paradas": [
                {
                    "id": 42,
                    "nombre": "Demo Stop",
                    "posx": -8.4,
                    "posy": 43.37,
                    "enlaces": [3, "12"],
                },
                {
                    "id": 7,
                    "nombre": "Other",
                    "posx": -8.3,
                    "posy": 43.3,
                    "enlaces": [99],
                },
            ],
            "lineas": [
                {"id": 14, "lin_comer": "14", "color": "982135"},
                {"id": 3, "lin_comer": "3", "color": "C0910F"},
            ],
        }
    }
}

ARRIVALS_PAYLOAD = {
    "buses": {
        "lineas": [
            {
                "linea": "14",
                "buses": [
                    {
                        "bus": "1002",
                        "tiempo": "12",
                        "distancia": "500",
                        "estado": "0",
                        "ult_parada": "12",
                    },
                    {
                        "bus": "1001",
                        "tiempo": "3",
                        "distancia": "120",
                        "estado": "0",
                        "ult_parada": "13",
                    },
                ],
            },
            {
                "linea": "3",
                "buses": [
                    {
                        "bus": "2001",
                        "tiempo": "----",
                        "distancia": "3000",
                        "estado": "1",
                        "ult_parada": "90",
                    }
                ],
            },
        ]
    }
}


@pytest.fixture()
def service_settings() -> Settings:
    return Settings(
        stops_source_url="https://example.com/stops",
        arrivals_url_template="https://example.com/arrivals?stop={stop_id}",
        cache_ttl_seconds=60,
    )


@pytest.mark.anyio("asyncio")
async def test_search_stops_uses_cache(monkeypatch, service_settings: Settings) -> None:
    calls = {"count": 0}

    async def fake_fetch(self, url):  # type: ignore[override]
        calls["count"] += 1
        return STOPS_PAYLOAD

    monkeypatch.setattr(TransitService, "_fetch_json", fake_fetch)
    service = TransitService(settings=service_settings)

    first = await service.search_stops(None)
    assert first[0].name == "Demo Stop"
    assert len(first) == 1

    second = await service.search_stops("demo")
    assert second
    assert calls["count"] == 1


@pytest.mark.anyio("asyncio")
async def test_get_arrivals_orders_buses(monkeypatch, service_settings: Settings) -> None:
    async def fake_fetch(self, url):  # type: ignore[override]
        target = str(url)
        if "func=7" in target:
            return STOPS_PAYLOAD
        return ARRIVALS_PAYLOAD

    monkeypatch.setattr(TransitService, "_fetch_json", fake_fetch)
    service = TransitService(settings=service_settings)

    arrivals = await service.get_arrivals(42)
    assert arrivals.lines[0].line_id == 14
    assert arrivals.lines[0].line_name == "14"
    assert arrivals.lines[0].color_hex == "#982135"
    first_bus = arrivals.lines[0].buses[0]
    assert first_bus.bus_id == 1001
    assert first_bus.eta_minutes == 3
    assert arrivals.lines[1].buses[0].eta_minutes is None


@pytest.mark.anyio("asyncio")
async def test_catalog_fallback_when_source_unavailable(
    monkeypatch, service_settings: Settings
) -> None:
    async def failing_fetch(self, url):  # type: ignore[override]
        raise TransitServiceError("boom")

    monkeypatch.setattr(TransitService, "_fetch_json", failing_fetch)
    service = TransitService(settings=service_settings)

    stops = await service.search_stops(None)
    assert stops[0].id == service_settings.default_stop_id
    assert stops[0].name.startswith("Parada")
