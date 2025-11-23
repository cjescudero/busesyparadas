import asyncio
import logging
from functools import lru_cache
from time import monotonic
from typing import Any

import httpx

from app.core.app_config import AppConfig, load_app_config
from app.core.config import Settings, get_settings
from app.models.transit import ArrivalBus, ArrivalsResponse, LineArrivals, StopSummary

logger = logging.getLogger(__name__)


class TransitServiceError(Exception):
    """Raised when the remote transit API cannot be reached or parsed."""


class TransitService:
    def __init__(
        self, settings: Settings | None = None, app_config: AppConfig | None = None
    ) -> None:
        self.settings = settings or get_settings()
        self.app_config = app_config or load_app_config()
        self._stops_cache: list[StopSummary] | None = None
        self._cache_expires_at: float = 0.0
        self._lock = asyncio.Lock()
        self._lines_info: dict[int, dict[str, str | None]] = {}
        self._interest_line_ids: set[int] = set()
        self._interest_line_names = {
            line.strip().lower() for line in self.app_config.interest_lines
        }
        self.primary_stop_id = self.app_config.primary_stop_id

    async def _fetch_json(self, url: str | Any) -> dict:
        target_url = str(url)
        try:
            async with httpx.AsyncClient(timeout=self.settings.http_timeout_seconds) as client:
                response = await client.get(target_url)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:  # pragma: no cover - network failure path
            logger.error("Transit API request failed", exc_info=exc, extra={"url": target_url})
            raise TransitServiceError("transit_api_unavailable") from exc

    async def _load_stops(self, force: bool = False) -> list[StopSummary]:
        now = monotonic()
        if not force and self._stops_cache and now < self._cache_expires_at:
            return self._stops_cache

        async with self._lock:
            if self._stops_cache and now < self._cache_expires_at and not force:
                return self._stops_cache

            try:
                payload = await self._fetch_json(self.settings.stops_source_url)
            except TransitServiceError:
                if self._stops_cache:
                    return self._stops_cache
                logger.warning("Falling back to placeholder stop catalog")
                self._stops_cache = [self._placeholder_stop()]
                self._lines_info = {}
                self._interest_line_ids = set()
                self._set_cache_expiry()
                return self._stops_cache

            actualizacion = payload.get("iTranvias", {}).get("actualizacion", {})
            stops_raw = actualizacion.get("paradas", [])
            stops = [self._map_stop(item) for item in stops_raw]
            lines_raw = actualizacion.get("lineas", [])
            self._lines_info = self._parse_line_info(lines_raw)
            self._stops_cache = stops
            self._set_cache_expiry()
            return stops

    @staticmethod
    def _map_stop(raw: dict) -> StopSummary:
        lines: list[int] = []
        for line in raw.get("enlaces", []):
            try:
                lines.append(int(line))
            except (TypeError, ValueError):
                continue
        return StopSummary(
            id=int(raw["id"]),
            name=str(raw.get("nombre", f"Parada {raw['id']}")),
            latitude=float(raw.get("posy", 0.0)),
            longitude=float(raw.get("posx", 0.0)),
            lines=lines,
        )

    def _placeholder_stop(self) -> StopSummary:
        stop_id = self.primary_stop_id
        return StopSummary(
            id=stop_id,
            name=f"Parada {stop_id}",
            latitude=0.0,
            longitude=0.0,
            lines=[],
        )

    def _parse_line_info(self, lines_raw: list[dict]) -> dict[int, dict[str, str | None]]:
        info: dict[int, dict[str, str | None]] = {}
        interest_ids: set[int] = set()
        for item in lines_raw:
            try:
                line_id = int(item["id"])
            except (TypeError, KeyError, ValueError):
                continue
            name = str(item.get("lin_comer") or line_id).strip()
            color = item.get("color")
            if color:
                color = color if color.startswith("#") else f"#{color.zfill(6)}"
            normalized = name.lower()
            info[line_id] = {"name": name, "name_lower": normalized, "color": color}
            if (
                normalized in self._interest_line_names
                or str(line_id).lower() in self._interest_line_names
            ):
                interest_ids.add(line_id)
        self._interest_line_ids = interest_ids
        return info

    def _set_cache_expiry(self) -> None:
        ttl = self.settings.cache_ttl_seconds
        if ttl and ttl > 0:
            self._cache_expires_at = monotonic() + ttl
        else:
            self._cache_expires_at = float("inf")

    async def search_stops(self, query: str | None, limit: int = 50) -> list[StopSummary]:
        stops = await self._load_stops()
        stops = self._filter_interest_stops(stops)
        if not query:
            return stops[:limit]

        normalized = query.strip().lower()
        if not normalized:
            return stops[:limit]

        results = [stop for stop in stops if normalized in stop.name.lower()]
        return results[:limit]

    def _filter_interest_stops(self, stops: list[StopSummary]) -> list[StopSummary]:
        if not self._interest_line_ids:
            return sorted(stops, key=lambda stop: stop.name)
        filtered: list[StopSummary] = []
        for stop in stops:
            filtered_stop = self._apply_interest_to_stop(stop)
            if filtered_stop.lines:
                filtered.append(filtered_stop)
        return sorted(filtered, key=lambda stop: stop.name)

    async def get_stop(self, stop_id: int) -> StopSummary | None:
        stops = await self._load_stops()
        stop = next((stop for stop in stops if stop.id == stop_id), None)
        if stop:
            return self._apply_interest_to_stop(stop)
        return None

    async def get_arrivals(self, stop_id: int) -> ArrivalsResponse:
        if not self._lines_info:
            await self._load_stops()
        url = self.settings.arrivals_url_template.format(stop_id=stop_id)
        payload = await self._fetch_json(url)
        lines_raw = payload.get("buses", {}).get("lineas", [])
        lines: list[LineArrivals] = []

        for line_item in lines_raw:
            line_id = self._safe_int(line_item.get("linea"))
            if line_id is None:
                continue
            line_meta = self._lines_info.get(line_id)
            # skip lines not in interest list
            if not self._is_interest_line(line_id, line_meta):
                continue

            buses_data = []
            for bus in line_item.get("buses", []):
                bus_id = self._safe_int(bus.get("bus"))
                if bus_id is None:
                    continue
                buses_data.append(
                    ArrivalBus(
                        bus_id=bus_id,
                        eta_minutes=self._safe_int(bus.get("tiempo")),
                        distance_meters=self._safe_int(bus.get("distancia")),
                        status=self._safe_int(bus.get("estado")),
                        last_stop_id=self._safe_int(bus.get("ult_parada")),
                    )
                )
            buses_data.sort(
                key=lambda item: item.eta_minutes if item.eta_minutes is not None else 10**9
            )
            lines.append(
                LineArrivals(
                    line_id=line_id,
                    line_name=line_meta["name"] if line_meta else None,
                    color_hex=line_meta["color"] if line_meta else None,
                    buses=buses_data,
                )
            )

        lines.sort(
            key=lambda item: (
                item.buses[0].eta_minutes
                if item.buses and item.buses[0].eta_minutes is not None
                else 10**9
            )
        )
        return ArrivalsResponse(stop_id=stop_id, lines=lines)

    def _is_interest_line(self, line_id: int, line_meta: dict[str, str | None] | None) -> bool:
        if not self._interest_line_names:
            return True
        if line_id in self._interest_line_ids:
            return True
        if str(line_id).lower() in self._interest_line_names:
            return True
        if line_meta and line_meta.get("name_lower") in self._interest_line_names:
            return True
        return False

    def _apply_interest_to_stop(self, stop: StopSummary) -> StopSummary:
        if not self._interest_line_ids:
            return stop
        stop.lines = [line_id for line_id in stop.lines if line_id in self._interest_line_ids]
        return stop

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


@lru_cache
def get_transit_service() -> TransitService:
    return TransitService()
