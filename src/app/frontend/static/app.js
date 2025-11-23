const body = document.body;
const primaryStopId = Number(body.dataset.primaryStopId);
const primaryStopName = body.dataset.primaryStopName || `Parada ${primaryStopId}`;
const basePath = window.__BASE_PATH ?? body.dataset.basePath ?? "";
delete window.__BASE_PATH;

const buildUrl = (path) => {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return basePath ? `${basePath}${path}` : path;
};

const searchInput = document.getElementById("stop-search");
const resultsList = document.getElementById("stop-results");
const currentStopLabel = document.getElementById("current-stop-label");
const homeButton = document.getElementById("home-button");
const stopNameEl = document.getElementById("stop-name");
const stopHelperEl = document.getElementById("stop-helper");
const arrivalsEl = document.getElementById("arrivals");
const statusEl = document.getElementById("status");
const nextArrivalsEl = document.getElementById("next-arrivals");

let currentStopId = primaryStopId;
let refreshTimer;
let allStops = [];
let filteredStops = [];
let nextShownMap = new Map();

bootstrapStops();

searchInput?.addEventListener("input", handleSearchInput);
searchInput?.addEventListener("keydown", handleSearchKeydown);
resultsList?.addEventListener("click", handleResultClick);
homeButton?.addEventListener("click", () => {
  const stop = findStopById(primaryStopId) || { id: primaryStopId, name: primaryStopName };
  selectStop(stop);
});

async function bootstrapStops() {
  try {
    const data = await fetchJSON("/api/stops?limit=400");
    allStops = (data.stops || []).slice().sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    );
    filteredStops = allStops;
    updateCurrentStopLabel(findStopById(currentStopId));
  } catch (error) {
    console.error("No se pudo cargar el listado de paradas", error);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = buildUrl("/sw.js");
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => console.error("SW registration failed", err));
  });
}

function handleSearchInput(event) {
  const value = event.target.value.trim().toLowerCase();
  if (!allStops.length) {
    return;
  }
  filteredStops = value
    ? allStops.filter(
        (stop) =>
          stop.name.toLowerCase().includes(value) ||
          String(stop.id).includes(value)
      )
    : allStops;
  renderResults(filteredStops.slice(0, 4));
}

function handleSearchKeydown(event) {
  if (!resultsList || !resultsList.children.length) {
    return;
  }
  const options = Array.from(resultsList.children);
  const currentIndex = options.findIndex((item) =>
    item.getAttribute("aria-selected") === "true"
  );
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
    setActiveOption(options, nextIndex);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
    setActiveOption(options, prevIndex);
  }
  if (event.key === "Enter" && currentIndex >= 0) {
    event.preventDefault();
    const stopId = Number(options[currentIndex].dataset.stopId);
    const stop = findStopById(stopId);
    if (stop) {
      selectStop(stop);
      clearSearchResults();
    }
  }
}

function handleResultClick(event) {
  const li = event.target.closest("li[data-stop-id]");
  if (!li) {
    return;
  }
  const stopId = Number(li.dataset.stopId);
  const stop = findStopById(stopId);
  if (stop) {
    selectStop(stop);
    resultsList.innerHTML = "";
  }
}

function renderResults(stops) {
  if (!resultsList) {
    return;
  }
  resultsList.innerHTML = "";
  if (!stops.length) {
    const li = document.createElement("li");
    li.textContent = "Sin resultados";
    li.setAttribute("aria-disabled", "true");
    resultsList.appendChild(li);
    resultsList.style.display = "block";
    return;
  }
  stops.forEach((stop, index) => {
    const li = document.createElement("li");
    li.dataset.stopId = stop.id;
    li.role = "option";
    if (index === 0) {
      li.setAttribute("aria-selected", "true");
    }
    li.innerHTML = `<strong>${stop.id} - ${stop.name}</strong>`;
    resultsList.appendChild(li);
  });
  resultsList.style.display = "block";
}

function setActiveOption(options, index) {
  options.forEach((item, idx) => {
    item.setAttribute("aria-selected", idx === index ? "true" : "false");
    if (idx === index) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
  if (resultsList) {
    resultsList.style.display = "block";
  }
}

function findStopById(stopId) {
  return allStops.find((stop) => stop.id === stopId);
}

async function selectStop(stop) {
  currentStopId = stop.id;
  if (searchInput) {
    searchInput.value = "";
  }
  clearSearchResults();
  updateCurrentStopLabel(stop);
  await loadArrivals(currentStopId);
}

async function fetchJSON(url) {
  const response = await fetch(buildUrl(url));
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
  return response.json();
}

async function loadArrivals(stopId, options = {}) {
  const { manual = false } = options;
  setStatus(manual ? "Actualizando bajo pedido..." : "Buscando datos frescos...");
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  try {
    const [stop, arrivals] = await Promise.all([
      fetchJSON(`/api/stops/${stopId}`),
      fetchJSON(`/api/stops/${stopId}/arrivals`),
    ]);
    stopNameEl.textContent = stop.name;
    const lineCount = Array.isArray(stop.lines) ? stop.lines.length : 0;
    stopHelperEl.textContent =
      lineCount > 0
        ? `Mostrando ${lineCount} línea${lineCount === 1 ? "" : "s"} configuradas`
        : "Sin líneas configuradas para esta parada";
    renderNextArrivals(arrivals);
    renderArrivals(arrivals);
    const now = new Date();
    setStatus(`Actualizado a las ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    console.error(error);
    nextArrivalsEl.innerHTML = "<div class=\"empty-state\">No se pudo conectar con el servicio.</div>";
    arrivalsEl.innerHTML = "<div class=\"empty-state\">No hay datos disponibles en este momento.</div>";
    setStatus("No se pudo actualizar. Intenta de nuevo en unos segundos.");
  } finally {
    refreshTimer = setTimeout(() => loadArrivals(currentStopId), 45000);
  }
}

function renderNextArrivals(arrivals) {
  nextArrivalsEl.innerHTML = "";
  nextShownMap = new Map();
  const upcoming = [];
  (arrivals.lines || []).forEach((line) => {
    if (!Array.isArray(line.buses)) {
      return;
    }
    const nextBus = line.buses.find((bus) => typeof bus.eta_minutes === "number");
    if (!nextBus) {
      return;
    }
    upcoming.push({ line, bus: nextBus });
  });

  if (!upcoming.length) {
    nextArrivalsEl.innerHTML = "<div class=\"empty-state\">Sin llegadas próximas.</div>";
    return;
  }

  upcoming
    .sort((a, b) => (a.bus.eta_minutes ?? 9999) - (b.bus.eta_minutes ?? 9999))
    .slice(0, 4)
    .forEach((item) => {
      const card = document.createElement("div");
      card.className = "next-card-item";
      if (item.line.color_hex) {
        card.style.setProperty("--line-color", item.line.color_hex);
      }
      const name = item.line.line_name || `Línea ${item.line.line_id}`;
      const relative = formatEtaLabel(item.bus.eta_minutes);
      const absolute = formatAbsoluteTime(item.bus.eta_minutes);
      card.innerHTML = `
        <div class="next-line">${name}</div>
        <div class="next-time">${relative}</div>
        <div class="next-absolute">${absolute}</div>
      `;
      nextArrivalsEl.appendChild(card);
      nextShownMap.set(item.line.line_id, item.bus.bus_id);
    });
}

function renderArrivals(arrivals) {
  arrivalsEl.innerHTML = "";
  if (!arrivals.lines || !arrivals.lines.length) {
    arrivalsEl.innerHTML = "<div class=\"empty-state\">Sin datos para las líneas configuradas.</div>";
    return;
  }

  arrivals.lines.forEach((line) => {
    const card = document.createElement("div");
    card.className = "line-card";
    if (line.color_hex) {
      card.style.setProperty("--line-color", line.color_hex);
    }

    const title = document.createElement("div");
    title.className = "line-title";
    const friendlyName = line.line_name || `Línea ${line.line_id}`;
    title.textContent = friendlyName;
    card.appendChild(title);

    const busContainer = document.createElement("div");
    busContainer.className = "bus-times";

    let hasDisplayed = false;
    line.buses.forEach((bus) => {
      if (nextShownMap.get(line.line_id) === bus.bus_id) {
        return;
      }
      const badge = document.createElement("div");
      badge.className = "badge";
      const relative = formatEtaLabel(bus.eta_minutes);
      const absolute = formatAbsoluteTime(bus.eta_minutes);
      badge.innerHTML = `${relative}${absolute ? `<span>${absolute}</span>` : ""}`;
      busContainer.appendChild(badge);
      hasDisplayed = true;
    });

    if (!line.buses.length || !hasDisplayed) {
      const empty = document.createElement("div");
      empty.className = "badge";
      empty.textContent = "Sin buses en ruta";
      busContainer.appendChild(empty);
    }

    card.appendChild(busContainer);
    arrivalsEl.appendChild(card);
  });
}

function formatEtaLabel(value) {
  if (typeof value !== "number") {
    return "Sin dato";
  }
  if (value <= 0) {
    return "Llegando";
  }
  if (value === 1) {
    return "1 min";
  }
  return `${value} min`;
}

function formatAbsoluteTime(value) {
  if (typeof value !== "number") {
    return "";
  }
  const arrival = new Date(Date.now() + value * 60000);
  return arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateCurrentStopLabel(stop) {
  if (!currentStopLabel || !stop) {
    return;
  }
  currentStopLabel.textContent = `${stop.id} - ${stop.name}`;
}

selectStop({ id: primaryStopId, name: primaryStopName });
function clearSearchResults() {
  if (!resultsList) {
    return;
  }
  resultsList.innerHTML = "";
  resultsList.style.display = "none";
}
