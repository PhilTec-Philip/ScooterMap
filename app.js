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
let isReporting = false;
let drawMode = "point";
let selectedGeometry = null;
let circleCenter = null;
let polygonPoints = [];
let draftLayers = [];
let renderedLayers = [];

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
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
const toastEl = document.querySelector("#toast");
let toastTimer = null;

function showToast(msg) {
  if (!toastEl) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-visible"));
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
    toastEl.addEventListener("transitionend", () => {
      toastEl.hidden = true;
    }, { once: true });
  }, 3000);
}
const placeSearchForm = document.querySelector("#placeSearchForm");
const placeSearchInput = document.querySelector("#placeSearchInput");
const placeSearchResults = document.querySelector("#placeSearchResults");
const finishShapeButton = document.querySelector("#finishShapeButton");
const clearShapeButton = document.querySelector("#clearShapeButton");
const drawModes = document.querySelector(".draw-modes");
const modeButtons = document.querySelectorAll(".mode-button");
const reportButton = document.querySelector("#reportButton");
const formSteps = document.querySelectorAll(".form-step");
const nextStepButton = document.querySelector("#nextStepButton");
const backStepButton = document.querySelector("#backStepButton");
const submitStepButton = document.querySelector("#submitStepButton");
const stepIndicator = document.querySelector("#stepIndicator");
const desktopSubmitButton = document.querySelector("#desktopSubmitButton");
const detailsCard = document.querySelector("#detailsCard");
const detailsContent = document.querySelector("#detailsContent");
const closeDetailsButton = document.querySelector("#closeDetailsButton");
const closePanelButton = document.querySelector("#closePanelButton");
const filterToggleButton = document.querySelector("#filterToggleButton");
const reportsList = document.querySelector("#reportsList");
const themeToggleButton = document.querySelector("#themeToggleButton");
const mapHint = document.querySelector("#mapHint");
let currentStep = 0;

init();

function init() {
  populateTypeOptions();
  renderFilters();
  renderReports();
  syncReportsFromApi();
  toggleSeverityVisibility();

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
    toggleSeverityVisibility();
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

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isReporting) {
        setDrawMode(button.dataset.mode);
      }
    });
  });

  reportButton.addEventListener("click", startReporting);
  closePanelButton.addEventListener("click", closeMobileDrawer);
  filterToggleButton.addEventListener("click", toggleMobileFilters);
  closeDetailsButton.addEventListener("click", closeDetailsCard);
  nextStepButton.addEventListener("click", nextStepHandler);
  backStepButton.addEventListener("click", backStepHandler);

  map.on("click", handleMapClick);
  map.on("mousemove", handleMapMove);
  map.on("contextmenu", (event) => {
    L.DomEvent.preventDefault(event.originalEvent);
  });
  map.getContainer().addEventListener("contextmenu", (event) => event.preventDefault());

  requestAnimationFrame(() => map.invalidateSize());
  window.addEventListener("resize", () => map.invalidateSize());
  window.addEventListener("focus", () => syncReportsFromApi({ silent: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncReportsFromApi({ silent: true });
    }
  });
  setInterval(() => syncReportsFromApi({ silent: true }), 7000);
  desktopSubmitButton.disabled = true;
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

const isMobile = () => window.innerWidth < 769;

function goToStep(step) {
  currentStep = step;
  formSteps.forEach((el, i) => {
    el.classList.toggle("is-active", i === step);
  });
  updateStepButtons();
}

function updateStepButtons() {
  if (currentStep === 0) {
    nextStepButton.style.display = "";
    backStepButton.style.display = "none";
    submitStepButton.style.display = "none";
    stepIndicator.textContent = "";
  } else if (currentStep < 3) {
    nextStepButton.style.display = "";
    backStepButton.style.display = currentStep > 1 ? "" : "none";
    submitStepButton.style.display = "none";
    stepIndicator.textContent = currentStep + " / 3";
    nextStepButton.disabled = false;
  } else {
    nextStepButton.style.display = "none";
    backStepButton.style.display = "";
    submitStepButton.style.display = "";
    stepIndicator.textContent = "3 / 3";
  }
}

function afterGeometryPlaced() {
  if (isMobile()) {
    if (currentStep === 0) {
      nextStepButton.disabled = false;
      if (mapHint) mapHint.textContent = "Weiter zur Kategorie";
    }
  } else {
    desktopSubmitButton.disabled = false;
  }
}

function nextStepHandler() {
  if (currentStep >= 0 && currentStep < 3) {
    if (currentStep === 0) {
      if (!selectedGeometry) return;
      if (mapHint) mapHint.classList.add("is-hidden");
      goToStep(1);
      return;
    }
    if (currentStep === 1 && (!categorySelect.value || !typeSelect.value)) return;
    if (currentStep === 2) {
      const needsSeverity = document.querySelector("#severityLabel").style.display !== "none";
      if (needsSeverity && !document.querySelector("#severity").value) return;
      if (!document.querySelector("#duration").value) return;
    }
    goToStep(currentStep + 1);
  }
}

function backStepHandler() {
  if (currentStep > 0) {
    goToStep(currentStep - 1);
  }
}

function toggleSeverityVisibility() {
  const cat = categorySelect.value;
  const severityLabel = document.querySelector("#severityLabel");
  const severitySelect = document.querySelector("#severity");
  if (cat === "community") {
    severityLabel.style.display = "none";
    severitySelect.removeAttribute("required");
  } else {
    severityLabel.style.display = "";
    severitySelect.setAttribute("required", "");
  }
}

function startReporting() {
  isReporting = true;
  clearDraftShape();
  reportButton.classList.add("is-hidden");
  drawModes.classList.remove("is-disabled");
  modeButtons.forEach((button) => { button.disabled = false; });
  setDrawMode("point");

  const panel = document.querySelector(".panel");
  panel.classList.remove("is-hidden");
  panel.classList.add("show-form");
  panel.classList.remove("show-filters");

  if (isMobile()) {
    goToStep(0);
    nextStepButton.disabled = true;
  } else {
    formSteps.forEach(el => el.classList.add("is-active"));
  desktopSubmitButton.disabled = true;
  if (mapHint) mapHint.classList.add("is-hidden");
}

  selectedPosition.textContent = "Wähle eine Markierungsart und klicke auf die Karte.";
  drawHelp.textContent = drawHelpText.point;
  clearShapeButton.disabled = false;
  finishShapeButton.disabled = true;

  showToast("Klicke auf die Karte, um eine Position zu wählen.");
  if (isMobile() && mapHint) {
    mapHint.textContent = drawHelpText.point;
    mapHint.classList.remove("is-hidden");
  }
}

function cancelReporting() {
  isReporting = false;
  clearDraftShape();
  reportButton.classList.remove("is-hidden");
  drawModes.classList.add("is-disabled");
  modeButtons.forEach((button) => { button.disabled = true; });
  reportForm.reset();
  populateTypeOptions();
  formSteps.forEach(el => el.classList.remove("is-active"));
  goToStep(0);
  const panel = document.querySelector(".panel");
  panel.classList.add("is-hidden");
  panel.classList.remove("show-form");
  clearShapeButton.disabled = true;
  finishShapeButton.disabled = true;
  desktopSubmitButton.disabled = true;
}

function handleMapClick(event) {
  if (!isReporting) {
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
    afterGeometryPlaced();
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
    afterGeometryPlaced();
    return;
  }

  polygonPoints.push(event.latlng);
  selectedGeometry = null;
  renderDraftShape();
  updateSelectionLabel();
}

function handleMapMove(event) {
  if (!isReporting || drawMode !== "circle" || !circleCenter) {
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
  if (!isReporting) {
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
  afterGeometryPlaced();
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

  finishShapeButton.disabled = !isReporting || polygonPoints.length < 3 || selectedGeometry?.kind === "polygon";
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

  if (!isReporting) {
    selectedPosition.textContent = "Bitte zuerst eine Markierung auf der Karte setzen";
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
  cancelReporting();

  if (apiAvailable) {
    try {
      await createRemoteReport(report);
      await syncReportsFromApi();
    } catch {
      showToast("Server nicht erreichbar. Eintrag wurde nur lokal gespeichert.");
    }
  }
}

async function handlePlaceSearch(event) {
  event.preventDefault();

  const query = placeSearchInput.value.trim();

  if (query.length < 2) {
    return;
  }

  showToast("Ort wird gesucht...");

  try {
    const results = await searchPlaces(query);
    renderPlaceResults(results);
    showToast(results.length > 0
      ? "Suchergebnis auswählen."
      : "Kein Ort gefunden.");
  } catch {
    showToast("Ortssuche nicht erreichbar.");
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
      showToast("Ort gefunden.");
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
      showDetailsCard(report);
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
        showToast("Du hast diesen Eintrag bereits bewertet.");
        renderReports();
        return;
      }

      showToast("Server nicht erreichbar. Bewertung wurde nur lokal gespeichert.");
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
    showToast("Dieser Browser unterstützt Standortzugriff nicht.");
    selectedPosition.textContent = "Standort wird von diesem Browser nicht unterstützt";
    return;
  }

  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    showToast("Standort braucht auf dem Handy HTTPS. Über normale LAN-HTTP-Adressen blockt iOS den Zugriff.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      map.setView(latlng, 15);

      if (!isReporting) {
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
      showToast("Standort konnte nicht ermittelt werden oder wurde blockiert.");
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
  if (isMobile()) {
    goToStep(0);
    if (mapHint) {
      mapHint.textContent = drawHelpText[drawMode];
      mapHint.classList.remove("is-hidden");
    }
  }
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
        showToast("Lokale Einträge werden in die Datenbank übernommen...");
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
      showToast("Einträge wurden aktualisiert.");
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
  panel.classList.add("is-hidden");
  if (isReporting) {
    cancelReporting();
  }
}

function toggleMobileFilters() {
  const panel = document.querySelector(".panel");
  const isCurrentlyHidden = panel.classList.toggle("is-hidden");
  if (!isCurrentlyHidden) {
    panel.classList.add("show-filters");
    panel.classList.remove("show-form");
  }
}

function openMobileForm() {
  const panel = document.querySelector(".panel");
  panel.classList.remove("is-hidden");
  panel.classList.add("show-form");
  panel.classList.remove("show-filters");
}

function closeDetailsCard() {
  detailsCard.classList.add("is-hidden");
}

function showDetailsCard(report) {
  closeDetailsCard();
  const vote = votes[report.id];
  const created = new Date(report.createdAt).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

  detailsContent.innerHTML = `
    <h3 class="details-card-title">${escapeHtml(report.type)}</h3>
    <p class="details-card-meta">${categories[report.category].label} · ${shapeLabel(normalizeGeometry(report).kind)} · ${severityLabel(report.severity)} · ${created}</p>
    <p class="details-card-desc">${escapeHtml(report.description)}</p>
    <div class="details-card-actions">
      <button type="button" class="confirm-vote-btn" data-action="confirm" ${vote ? "disabled" : ""}>Existiert noch (${report.confirmations})</button>
      <button type="button" class="dispute-vote-btn" data-action="dispute" ${vote ? "disabled" : ""}>Nicht mehr da (${report.disputes})</button>
    </div>
    ${vote ? `<p class="details-card-voted">Du hast diesen Eintrag bereits bewertet.</p>` : ""}
  `;

  const confirmBtn = detailsContent.querySelector('.confirm-vote-btn');
  const disputeBtn = detailsContent.querySelector('.dispute-vote-btn');

  confirmBtn.addEventListener("click", async () => {
    await updateVote(report.id, "confirmations");
    const updated = reports.find(r => r.id === report.id);
    if (updated) showDetailsCard(updated);
  });

  disputeBtn.addEventListener("click", async () => {
    await updateVote(report.id, "disputes");
    const updated = reports.find(r => r.id === report.id);
    if (updated) showDetailsCard(updated);
  });

  detailsCard.classList.remove("is-hidden");
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
          showDetailsCard(report);
      }
    });

    reportsList.append(card);
  });
}
