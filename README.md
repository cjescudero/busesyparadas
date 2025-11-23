# BusCorunaMayores

Aplicacion FastAPI pensada para personas mayores que muestra los proximos buses de una parada concreta en A Coruna.

## Requisitos
- Python 3.12+
- [uv](https://github.com/astral-sh/uv)

## Puesta en marcha
```bash
uv sync --all-groups
```

### Configuración funcional
El comportamiento visible para las personas usuarias se define en `config/app_config.json`:

```json
{
  "primary_stop_id": 42,
  "interest_lines": ["3", "3A", "12", "14"]
}
```

- **primary_stop_id**: parada destacada que se muestra al abrir la interfaz.
- **interest_lines**: lista de líneas (por su código comercial `lin_comer`) que se quieren seguir. El backend y el buscador sólo tendrán en cuenta estas líneas y las paradas por las que circulan, evitando ruido innecesario.

### Variables de entorno
Copiar `.env.example` a `.env` y personalizar si hace falta:

| Variable | Descripcion |
| --- | --- |
| `ENV` | Entorno (`dev`, `prod`, etc.). |
| `API_TITLE` | Titulo que se muestra en la cabecera y OpenAPI. |
| `DEFAULT_STOP_ID` | Parada por defecto si no hubiese `app_config.json` (fallback). |
| `STOPS_SOURCE_URL` | URL del catalogo de paradas (`func=7`). |
| `ARRIVALS_URL_TEMPLATE` | Plantilla para pedir llegadas (`{stop_id}`). |
| `CACHE_TTL_SECONDS` | Tiempo de cacheo del catalogo (0 = solo se descarga al arrancar). |
| `HTTP_TIMEOUT_SECONDS` | Timeout de las peticiones externas. |
| `CORS_ORIGINS` | Lista separada por comas o `*`. |
| `APP_CONFIG_PATH` | Ruta al `app_config.json` descrito arriba. |

## Desarrollo
### Servidor
```bash
PYTHONPATH=src uv run uvicorn app.main:app --reload --port 8000
```
La UI esta disponible en `http://localhost:8000/` y las rutas API en `/docs`.

### Format / lint / tipos
```bash
uv run ruff format .
uv run ruff check .
uv run mypy src
```

### Pruebas
```bash
uv run pytest --cov=src --cov-report=term-missing
```

## Arquitectura
- `src/app/core`: configuracion, logging JSON y middleware de correlacion.
- `src/app/core/app_config.py`: carga del fichero estático con parada/líneas de interés.
- `src/app/services`: integracion con la API publica de Tranvias.
- `src/app/api/v1`: endpoints REST (salud, sum, paradas y llegadas).
- `src/app/frontend`: plantilla y assets optimizados para móviles (buscador apilado, próxima llegada y detalle).
- `tests`: pruebas basicas de smoke.

## API destacada
- `GET /health`: estado del servicio.
- `GET /sum`: suma simple con validacion.
- `GET /api/stops?q=<texto>`: sugerencias filtradas a las líneas configuradas.
- `GET /api/stops/{id}`: detalle puntual de una parada.
- `GET /api/stops/{id}/arrivals`: buses (únicamente de las líneas de interés) con sus próximos tiempos de llegada.

## Docker
```bash
docker build -t buscornamayo . -f docker/Dockerfile
docker run -p 8000:8000 buscornamayo
```

## PWA
- Manifesto en `/manifest.webmanifest` con iconos (`static/icons/*`).
- Service Worker (`/sw.js`) para ofrecer modo standalone.
- En móviles sólo hay que “Añadir a pantalla de inicio” para tener la app como PWA.
