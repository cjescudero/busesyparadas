from fastapi.testclient import TestClient


def test_search_stops_returns_default(client: TestClient, fake_service):
    response = client.get("/api/stops")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["stops"][0]["id"] == fake_service.stop.id


def test_search_stops_filters_by_query(client: TestClient):
    response = client.get("/api/stops", params={"q": "otro"})
    payload = response.json()
    assert payload["total"] == 0
    assert payload["stops"] == []


def test_stop_detail_and_arrivals(client: TestClient, fake_service):
    stop_id = fake_service.stop.id
    detail = client.get(f"/api/stops/{stop_id}")
    assert detail.status_code == 200
    assert detail.json()["lines"] == fake_service.stop.lines

    arrivals = client.get(f"/api/stops/{stop_id}/arrivals")
    assert arrivals.status_code == 200
    arrivals_payload = arrivals.json()
    assert arrivals_payload["stop_id"] == stop_id
    assert arrivals_payload["lines"][0]["line_id"] == fake_service.arrivals.lines[0].line_id
    assert arrivals_payload["lines"][0]["line_name"] == fake_service.arrivals.lines[0].line_name
    assert arrivals_payload["lines"][0]["color_hex"] == fake_service.arrivals.lines[0].color_hex


def test_stop_not_found_uses_custom_handler(client: TestClient):
    response = client.get("/api/stops/999")
    assert response.status_code == 404
    assert response.json()["code"] == 404


def test_index_template_renders_stop_name(client: TestClient, fake_service):
    response = client.get("/")
    assert response.status_code == 200
    assert fake_service.stop.name in response.text
