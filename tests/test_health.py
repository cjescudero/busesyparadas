from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "version" in payload


def test_sum_endpoint() -> None:
    response = client.get("/sum", params={"a": 5, "b": 7})
    assert response.status_code == 200
    assert response.json()["result"] == 12
