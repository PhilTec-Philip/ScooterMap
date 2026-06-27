const categories = {
  road: {
    label: "Fahrbahn",
    colorClass: "marker-road",
    color: "#08734f",
    types: ["Schlagloch", "Unebener Asphalt", "Schotter", "Kopfsteinpflaster", "Baustelle"]
  },
  safety: {
    label: "Sicherheit",
    colorClass: "marker-safety",
    color: "#246fa8",
    types: ["Gefährliche Kreuzung", "Schlechte Beleuchtung", "Häufige Kontrollstelle", "Unübersichtliche Stelle"]
  },
  community: {
    label: "Community",
    colorClass: "marker-community",
    color: "#c77912",
    types: ["Treffpunkt", "Gute Aussicht", "Rollerwerkstatt", "Tankstellen-Tipp"]
  },
  warning: {
    label: "Warnung",
    colorClass: "marker-warning",
    color: "#c2403b",
    types: ["Diebstahl-Hinweis", "Überschwemmung", "Konfliktbereich", "Besondere Vorsicht empfohlen"]
  }
};

const storageKey = "scootermap.reports.v1";
const votesKey = "scootermap.votes.v1";
const voterKey = "scootermap.voter.v1";
const drawHelpText = {
  point: "Klicke auf die Karte, um einen Marker zu setzen.",
  circle: "Klicke den Mittelpunkt, bewege die Maus für den Radius, klicke nochmal zum Festlegen.",
  polygon: "Klicke mehrere Punkte auf die Karte. Ab drei Punkten kannst du die Fläche abschließen."
};

let reports = loadReports();
let votes = loadVotes();
let apiAvailable = false;
const voterId = getOrCreateVoterId();
let activeCategories = new Set(Object.keys(categories));
let appMode = "view";
let drawMode = "point";
let selectedGeometry = null;
let circleCenter = null;
let polygonPoints = [];
let draftLayers = [];
let renderedLayers = [];

const map = L.map("map", {
  zoomControl: false
}).setView([51.1657, 10.4515], 6);

L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const categorySelect = document.querySelector("#category");
const typeSelect = document.querySelector("#type");
const reportForm = document.querySelector("#reportForm");
const selectedPosition = document.querySelector("#selectedPosition");
const filters = document.querySelector("#filters");
const reportCount = document.querySelector("#reportCount");
const drawHelp = document.querySelector("#drawHelp");
const mapHint = document.querySelector("#mapHint");
const placeSearchForm = document.querySelector("#placeSearchForm");
const placeSearchInput = document.querySelector("#placeSearchInput");
const placeSearchResults = document.querySelector("#placeSearchResults");
const finishShapeButton = document.querySelector("#finishShapeButton");
const clearShapeButton = document.querySelector("#clearShapeButton");
const drawModes = document.querySelector(".draw-modes");
const modeButtons = document.querySelectorAll(".mode-button");
const appModeButtons = document.querySelectorAll(".app-mode-button");

// Redesign elements
const closePanelButton = document.querySelector("#closePanelButton");
const filterToggleButton = document.querySelector("#filterToggleButton");
const sheetBackdrop = document.querySelector("#sheetBackdrop");
const detailsSheet = document.querySelector("#detailsSheet");
const detailsContent = document.querySelector("#detailsContent");
const closeDetailsButton = document.querySelector("#closeDetailsButton");
const reportsList = document.querySelector("#reportsList");
const themeToggleButton = document.querySelector("#themeToggleButton");

init();

function init() {
  populateTypeOptions();
  renderFilters();
  renderReports();
  syncReportsFromApi();

  // Dark Mode preference handling
  const savedTheme = localStorage.getItem("scootermap.theme") || "light";
  const isDark = savedTheme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  themeToggleButton.querySelector("span").textContent = isDark ? "☀️" : "🌙";

  themeToggleButton.addEventListener("click", () => {
    const currentIsDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("scootermap.theme", currentIsDark ? "dark" : "light");
    themeToggleButton.querySelector("span").textContent = currentIsDark ? "☀️" : "🌙";
  });

  categorySelect.addEventListener("change", () => {
    populateTypeOptions();
    renderDraftShape();
  });
  reportForm.addEventListener("submit", handleSubmit);
  placeSearchForm.addEventListener("submit", handlePlaceSearch);
  placeSearchInput.addEventListener("input", () => {
    if (!placeSearchInput.value.trim()) {
      clearPlaceResults();
    }
  });
  document.querySelector("#locateButton").addEventListener("click", locateUser);
  finishShapeButton.addEventListener("click", finishPolygon);
  clearShapeButton.addEventListener("click", clearDraftShape);

  appModeButtons.forEach((button) => {
    button.addEventListener("click", () => setAppMode(button.dataset.appMode));
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (appMode === "edit") {
        setDrawMode(button.dataset.mode);
      }
    });
  });

  // Mobile sheets event listeners
  closePanelButton.addEventListener("click", closeMobileDrawer);
  filterToggleButton.addEventListener("click", toggleMobileFilters);
  closeDetailsButton.addEventListener("click", closeMobileDetails);
  sheetBackdrop.addEventListener("click", closeAllMobileSheets);

  map.on("click", handleMapClick);
  map.on("mousemove", handleMapMove);
  map.on("contextmenu", (event) => {
    L.DomEvent.preventDefault(event.originalEvent);
  });
  map.getContainer().addEventListener("contextmenu", (event) => event.preventDefault());

  setAppMode("view");
  requestAnimationFrame(() => map.invalidateSize());
  window.addEventListener("resize", () => map.invalidateSize());
  window.addEventListener("focus", () => syncReportsFromApi({ silent: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncReportsFromApi({ silent: true });
    }
  });
  setInterval(() => syncReportsFromApi({ silent: true }), 7000);
}

function populateTypeOptions() {
  const selectedCategory = categorySelect.value;
  typeSelect.innerHTML = "";

  categories[selectedCategory].types.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeSelect.append(option);
  });
}

function renderFilters() {
  filters.innerHTML = "";

  Object.entries(categories).forEach(([key, category]) => {
    const row = document.createElement("div");
    row.className = "filter-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `filter-${key}`;
    checkbox.checked = activeCategories.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        activeCategories.add(key);
      } else {
        activeCategories.delete(key);
      }
      renderReports();
    });

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = category.label;

    row.append(checkbox, label);
    filters.append(row);
  });
}

function setDrawMode(mode) {
  drawMode = mode;
  clearDraftShape();
  drawHelp.textContent = drawHelpText[mode];

  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
}

function setAppMode(mode) {
  appMode = mode;
  clearDraftShape();
  document.body.classList.toggle("view-mode", mode === "view");
  document.body.classList.toggle("edit-mode", mode === "edit");

  appModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.appMode === mode);
  });

  const isEditing = mode === "edit";
  drawModes.classList.toggle("is-disabled", !isEditing);
  modeButtons.forEach((button) => {
    button.disabled = !isEditing;
  });
  finishShapeButton.disabled = !isEditing || polygonPoints.length < 3 || selectedGeometry?.kind === "polygon";
  clearShapeButton.disabled = !isEditing;
  reportForm.querySelector(".primary-button").disabled = !isEditing;

  drawHelp.textContent = isEditing
    ? drawHelpText[drawMode]
    : "Anschauen-Modus: Klicke auf bestehende Einträge, um Details zu sehen.";
  mapHint.textContent = isEditing
    ? "Markierung auf der Karte setzen, Formular ausfüllen, speichern."
    : "Einträge anklicken, um Details zu sehen.";

  // Update panels view states
  const panel = document.querySelector(".panel");
  if (isEditing) {
    panel.classList.add("show-form");
    panel.classList.remove("show-filters");
  } else {
    panel.classList.remove("show-form");
    panel.classList.add("show-filters");
  }
  closeAllMobileSheets();

  requestAnimationFrame(() => map.invalidateSize());
}

function handleMapClick(event) {
  if (appMode !== "edit") {
    return;
  }

  if (drawMode === "point") {
    selectedGeometry = {
      kind: "point",
      lat: event.latlng.lat,
      lng: event.latlng.lng
    };
    renderDraftShape();
    updateSelectionLabel();
    openMobileForm();
    return;
  }

  if (drawMode === "circle") {
    if (!circleCenter) {
      circleCenter = event.latlng;
      selectedGeometry = {
        kind: "circle",
        center: toPlainLatLng(circleCenter),
        radius: 250
      };
      renderDraftShape();
      updateSelectionLabel();
      return;
    }

    selectedGeometry = {
      kind: "circle",
      center: toPlainLatLng(circleCenter),
      radius: Math.max(30, circleCenter.distanceTo(event.latlng))
    };
    circleCenter = null;
    renderDraftShape();
    updateSelectionLabel();
    openMobileForm();
    return;
  }

  polygonPoints.push(event.latlng);
  selectedGeometry = null;
  renderDraftShape();
  updateSelectionLabel();
}

function handleMapMove(event) {
  if (appMode !== "edit" || drawMode !== "circle" || !circleCenter) {
    return;
  }

  selectedGeometry = {
    kind: "circle",
    center: toPlainLatLng(circleCenter),
    radius: Math.max(30, circleCenter.distanceTo(event.latlng))
  };
  renderDraftShape();
  updateSelectionLabel();
}

function finishPolygon() {
  if (appMode !== "edit") {
    return;
  }

  if (polygonPoints.length < 3) {
    return;
  }

  selectedGeometry = {
    kind: "polygon",
    points: polygonPoints.map(toPlainLatLng)
  };
  renderDraftShape();
  updateSelectionLabel();
  openMobileForm();
}

function renderDraftShape() {
  draftLayers.forEach((layer) => layer.remove());
  draftLayers = [];

  const category = categories[categorySelect.value];

  if (selectedGeometry?.kind === "point") {
    draftLayers.push(
      L.marker([selectedGeometry.lat, selectedGeometry.lng], {
        icon: makeIcon(categorySelect.value),
        opacity: 0.86,
        zIndexOffset: 1000
      }).addTo(map)
    );
  }

  if (selectedGeometry?.kind === "circle") {
    draftLayers.push(
      L.circle([selectedGeometry.center.lat, selectedGeometry.center.lng], {
        radius: selectedGeometry.radius,
        color: category.color,
        weight: 3,
        fillColor: category.color,
        fillOpacity: 0.18,
        interactive: true,
        bubblingMouseEvents: false
      }).addTo(map)
    );
  }

  if (polygonPoints.length > 0 && !selectedGeometry) {
    draftLayers.push(
      L.polyline(polygonPoints, {
        color: category.color,
        weight: 3,
        dashArray: "7 7"
      }).addTo(map)
    );

    polygonPoints.forEach((point, index) => {
      const pointLayer = L.circleMarker(point, {
          radius: 5,
          color: "#fff",
          weight: 2,
          fillColor: category.color,
          fillOpacity: 1,
          interactive: true,
          bubblingMouseEvents: false
        }).addTo(map);

      pointLayer.on("contextmenu", (event) => {
        if (event.originalEvent) {
          L.DomEvent.stop(event.originalEvent);
          L.DomEvent.preventDefault(event.originalEvent);
        }
        polygonPoints.splice(index, 1);
        selectedGeometry = null;
        renderDraftShape();
        updateSelectionLabel();
      });

      draftLayers.push(pointLayer);
    });
  }

  if (selectedGeometry?.kind === "polygon") {
    draftLayers.push(
      L.polygon(selectedGeometry.points, {
        color: category.color,
        weight: 3,
        fillColor: category.color,
        fillOpacity: 0.18,
        interactive: true,
        bubblingMouseEvents: false
      }).addTo(map)
    );
  }

  finishShapeButton.disabled = appMode !== "edit" || polygonPoints.length < 3 || selectedGeometry?.kind === "polygon";
}

function updateSelectionLabel() {
  if (selectedGeometry?.kind === "point") {
    selectedPosition.textContent = `Marker: ${selectedGeometry.lat.toFixed(5)}, ${selectedGeometry.lng.toFixed(5)}`;
    return;
  }

  if (selectedGeometry?.kind === "circle") {
    selectedPosition.textContent = `Gebiet: ca. ${Math.round(selectedGeometry.radius)} m Radius`;
    return;
  }

  if (selectedGeometry?.kind === "polygon") {
    selectedPosition.textContent = `Freie Fläche: ${selectedGeometry.points.length} Punkte`;
    return;
  }

  if (polygonPoints.length > 0) {
    selectedPosition.textContent = `Freie Fläche: ${polygonPoints.length} Punkt${polygonPoints.length === 1 ? "" : "e"} gesetzt`;
    return;
  }

  selectedPosition.textContent = "Noch keine Auswahl";
}

async function handleSubmit(event) {
  event.preventDefault();

  if (appMode !== "edit") {
    selectedPosition.textContent = "Wechsle zuerst in den Bearbeiten-Modus";
    return;
  }

  if (!selectedGeometry) {
    selectedPosition.textContent = "Bitte zuerst eine Markierung auf der Karte setzen";
    return;
  }

  const report = {
    id: createId(),
    category: categorySelect.value,
    type: typeSelect.value,
    severity: document.querySelector("#severity").value,
    duration: document.querySelector("#duration").value,
    description: sanitizeDescription(document.querySelector("#description").value),
    geometry: selectedGeometry,
    createdAt: new Date().toISOString(),
    confirmations: 0,
    disputes: 0
  };

  reports.unshift(report);
  saveReports();
  renderReports();
  reportForm.reset();
  populateTypeOptions();
  clearDraftShape();

  if (apiAvailable) {
    try {
      await createRemoteReport(report);
      await syncReportsFromApi();
    } catch {
      mapHint.textContent = "Server nicht erreichbar. Eintrag wurde nur lokal gespeichert.";
    }
  }
}

async function handlePlaceSearch(event) {
  event.preventDefault();

  const query = placeSearchInput.value.trim();

  if (query.length < 2) {
    return;
  }

  mapHint.textContent = "Ort wird gesucht...";

  try {
    const results = await searchPlaces(query);
    renderPlaceResults(results);
    mapHint.textContent = results.length > 0
      ? "Suchergebnis auswählen."
      : "Kein Ort gefunden.";
  } catch {
    mapHint.textContent = "Ortssuche nicht erreichbar.";
  }
}

async function searchPlaces(query) {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "6",
    countrycodes: "de",
    addressdetails: "1"
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim responded with ${response.status}`);
  }

  return response.json();
}

function renderPlaceResults(results) {
  placeSearchResults.innerHTML = "";

  if (results.length === 0) {
    placeSearchResults.hidden = true;
    return;
  }

  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-result";
    button.textContent = result.display_name;
    button.addEventListener("click", () => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      map.setView([lat, lng], result.type === "city" || result.type === "town" ? 13 : 16);
      placeSearchInput.value = result.display_name.split(",")[0];
      clearPlaceResults();
      mapHint.textContent = "Ort gefunden.";
    });
    placeSearchResults.append(button);
  });

  placeSearchResults.hidden = false;
}

function clearPlaceResults() {
  placeSearchResults.innerHTML = "";
  placeSearchResults.hidden = true;
}

function renderReports() {
  renderedLayers.forEach((layer) => layer.remove());
  renderedLayers = [];

  const visibleReports = reports.filter((report) => activeCategories.has(report.category));

  visibleReports.forEach((report) => {
    const layer = makeReportLayer(report).addTo(map);
    layer.bindPopup(makePopup(report));
    layer.on("click", (event) => {
      L.DomEvent.stop(event.originalEvent);
      if (window.innerWidth <= 860) {
        showDetailsSheet(report);
      } else {
        layer.openPopup();
      }
    });
    layer.on("contextmenu", (event) => {
      L.DomEvent.stop(event.originalEvent);
      L.DomEvent.preventDefault(event.originalEvent);
    });
    renderedLayers.push(layer);
  });

  reportCount.textContent = `${reports.length} ${reports.length === 1 ? "Eintrag" : "Einträge"}`;

  // Populate desktop sidebar report list
  renderReportsList(visibleReports);
}

function makeReportLayer(report) {
  const geometry = normalizeGeometry(report);
  const category = categories[report.category];

  if (geometry.kind === "circle") {
    return L.circle([geometry.center.lat, geometry.center.lng], {
      radius: geometry.radius,
      color: category.color,
      weight: 3,
      fillColor: category.color,
      fillOpacity: 0.2,
      interactive: true,
      bubblingMouseEvents: false
    });
  }

  if (geometry.kind === "polygon") {
    return L.polygon(geometry.points, {
      color: category.color,
      weight: 3,
      fillColor: category.color,
      fillOpacity: 0.2,
      interactive: true,
      bubblingMouseEvents: false
    });
  }

  return L.marker([geometry.lat, geometry.lng], {
    icon: makeIcon(report.category),
    zIndexOffset: 500,
    bubblingMouseEvents: false
  });
}

function normalizeGeometry(report) {
  if (report.geometry) {
    return report.geometry;
  }

  return {
    kind: "point",
    lat: report.lat,
    lng: report.lng
  };
}

function makeIcon(categoryKey) {
  return L.divIcon({
    className: "scootermap-marker",
    html: `<div class="marker-dot ${categories[categoryKey].colorClass}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12]
  });
}

function makePopup(report) {
  const wrapper = document.createElement("div");
  const vote = votes[report.id];
  const created = new Date(report.createdAt).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

  wrapper.innerHTML = `
    <p class="popup-title">${escapeHtml(report.type)}</p>
    <p class="popup-meta">${categories[report.category].label} · ${shapeLabel(normalizeGeometry(report).kind)} · ${severityLabel(report.severity)} · ${created}</p>
    <p class="popup-description">${escapeHtml(report.description)}</p>
    <div class="popup-actions">
      <button type="button" data-action="confirm" ${vote ? "disabled" : ""}>Existiert noch (${report.confirmations})</button>
      <button type="button" data-action="dispute" ${vote ? "disabled" : ""}>Nicht mehr da (${report.disputes})</button>
    </div>
    ${vote ? `<p class="popup-voted">Du hast diesen Eintrag bereits bewertet.</p>` : ""}
  `;

  wrapper.querySelector('[data-action="confirm"]').addEventListener("click", () => updateVote(report.id, "confirmations"));
  wrapper.querySelector('[data-action="dispute"]').addEventListener("click", () => updateVote(report.id, "disputes"));

  return wrapper;
}

async function updateVote(id, field) {
  if (votes[id]) {
    return;
  }

  if (apiAvailable) {
    try {
      const updatedReport = await createRemoteVote(id, field);
      votes[id] = field;
      saveVotes();
      reports = reports.map((report) => (report.id === id ? updatedReport : report));
      saveReports();
      renderReports();
      return;
    } catch (error) {
      if (error.status === 409) {
        votes[id] = field;
        saveVotes();
        mapHint.textContent = "Du hast diesen Eintrag bereits bewertet.";
        renderReports();
        return;
      }

      mapHint.textContent = "Server nicht erreichbar. Bewertung wurde nur lokal gespeichert.";
    }
  }

  votes[id] = field;
  saveVotes();

  reports = reports.map((report) => {
    if (report.id !== id) {
      return report;
    }

    return {
      ...report,
      [field]: report[field] + 1
    };
  });

  reports = reports.filter((report) => report.disputes < 5);
  saveReports();
  renderReports();
}

function locateUser() {
  if (!navigator.geolocation) {
    mapHint.textContent = "Dieser Browser unterstützt Standortzugriff nicht.";
    selectedPosition.textContent = "Standort wird von diesem Browser nicht unterstützt";
    return;
  }

  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    mapHint.textContent = "Standort braucht auf dem Handy HTTPS. Über normale LAN-HTTP-Adressen blockt iOS den Zugriff.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      map.setView(latlng, 15);

      if (appMode !== "edit") {
        return;
      }

      selectedGeometry = {
        kind: "point",
        lat: latlng.lat,
        lng: latlng.lng
      };
      renderDraftShape();
      updateSelectionLabel();
    },
    () => {
      mapHint.textContent = "Standort konnte nicht ermittelt werden oder wurde blockiert.";
      selectedPosition.textContent = "Standort konnte nicht ermittelt werden";
    },
    {
      enableHighAccuracy: true,
      timeout: 8000
    }
  );
}

function clearDraftShape() {
  selectedGeometry = null;
  circleCenter = null;
  polygonPoints = [];
  draftLayers.forEach((layer) => layer.remove());
  draftLayers = [];
  finishShapeButton.disabled = true;
  updateSelectionLabel();
  closeMobileDrawer();
}

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function saveReports() {
  localStorage.setItem(storageKey, JSON.stringify(reports));
}

function loadVotes() {
  try {
    return JSON.parse(localStorage.getItem(votesKey)) || {};
  } catch {
    return {};
  }
}

function saveVotes() {
  localStorage.setItem(votesKey, JSON.stringify(votes));
}

async function syncReportsFromApi(options = {}) {
  const { silent = false } = options;

  try {
    const localReports = loadReports();
    const response = await fetch("/api/reports", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }

    const remoteReports = await response.json();
    apiAvailable = true;

    if (remoteReports.length === 0 && localReports.length > 0) {
      if (!silent) {
        mapHint.textContent = "Lokale Einträge werden in die Datenbank übernommen...";
      }

      await Promise.allSettled(localReports.map((report) => createRemoteReport(report)));
      const refreshedResponse = await fetch("/api/reports", {
        headers: {
          Accept: "application/json"
        }
      });

      reports = refreshedResponse.ok ? await refreshedResponse.json() : localReports;
    } else {
      reports = remoteReports;
    }

    saveReports();
    renderReports();
    if (!silent) {
      mapHint.textContent = appMode === "edit"
        ? "Markierung auf der Karte setzen, Formular ausfüllen, speichern."
        : "Einträge anklicken, um Details zu sehen.";
    }
  } catch {
    apiAvailable = false;
  }
}

async function createRemoteReport(report) {
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(report)
  });

  if (!response.ok) {
    throw new Error(`API responded with ${response.status}`);
  }

  return response.json();
}

async function createRemoteVote(id, field) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      voterId,
      field
    })
  });

  if (!response.ok) {
    const error = new Error(`API responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function getOrCreateVoterId() {
  const existingId = localStorage.getItem(voterKey);

  if (existingId) {
    return existingId;
  }

  const id = createId();
  localStorage.setItem(voterKey, id);
  return id;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toPlainLatLng(latlng) {
  return {
    lat: latlng.lat,
    lng: latlng.lng
  };
}

function sanitizeDescription(value) {
  return value.trim().replace(/\s+/g, " ");
}

function severityLabel(value) {
  return {
    low: "niedrig",
    medium: "mittel",
    high: "hoch"
  }[value];
}

function shapeLabel(value) {
  return {
    point: "Marker",
    circle: "Gebiet",
    polygon: "Fläche"
  }[value];
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

/* Mobile Bottom Sheets & Desktop Active Reports List Helpers */
function closeMobileDrawer() {
  const panel = document.querySelector(".panel");
  panel.classList.remove("is-open");
  if (detailsSheet.classList.contains("is-open")) return; // Keep backdrop if details is open
  sheetBackdrop.classList.remove("is-visible");
  setTimeout(() => {
    if (!sheetBackdrop.classList.contains("is-visible")) {
      sheetBackdrop.hidden = true;
    }
  }, 350);
}

function toggleMobileFilters() {
  const panel = document.querySelector(".panel");
  panel.classList.add("is-open");
  panel.classList.add("show-filters");
  panel.classList.remove("show-form");
  sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    sheetBackdrop.classList.add("is-visible");
  });
}

function openMobileForm() {
  if (window.innerWidth > 860) return;
  const panel = document.querySelector(".panel");
  panel.classList.add("is-open");
  panel.classList.add("show-form");
  panel.classList.remove("show-filters");
  sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    sheetBackdrop.classList.add("is-visible");
  });
}

function closeMobileDetails() {
  detailsSheet.classList.remove("is-open");
  const panel = document.querySelector(".panel");
  if (panel.classList.contains("is-open")) return; // Keep backdrop if panel is open
  sheetBackdrop.classList.remove("is-visible");
  setTimeout(() => {
    detailsSheet.hidden = true;
    if (!sheetBackdrop.classList.contains("is-visible")) {
      sheetBackdrop.hidden = true;
    }
  }, 350);
}

function closeAllMobileSheets() {
  closeMobileDrawer();
  closeMobileDetails();
}

function showDetailsSheet(report) {
  const vote = votes[report.id];
  const created = new Date(report.createdAt).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

  detailsContent.innerHTML = `
    <h3 class="sheet-popup-title">${escapeHtml(report.type)}</h3>
    <p class="sheet-popup-meta">${categories[report.category].label} · ${shapeLabel(normalizeGeometry(report).kind)} · ${severityLabel(report.severity)} · ${created}</p>
    <p class="sheet-popup-desc">${escapeHtml(report.description)}</p>
    <div class="sheet-popup-actions">
      <button type="button" class="confirm-vote-btn" data-action="confirm" ${vote ? "disabled" : ""}>Existiert noch (${report.confirmations})</button>
      <button type="button" class="dispute-vote-btn" data-action="dispute" ${vote ? "disabled" : ""}>Nicht mehr da (${report.disputes})</button>
    </div>
    ${vote ? `<p class="sheet-popup-voted">Du hast diesen Eintrag bereits bewertet.</p>` : ""}
  `;

  const confirmBtn = detailsContent.querySelector('.confirm-vote-btn');
  const disputeBtn = detailsContent.querySelector('.dispute-vote-btn');

  confirmBtn.addEventListener("click", async () => {
    await updateVote(report.id, "confirmations");
    const updated = reports.find(r => r.id === report.id);
    if (updated) showDetailsSheet(updated);
  });

  disputeBtn.addEventListener("click", async () => {
    await updateVote(report.id, "disputes");
    const updated = reports.find(r => r.id === report.id);
    if (updated) showDetailsSheet(updated);
  });

  detailsSheet.hidden = false;
  sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    detailsSheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-visible");
  });
}

function renderReportsList(visibleReports) {
  if (!reportsList) return;
  reportsList.innerHTML = "";

  if (visibleReports.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Keine Einträge für die aktiven Filter.";
    reportsList.append(empty);
    return;
  }

  visibleReports.forEach((report) => {
    const card = document.createElement("div");
    card.className = "report-card";
    
    const created = new Date(report.createdAt).toLocaleString("de-DE", {
      dateStyle: "short"
    });

    card.innerHTML = `
      <div class="report-card-header">
        <h3 class="report-card-title">${escapeHtml(report.type)}</h3>
        <span class="report-card-meta">${created}</span>
      </div>
      <p class="report-card-description">${escapeHtml(report.description)}</p>
      <div class="report-card-footer">
        <span class="report-card-badge badge-${report.category}">${categories[report.category].label}</span>
        <span class="report-card-votes">Bewertungen: ${report.confirmations + report.disputes}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      const geom = normalizeGeometry(report);
      let targetLatLng;
      if (geom.kind === "circle") {
        targetLatLng = L.latLng(geom.center.lat, geom.center.lng);
      } else if (geom.kind === "polygon") {
        const latSum = geom.points.reduce((sum, p) => sum + p.lat, 0);
        const lngSum = geom.points.reduce((sum, p) => sum + p.lng, 0);
        targetLatLng = L.latLng(latSum / geom.points.length, lngSum / geom.points.length);
      } else {
        targetLatLng = L.latLng(geom.lat, geom.lng);
      }

      map.setView(targetLatLng, 15);
      
      const layer = renderedLayers.find(l => {
        const lGeom = l.getLatLng ? l.getLatLng() : (l.getBounds ? l.getBounds().getCenter() : null);
        return lGeom && Math.abs(lGeom.lat - targetLatLng.lat) < 0.001 && Math.abs(lGeom.lng - targetLatLng.lng) < 0.001;
      });
      
      if (layer) {
        if (window.innerWidth <= 860) {
          showDetailsSheet(report);
        } else {
          layer.openPopup();
        }
      }
    });

    reportsList.append(card);
  });
}
