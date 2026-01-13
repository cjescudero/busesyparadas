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
const stopDirectionLabel = document.getElementById("stop-direction-label");
const arrivalsEl = document.getElementById("arrivals");
const statusEl = document.getElementById("status");
const nextArrivalsEl = document.getElementById("next-arrivals");

let currentStopId = primaryStopId;
let apiRefreshTimer;
let uiRefreshTimer;
let allStops = [];
let filteredStops = [];
let nextShownMap = new Map();
let lastArrivalsSnapshot = null;

bootstrapStops();

// Accesibilidad: anuncia actualizaciones de llegadas en lectores de pantalla sin interrumpir al usuario.
nextArrivalsEl?.setAttribute("aria-live", "polite");
arrivalsEl?.setAttribute("aria-live", "polite");

setupStopSearch({
  input: searchInput,
  results: resultsList,
  prefix: "main",
  maxResults: 6,
  onSelect: (stop) => selectStop(stop),
});

homeButton?.addEventListener("click", () => {
  const stop = findStopById(primaryStopId) || {
    id: primaryStopId,
    name: primaryStopName,
  };
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

function setupStopSearch({ input, results, prefix, maxResults, onSelect }) {
  if (!input || !results) {
    return;
  }

  // Scroll automático al enfocar el campo de búsqueda en móvil
  // Esto ayuda a que las personas mayores vean las opciones de búsqueda
  input.addEventListener("focus", () => {
    // Detectar si estamos en un dispositivo móvil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (isMobile) {
      // Delay para que el teclado virtual tenga tiempo de aparecer y ajustar el viewport
      setTimeout(() => {
        // Obtener la posición del campo de búsqueda
        const inputRect = input.getBoundingClientRect();
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        
        // Calcular la posición deseada: campo en la parte superior con un pequeño margen
        const targetScroll = currentScroll + inputRect.top - 20; // 20px de margen superior
        
        // Hacer scroll suave a la posición calculada
        window.scrollTo({
          top: targetScroll,
          behavior: "smooth"
        });
      }, 400); // Delay mayor para móviles donde el teclado tarda más en aparecer
    }
  });

  // Función para normalizar texto eliminando tildes y acentos
  function normalizeText(text) {
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  input.addEventListener("input", (event) => {
    const value = event.target.value.trim();
    const normalizedValue = normalizeText(value);
    if (!allStops.length) {
      return;
    }
    const matches = value
      ? allStops.filter(
          (stop) => 
            normalizeText(stop.name).includes(normalizedValue) || 
            String(stop.id).includes(value)
        )
      : allStops;
    renderResults({ input, results, prefix, stops: matches.slice(0, maxResults) });
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Accesibilidad: permite cerrar resultados fácilmente con teclado.
      clearSearchResults({ input, results });
      return;
    }

    if (!results.children.length) {
      return;
    }

    const options = Array.from(results.children).filter((li) => li.getAttribute("aria-disabled") !== "true");
    if (!options.length) {
      return;
    }
    const currentIndex = options.findIndex((item) => item.getAttribute("aria-selected") === "true");

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      setActiveOption({ input, options, index: nextIndex });
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      setActiveOption({ input, options, index: prevIndex });
    }

    if (event.key === "Enter" && currentIndex >= 0) {
      event.preventDefault();
      const stopId = Number(options[currentIndex].dataset.stopId);
      const stop = findStopById(stopId);
      if (stop) {
        onSelect(stop);
        clearSearchResults({ input, results });
      }
    }
  });

  results.addEventListener("click", (event) => {
    const li = event.target.closest("li[data-stop-id]");
    if (!li) {
      return;
    }
    const stopId = Number(li.dataset.stopId);
    const stop = findStopById(stopId);
    if (stop) {
      onSelect(stop);
      clearSearchResults({ input, results });
    }
  });
}

function renderResults({ input, results, prefix, stops }) {
  results.innerHTML = "";

  if (!stops.length) {
    const li = document.createElement("li");
    li.textContent = "Sin resultados";
    li.setAttribute("aria-disabled", "true");
    results.appendChild(li);
    showResults({ input, results });
    return;
  }

  stops.forEach((stop, index) => {
    const li = document.createElement("li");
    li.dataset.stopId = stop.id;
    li.role = "option";
    li.id = `${prefix}-stop-option-${stop.id}`;
    li.setAttribute("aria-selected", index === 0 ? "true" : "false");
    li.innerHTML = `<strong>${stop.id} - ${stop.name}</strong>`;
    results.appendChild(li);
  });

  showResults({ input, results });

  // Accesibilidad: informa del elemento “activo” a lectores de pantalla.
  const first = results.querySelector('li[aria-selected="true"]');
  if (first) {
    input.setAttribute("aria-activedescendant", first.id);
  }
}

function setActiveOption({ input, options, index }) {
  options.forEach((item, idx) => {
    item.setAttribute("aria-selected", idx === index ? "true" : "false");
    if (idx === index) {
      item.scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", item.id);
    }
  });
}

function showResults({ input, results }) {
  results.style.display = "block";
  input.setAttribute("aria-expanded", "true");
}

function findStopById(stopId) {
  return allStops.find((stop) => stop.id === stopId);
}

async function selectStop(stop) {
  currentStopId = stop.id;
  if (searchInput) {
    searchInput.value = "";
  }
  clearSearchResults({ input: searchInput, results: resultsList });
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
  if (apiRefreshTimer) {
    clearTimeout(apiRefreshTimer);
  }

  try {
    const [stop, arrivals] = await Promise.all([
      fetchJSON(`/api/stops/${stopId}`),
      fetchJSON(`/api/stops/${stopId}/arrivals`),
    ]);
    if (stopNameEl) stopNameEl.textContent = stop.name;
    lastArrivalsSnapshot = { stop, arrivals, updatedAt: new Date() };
    const lineCount = Array.isArray(stop.lines) ? stop.lines.length : 0;
    
    // Determinar sentido de la parada (todas las líneas tienen el mismo sentido)
    let directionHtml = "";
    let directionClass = "";
    if (arrivals.lines && arrivals.lines.length > 0) {
      const firstLine = arrivals.lines[0];
      if (firstLine.is_ida === true) {
        directionHtml = '<span class="direction-icon">→</span> Se <strong class="direction-word">aleja</strong> de casa';
        directionClass = "direction-ida";
      } else {
        directionHtml = '<span class="direction-icon">←</span> De <strong class="direction-word">vuelta</strong> a casa';
        directionClass = "direction-vuelta";
      }
    }
    
    // Actualizar el label de la parada seleccionada (sin el sentido)
    if (currentStopLabel) {
      currentStopLabel.innerHTML = `<span>Seleccionada:</span> <strong>${stop.id} - ${stop.name}</strong>`;
    }
    
    // Actualizar el sentido fuera del resaltado
    if (stopDirectionLabel) {
      stopDirectionLabel.innerHTML = directionHtml || "";
      // Añadir o quitar clase de color según el sentido
      if (directionClass) {
        stopDirectionLabel.className = `stop-direction-text ${directionClass}`;
      } else {
        stopDirectionLabel.className = "stop-direction-text";
      }
    }
    // Actualizar UI inmediatamente con los datos frescos
    updateUIFromSnapshot();
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setStatus(`Datos reales: ${timeStr} | Refresco: ${timeStr}`);
  } catch (error) {
    console.error(error);
    nextArrivalsEl.innerHTML = "<div class=\"empty-state\">No se pudo conectar con el servicio.</div>";
    arrivalsEl.innerHTML = "<div class=\"empty-state\">No hay datos disponibles en este momento.</div>";
    setStatus("No se pudo actualizar. Intenta de nuevo en unos segundos.");
  } finally {
    // Consultar API cada 3 minutos (180000 ms) para evitar saturación
    apiRefreshTimer = setTimeout(() => loadArrivals(currentStopId), 180000);
    // Iniciar/restablecer el timer de actualización visual cada minuto
    startUIRefreshTimer();
  }
}

function startUIRefreshTimer() {
  if (uiRefreshTimer) {
    clearTimeout(uiRefreshTimer);
  }
  // Actualizar UI cada minuto (60000 ms) con cálculos basados en el último snapshot
  uiRefreshTimer = setTimeout(() => {
    if (lastArrivalsSnapshot) {
      updateUIFromSnapshot();
    }
    startUIRefreshTimer();
  }, 60000);
}

function updateUIFromSnapshot() {
  if (!lastArrivalsSnapshot) {
    return;
  }

  const now = new Date();
  const elapsedMinutes = Math.floor((now - lastArrivalsSnapshot.updatedAt) / 60000);
  
  // Calcular tiempos ajustados restando los minutos transcurridos
  const adjustedArrivals = {
    lines: lastArrivalsSnapshot.arrivals.lines.map((line) => ({
      ...line,
      is_ida: line.is_ida, // Preservar el campo is_ida
      buses: line.buses.map((bus) => {
        if (typeof bus.eta_minutes === "number") {
          return {
            ...bus,
            eta_minutes: Math.max(0, bus.eta_minutes - elapsedMinutes)
          };
        }
        return bus;
      })
    }))
  };

  renderNextArrivals(adjustedArrivals);
  renderArrivals(adjustedArrivals);
  
  // Actualizar estado mostrando cuándo se actualizó el API
  const apiUpdateTime = lastArrivalsSnapshot.updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  setStatus(`Datos del API: ${apiUpdateTime} | Actualizado: ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
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
  // Accesibilidad/usabilidad: añade un prefijo claro ("Seleccionada") y conserva buen contraste.
  // El sentido se añadirá cuando se carguen las llegadas
  currentStopLabel.innerHTML = `<span>Seleccionada:</span> <strong>${stop.id} - ${stop.name}</strong>`;
  
  // Limpiar el sentido cuando se cambia de parada
  if (stopDirectionLabel) {
    stopDirectionLabel.innerHTML = "";
    stopDirectionLabel.className = "stop-direction-text";
  }
}

selectStop({ id: primaryStopId, name: primaryStopName });

function clearSearchResults({ input, results }) {
  if (!results) {
    return;
  }
  results.innerHTML = "";
  results.style.display = "none";
  if (input) {
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
}

