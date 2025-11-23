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
| `ROOT_PATH` | Prefijo público cuando se despliega tras un subpath (ej. `/busesyparadas`). |

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

## Despliegue sugerido (systemd + Nginx)
1. Instalar dependencias en una venv local:
   ```bash
   cd /home/escudero/busesyparadas
   uv sync --frozen
   cp .env.example .env  # y personaliza valores
   ```
   Si se sirve detrás de un subpath (por ejemplo `https://escudero.gtec.udc.es/busesyparadas`), ajusta `ROOT_PATH=/busesyparadas`.
2. Copiar el unit file `deploy/systemd/busesyparadas.service` a `/etc/systemd/system/` y recargar systemd:
   ```bash
   sudo cp deploy/systemd/busesyparadas.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now busesyparadas.service
   ```
3. Para el frontal, copiar el snippet `deploy/nginx/busesyparadas.conf` a `/etc/nginx/snippets/` e incluirlo dentro del `server` correspondiente (normalmente el que ya sirve `escudero.gtec.udc.es`). Ejemplo:
   ```bash
   sudo cp deploy/nginx/busesyparadas.conf /etc/nginx/snippets/busesyparadas.conf
   sudoedit /etc/nginx/sites-available/escudero.gtec.udc.es  # añadir: include /etc/nginx/snippets/busesyparadas.conf;
   sudo nginx -t && sudo systemctl reload nginx
   ```
   El backend queda escuchando en `127.0.0.1:3003` y Nginx sirve `/static`, `/manifest.webmanifest` y `/sw.js` directamente desde `src/app/frontend/static`, haciendo proxy del resto a Uvicorn.
