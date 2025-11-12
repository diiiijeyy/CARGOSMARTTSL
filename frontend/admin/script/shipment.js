/* ============================================================
   TSL Freight Movers — Admin Shipments (Map + GPS + Actions)
   ============================================================ */

let pendingGPSUpdates = [];        // buffer GPS updates before map loads
let mapMarkers = {};               // active map markers per shipment
let markerAnimations = {};         // small trails memory
let lastPositions = {};            // last known coordinates per shipment
let allShipments = [];             // cache from /api/admin/shipments
let ws = null;

/* ==============================
   Configuration
   ============================== */
const CONFIG = {
  apiUrl: "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/shipments",
  notifUrl: "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications",
  gpsUrl: "https://caiden-recondite-psychometrically.ngrok-free.dev/api/gps",
  assignGpsUrl: "https://caiden-recondite-psychometrically.ngrok-free.dev/api/assign-gps",
  wsUrl: "wss://caiden-recondite-psychometrically.ngrok-free.dev",
  defaultCenter: [14.5995, 120.9842],
  defaultZoom: 13,
  mapTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  mapAttribution: "© OpenStreetMap contributors",
};

/* ==============================
   DOM Elements
   ============================== */
const elements = {
  tableBody: document.getElementById("recent-shipments-table"),
  modalEl: document.getElementById("shipmentDetailsModal"),
  detailsBody: document.getElementById("shipmentDetailsBody"),
  mapId: "shipmentMap",
};

/* ==============================
   State
   ============================== */
const state = {
  shipments: [],
  activeShipmentId: null,
};

let modalMap = null;

/* ==============================
   WebSocket stream for GPS updates
   ============================== */
function initWebSocket() {
  try {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return; // already connected / connecting
    }
  } catch (_) {}

  ws = new WebSocket(CONFIG.wsUrl);

  ws.onopen = () => console.log("GPS WebSocket connected");

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // Initial batch from server
      if (data.type === "init" || data.type === "init_data") {
        const allData = data.data || {};
        Object.entries(allData).forEach(([shipmentId, coords]) => {
          const lat = Number(coords.latitude);
          const lng = Number(coords.longitude);
          if (isFinite(lat) && isFinite(lng)) {
            lastPositions[String(shipmentId)] = {
              lat,
              lng,
              t: Number(coords.timestamp) || Date.now(),
            };
          }
        });
        return;
      }

      // Live update payload shape: { type, shipmentId?, deviceId?, latitude, longitude, timestamp }
      if ((data.deviceId || data.shipmentId) && data.latitude != null && data.longitude != null) {
        const newLat = Number(data.latitude);
        const newLng = Number(data.longitude);
        if (!isFinite(newLat) || !isFinite(newLng)) return;

        // Resolve shipment id
        const resolvedShipmentId = String(
          data.shipmentId ||
          (allShipments.find((s) => s.device_id === data.deviceId)?.id) ||
          ""
        );
        if (!resolvedShipmentId) return;

        // De-dup small jitter
        const last = lastPositions[resolvedShipmentId];
        const moved =
          !last ||
          Math.abs(last.lat - newLat) > 0.00005 ||
          Math.abs(last.lng - newLng) > 0.00005;
        if (!moved) return;

        // Persist last known position
        lastPositions[resolvedShipmentId] = {
          lat: newLat,
          lng: newLng,
          t: Number(data.timestamp) || Date.now(),
        };

        // If the active shipment is open, animate now; otherwise buffer
        if (modalMap && state.activeShipmentId && String(state.activeShipmentId) === resolvedShipmentId) {
          updateShipmentMarkerSmooth(resolvedShipmentId, newLat, newLng);
          if (mapMarkers[resolvedShipmentId]) {
            mapMarkers[resolvedShipmentId].setLatLng([newLat, newLng]);
          }
        } else {
          // Buffer only the latest per shipment (replace any older buffered item)
          pendingGPSUpdates = pendingGPSUpdates.filter((u) => String(u.shipmentid) !== resolvedShipmentId);
          pendingGPSUpdates.push({
            shipmentid: resolvedShipmentId,
            latitude: newLat,
            longitude: newLng,
          });
        }
      }
    } catch (err) {
      console.error("GPS parse error:", err);
    }
  };

  ws.onclose = () => {
    console.warn("GPS socket closed — reconnecting in 3s...");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (e) => {
    console.warn("GPS socket error:", e?.message || e);
  };
}

/* ==============================
   GPS + API helpers
   ============================== */
async function hasAssignedGpsDevice(id) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/assigned/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.device_id ? data : null;
  } catch {
    return null;
  }
}

async function fetchGpsHistory(id) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/history/${id}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function fetchLatestPosition(id) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/latest/${id}`);
    if (!res.ok) return null;
    const latest = await res.json();
    if (latest && latest.latitude != null && latest.longitude != null) {
      return {
        lat: Number(latest.latitude),
        lng: Number(latest.longitude),
        t: Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ==============================
   Update/Create shipment marker (non-animated)
   ============================== */
async function updateShipmentMarker(shipmentId, lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return;
  if (!modalMap) return;

  shipmentId = String(shipmentId);
  if (mapMarkers[shipmentId]) {
    mapMarkers[shipmentId].setLatLng([lat, lng]);
  } else {
    const marker = L.marker([lat, lng]).addTo(modalMap).bindPopup(
      `<b>Shipment #${shipmentId}</b><br>Lat: ${lat.toFixed(5)}<br>Lng: ${lng.toFixed(5)}`
    );
    mapMarkers[shipmentId] = marker;

    hasAssignedGpsDevice(shipmentId).then((assigned) => {
      if (assigned && assigned.device_id) {
        marker.device_id = assigned.device_id;
      }
    });
  }
}

/* ==============================
   Smoothly move markers (animated GPS updates)
   ============================== */
function updateShipmentMarkerSmooth(shipmentId, newLat, newLng) {
  if (!modalMap || !isFinite(newLat) || !isFinite(newLng)) return;

  shipmentId = String(shipmentId);
  if (!markerAnimations[shipmentId]) markerAnimations[shipmentId] = [];

  // Create icon if missing
  if (!mapMarkers[shipmentId]) {
    const truckIcon = L.divIcon({
      html: '<i class="fas fa-truck-moving" style="font-size:28px;"></i>',
      className: "truck-marker",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    const marker = L.marker([newLat, newLng], { icon: truckIcon }).addTo(modalMap);
    mapMarkers[shipmentId] = marker;
    markerAnimations[shipmentId].push([newLat, newLng]);
    return;
  }

  const marker = mapMarkers[shipmentId];
  const oldPos = marker.getLatLng();
  const steps = 25;
  const duration = 1200;
  const stepLat = (newLat - oldPos.lat) / steps;
  const stepLng = (newLng - oldPos.lng) / steps;
  let currentStep = 0;

  // Heading rotation (optional)
  const iconEl = marker.getElement()?.querySelector("i");
  if (iconEl) {
    const angle = Math.atan2(newLng - oldPos.lng, newLat - oldPos.lat) * (180 / Math.PI);
    iconEl.style.transition = "transform 0.3s linear";
    iconEl.style.transform = `rotate(${angle}deg)`;
  }

  // Fading small trail segment
  const prevPoint = markerAnimations[shipmentId].slice(-1)[0];
  const newPoint = [newLat, newLng];
  markerAnimations[shipmentId].push(newPoint);

  if (prevPoint) {
    const trail = L.polyline([prevPoint, newPoint], {
      color: "#0077b6",
      weight: 3,
      opacity: 0.8,
    }).addTo(modalMap);

    let opacity = 0.8;
    const fadeInterval = setInterval(() => {
  opacity -= 0.1;
  if (opacity <= 0) {
    clearInterval(fadeInterval);
    if (modalMap && typeof modalMap.removeLayer === "function") {
      try {
        modalMap.removeLayer(trail);
      } catch (_) {}
    }
  } else if (modalMap && typeof trail.setStyle === "function") {
    trail.setStyle({ opacity });
  }
}, 400);

  }

  const moveInterval = setInterval(() => {
    if (currentStep >= steps) {
      clearInterval(moveInterval);
      marker.setLatLng([newLat, newLng]);
      return;
    }
    const lat = oldPos.lat + stepLat * currentStep;
    const lng = oldPos.lng + stepLng * currentStep;
    marker.setLatLng([lat, lng]);
    currentStep++;
  }, duration / steps);
}

/* ==============================
   Notifications
   ============================== */
function ensureNotificationModal() {
  if (document.getElementById("notificationModal")) return;
  const modalHTML = `
    <div class="modal fade" id="notificationModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:520px;width:92%;">
        <div class="modal-content border-0 shadow-sm">
          <div class="modal-body p-3 rounded d-flex align-items-center gap-3" id="notificationBody" style="background:#0077b6;color:#fff;">
            <i id="notificationIcon" class="fas fa-info-circle" style="font-size:22px;"></i>
            <div>
              <h6 class="mb-1 fw-bold" id="notificationTitle">Notification</h6>
              <div id="notificationMessage">Message here</div>
            </div>
            <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="modal"></button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

const NotificationTheme = {
  success: { accent: "#2fbf71", icon: "fas fa-check-circle", title: "Success" },
  warning: { accent: "#ffc107", icon: "fas fa-exclamation-triangle", title: "Warning" },
  error:   { accent: "#e63946", icon: "fas fa-times-circle", title: "Error" },
  info:    { accent: "#0d6efd", icon: "fas fa-info-circle", title: "Info" },
};

function showNotification(arg1, arg2, arg3) {
  ensureNotificationModal();
  let title, message, variant;
  if (typeof arg1 === "object") {
    ({ title, message, variant } = arg1);
  } else {
    title = arg1;
    message = arg2;
    variant = arg3 || "info";
  }

  const theme = NotificationTheme[variant] || NotificationTheme.info;
  const body = document.getElementById("notificationBody");
  const iconEl = document.getElementById("notificationIcon");
  const titleEl = document.getElementById("notificationTitle");
  const msgEl = document.getElementById("notificationMessage");

  body.style.background = theme.accent;
  iconEl.className = theme.icon;
  titleEl.textContent = title;
  msgEl.innerHTML = message;

  const modal = new bootstrap.Modal(document.getElementById("notificationModal"));
  modal.show();
  setTimeout(() => modal.hide(), 1800);
}

/* ==============================
   Show Shipment Details (map + progress)
   ============================== */
async function showShipmentDetails(shipment) {
  state.activeShipmentId = String(shipment.id);

  const card = document.getElementById("shipmentDetailsCard");
  if (!card) {
    console.error("shipmentDetailsCard not found in DOM");
    return;
  }

  // ✅ Always remove old map safely
  if (modalMap) {
    try {
      modalMap.remove();
    } catch (_) {}
    modalMap = null;
  }

  // ✅ Render shipment tracker
  if (typeof renderOrderTrackerHTML === "function") {
    card.innerHTML = renderOrderTrackerHTML(shipment);
  }

  // ✅ Progress step tracker
  const statusKey = normalizeShipmentStatus(shipment.status);
  const steps = ["processed", "shipped", "en_route", "delivered"];
  const idx = Math.max(0, steps.indexOf(statusKey));
  if (typeof setOrderStep === "function") setOrderStep(idx);

  // ✅ Open modal first
  const modal = new bootstrap.Modal(document.getElementById("shipmentDetailsModal"));
  modal.show();

  // ✅ Ensure GPS assignment
  await loadAssignedGPS(shipment.id);
  const hasDevice = await hasAssignedGpsDevice(shipment.id);
  if (!hasDevice) {
    showNotification({
      variant: "warning",
      title: "No GPS Assigned",
      message: `Shipment #${shipment.tracking_number || shipment.id} has no GPS device assigned.`,
    });

    const mapContainer = document.getElementById("shipmentMap");
    if (mapContainer)
      mapContainer.innerHTML = `<div class="text-center text-muted py-4">No GPS device assigned</div>`;

    const unassignBtn = document.getElementById("unassignGpsBtn");
    if (unassignBtn) unassignBtn.style.display = "none";
    return;
  } else {
    const unassignBtn = document.getElementById("unassignGpsBtn");
    if (unassignBtn) {
      unassignBtn.style.display = "inline-block";
      unassignBtn.onclick = () => unassignGpsDevice(hasDevice.device_id || hasDevice.id);
    }
  }

  // ✅ Initialize new map (delay ensures modal body exists)
  setTimeout(async () => {
    // Cache last known location
    if (shipment.specific_lat && shipment.specific_lon) {
      lastPositions[shipment.id] = {
        lat: Number(shipment.specific_lat),
        lng: Number(shipment.specific_lon),
      };
    }

    let latestLive = lastPositions[shipment.id];
    let centerLat, centerLon;

    // Fallback to latest from DB if missing
    if (!latestLive || !isFinite(latestLive.lat) || !isFinite(latestLive.lng)) {
      const latest = await fetchLatestPosition(shipment.id);
      if (latest) {
        lastPositions[shipment.id] = latest;
        latestLive = latest;
        console.log(`Fetched latest live GPS for shipment ${shipment.id}`, latest);
      }
    }

    if (latestLive && isFinite(latestLive.lat) && isFinite(latestLive.lng)) {
      centerLat = latestLive.lat;
      centerLon = latestLive.lng;
    } else {
      centerLat = CONFIG.defaultCenter[0];
      centerLon = CONFIG.defaultCenter[1];
      console.log(`No GPS found for shipment ${shipment.id}, using default center`);
    }

    // ✅ Build map fresh every time
    modalMap = L.map(elements.mapId).setView([centerLat, centerLon], CONFIG.defaultZoom);
    L.tileLayer(CONFIG.mapTileUrl, { attribution: CONFIG.mapAttribution }).addTo(modalMap);

// ✅ Restore last known GPS marker when reopening modal
const cachedPos = lastPositions[shipment.id];
if (cachedPos && isFinite(cachedPos.lat) && isFinite(cachedPos.lng)) {
  const truckIcon = L.divIcon({
    html: '<i class="fas fa-truck-moving" style="font-size:28px;color:#0077b6;"></i>',
    className: "truck-marker",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  const marker = L.marker([cachedPos.lat, cachedPos.lng], { icon: truckIcon }).addTo(modalMap);
  mapMarkers[shipment.id] = marker;
  modalMap.setView([cachedPos.lat, cachedPos.lng], CONFIG.defaultZoom);
  console.log(`✅ Restored cached marker for shipment ${shipment.id}`, cachedPos);
}


    // ✅ Add ports
    if (shipment.origin_lat && shipment.origin_lon) {
      L.marker([shipment.origin_lat, shipment.origin_lon], {
        icon: L.divIcon({
          className: "origin-marker",
          html: '<i class="fas fa-warehouse" style="color:#2e7fc0;font-size:24px;"></i>',
          iconSize: [24, 24],
        }),
      })
        .addTo(modalMap)
        .bindPopup(`<b>Port of Origin:</b> ${shipment.origin || shipment.port_origin || "-"}`);
    }

    if (shipment.delivery_lat && shipment.delivery_lon) {
      L.marker([shipment.delivery_lat, shipment.delivery_lon], {
        icon: L.divIcon({
          className: "dest-marker",
          html: '<i class="fas fa-map-marker-alt" style="color:#60adf4;font-size:26px;"></i>',
          iconSize: [26, 26],
        }),
      })
        .addTo(modalMap)
        .bindPopup(`<b>Port of Delivery:</b> ${shipment.destination || shipment.port_delivery || "-"}`);
    }

    // ✅ Always show last known GPS marker
    if (latestLive && isFinite(latestLive.lat) && isFinite(latestLive.lng)) {
      updateShipmentMarkerSmooth(String(shipment.id), latestLive.lat, latestLive.lng);
    }

    // ✅ Replay any pending GPS updates
    const buffered = pendingGPSUpdates.filter((u) => String(u.shipmentid) === String(shipment.id));
    for (const b of buffered) {
      updateShipmentMarkerSmooth(String(shipment.id), b.latitude, b.longitude);
    }
    pendingGPSUpdates = pendingGPSUpdates.filter((u) => String(u.shipmentid) !== String(shipment.id));

    startGpsTracking(shipment.id, modalMap);
  }, 250);
}

// ✅ Keep the map responsive
document.getElementById("shipmentDetailsModal")?.addEventListener("shown.bs.modal", () => {
  if (modalMap) setTimeout(() => modalMap.invalidateSize(), 200);
});

// ✅ Keep cache but safely reset map
document.getElementById("shipmentDetailsModal")?.addEventListener("hidden.bs.modal", () => {
  // Only try to remove the map if it actually exists
  if (modalMap && typeof modalMap.remove === "function") {
    try {
      modalMap.eachLayer((layer) => {
        // remove all non-tile layers only
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          modalMap.removeLayer(layer);
        }
      });
      modalMap.remove();
    } catch (err) {
      console.warn("Map cleanup skipped:", err);
    }
  }
  modalMap = null; // reset reference
});

/* ==============================
   Load assigned GPS info (badge in UI)
   ============================== */
async function loadAssignedGPS(shipmentId) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/assigned/${shipmentId}`);
    if (res.status === 404) {
      const gpsStatus = document.getElementById("gpsStatus");
      if (gpsStatus) {
        gpsStatus.innerHTML = `
          <div class="alert alert-warning py-2 px-3 mb-2">
            No GPS device assigned.
          </div>`;
      }
      return;
    }
    if (!res.ok) return;

    const data = await res.json();
    const gpsStatus = document.getElementById("gpsStatus");
    if (!gpsStatus) return;

    gpsStatus.innerHTML = `
      <div class="alert alert-success py-2 px-3 mb-2">
        <b>${data.device_id || ""}</b> assigned<br>
        Notes: ${data.notes || "None"}<br>
        Assigned: ${data.assigned_at ? new Date(data.assigned_at).toLocaleString() : "-"}
      </div>`;
  } catch (err) {
    console.debug("loadAssignedGPS silent:", err);
  }
}

/* ==============================
   View Handlers
   ============================== */
function attachViewHandlers() {
  document.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const shipmentId = btn.dataset.id;
      const shipment = state.shipments.find((s) => String(s.id) === String(shipmentId));
      if (shipment) showShipmentDetails(shipment);
      else console.error(`Shipment ${shipmentId} not found`);
    });
  });
}

/* ==============================
   Action Handlers
   ============================== */
function attachActionHandlers() {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const shipmentId = e.currentTarget.dataset.id;
      const newStatus = e.currentTarget.dataset.status;
      await updateShipmentStatus(shipmentId, newStatus);
    });
  });
}

/* ==============================
   Update shipment status
   ============================== */
async function updateShipmentStatus(shipmentId, newStatus) {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/${shipmentId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");

    showNotification({
      variant: "success",
      title: "Status Updated",
      message: `Shipment #${shipmentId} marked as "${newStatus}".`,
    });

    fetchShipments();
  } catch (err) {
    console.error("Status update failed:", err);
    showNotification({
      variant: "error",
      title: "Update Failed",
      message: err.message,
    });
  }
}

/* ==============================
   Render shipments table (simple)
   ============================== */
function renderShipmentsTable() {
  if (!elements.tableBody) return;
  elements.tableBody.innerHTML = "";
  const visible = state.shipments.filter((s) =>
    ["approved", "shipping", "in transit"].includes((s.status || "").toLowerCase())
  );
  if (visible.length === 0) {
    elements.tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No approved shipments</td></tr>`;
    return;
  }
  visible.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.tracking_number ?? s.id}</td>
      <td>${s.company_name ?? "-"}</td>
      <td>${s.origin ?? "-"}</td>
      <td>${s.destination ?? "-"}</td>
      <td>${s.expected_delivery_date ? new Date(s.expected_delivery_date).toLocaleDateString() : "-"}</td>
      <td>
        <span class="badge ${getBadgeClass(s.status)}">${s.status || "Unknown"}</span>
      </td>
      <td>
        <button class="shipment-action-btn btn-view" data-id="${s.id}" title="View">View</button>
      </td>
      <td>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-warning rounded-circle action-btn" data-id="${s.id}" data-status="Shipping" title="Shipping"><i class="fas fa-ship text-white"></i></button>
          <button class="btn btn-sm btn-info rounded-circle action-btn" data-id="${s.id}" data-status="In Transit" title="In Transit"><i class="fas fa-truck text-white"></i></button>
          <button class="btn btn-sm btn-success rounded-circle action-btn" data-id="${s.id}" data-status="Delivered" title="Delivered"><i class="fas fa-box-open text-white"></i></button>
        </div>
      </td>`;
    elements.tableBody.appendChild(tr);
  });
  attachActionHandlers();
  attachViewHandlers();
}

/* ==============================
   Fetch shipments + pagination (compact)
   ============================== */
let currentPage = 1;
const rowsPerPage = 10;
let totalPages = 1;

async function fetchShipments() {
  try {
    const res = await fetch(CONFIG.apiUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch shipments: ${res.status}`);
    const data = await res.json();

    allShipments = data;
    state.shipments = data;

    renderPaginatedShipments(1);
  } catch (err) {
    console.error("Error loading shipments:", err);
    if (elements.tableBody)
      elements.tableBody.innerHTML = `<tr><td colspan="9" class="text-danger text-center py-4">Failed to load shipments</td></tr>`;
  }
}

function getBadgeClass(status) {
  if (!status) return "badge-pending";
  const s = status.toLowerCase();
  if (s.includes("approved")) return "badge-approved";
  if (s.includes("shipping")) return "badge-shipping";
  if (s.includes("transit")) return "badge-transit";
  if (s.includes("delivered")) return "badge-delivered";
  if (s.includes("processed") || s.includes("booked")) return "badge-processed";
  if (s.includes("pending")) return "badge-pending";
  if (s.includes("cancelled") || s.includes("declined") || s.includes("returned")) return "badge-cancelled";
  return "badge-pending";
}

function renderPaginatedShipments(page = 1) {
  const visible = state.shipments.filter((s) =>
    ["approved", "shipping", "in transit"].includes((s.status || "").toLowerCase())
  );

  totalPages = Math.ceil(visible.length / rowsPerPage);
  currentPage = Math.max(1, Math.min(page, totalPages));

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const paginated = visible.slice(start, end);

  const tbody = elements.tableBody;
  tbody.innerHTML = "";

  if (paginated.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No shipments found</td></tr>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  paginated.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.tracking_number ?? s.id}</td>
      <td>${s.company_name ?? "-"}</td>
      <td>${s.origin ?? "-"}</td>
      <td>${s.destination ?? "-"}</td>
      <td>${s.expected_delivery_date ? new Date(s.expected_delivery_date).toLocaleDateString() : "-"}</td>
      <td>
        <span class="badge ${getBadgeClass(s.status)}">${s.status || "Unknown"}</span>
      </td>
      <td>
        <button class="shipment-action-btn btn-view" data-id="${s.id}" title="View">View</button>
      </td>
      <td>
        <div class="d-flex gap-2 justify-content-center">
          <button class="shipment-action-btn btn-shipping" data-id="${s.id}" data-status="Shipping">Shipping</button>
          <button class="shipment-action-btn btn-intransit" data-id="${s.id}" data-status="In Transit">In Transit</button>
          <button class="shipment-action-btn btn-delivered" data-id="${s.id}" data-status="Delivered">Delivered</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  attachActionHandlers();
  attachViewHandlers();
  renderPaginationControls();
}

function renderPaginationControls() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  if (totalPages <= 1) return;

  const pagination = document.createElement("ul");
  pagination.className = "pagination justify-content-center mt-3";

  const prevItem = document.createElement("li");
  prevItem.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  prevItem.innerHTML = `<button class="page-link custom-page" ${currentPage === 1 ? "disabled" : ""}><i class="fas fa-chevron-left"></i></button>`;
  prevItem.onclick = () => {
    if (currentPage > 1) renderPaginatedShipments(currentPage - 1);
  };
  pagination.appendChild(prevItem);

  const startPage = Math.floor((currentPage - 1) / 3) * 3 + 1;
  const endPage = Math.min(startPage + 2, totalPages);
  for (let i = startPage; i <= endPage; i++) {
    const pageItem = document.createElement("li");
    pageItem.className = `page-item ${i === currentPage ? "active" : ""}`;
    pageItem.innerHTML = `<button class="page-link custom-page">${i}</button>`;
    pageItem.onclick = () => renderPaginatedShipments(i);
    pagination.appendChild(pageItem);
  }

  const nextItem = document.createElement("li");
  nextItem.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
  nextItem.innerHTML = `<button class="page-link custom-page" ${currentPage === totalPages ? "disabled" : ""}><i class="fas fa-chevron-right"></i></button>`;
  nextItem.onclick = () => {
    if (currentPage < totalPages) renderPaginatedShipments(currentPage + 1);
  };
  pagination.appendChild(nextItem);

  container.appendChild(pagination);
}

/* ==============================
   Populate shipment dropdown (for assigning)
   ============================== */
async function populateShipmentDropdown() {
  const dropdown = document.getElementById("gpsShipment");
  if (!dropdown) return;

  dropdown.innerHTML = `<option value="">Loading...</option>`;

  try {
    const res = await fetch(CONFIG.apiUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch shipments (${res.status})`);

    const shipments = await res.json();
    dropdown.innerHTML = `<option value="">Select Shipment...</option>`;

    const filtered = shipments.filter((s) =>
      ["approved", "shipping", "in transit"].includes((s.status || "").toLowerCase())
    );

    if (filtered.length === 0) {
      dropdown.innerHTML = `<option value="">No available shipments</option>`;
      return;
    }

    filtered.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.tracking_number || "Shipment #" + s.id} (${s.status})`;
      dropdown.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to populate dropdown:", err);
    dropdown.innerHTML = `<option value="">Failed to load shipments</option>`;
  }
}

/* ==============================
   Start GPS tracking (keeps only active marker)
   ============================== */
function startGpsTracking(shipmentId, map) {
  state.activeShipmentId = shipmentId;
  for (const id in mapMarkers) {
    if (String(id) !== String(shipmentId)) {
      try {
        map.removeLayer(mapMarkers[id]);
      } catch (_) {}
      delete mapMarkers[id];
    }
  }
}

/* ==============================
   Add & Assign GPS device
   ============================== */
const addGpsForm = document.getElementById("addGpsForm");
if (addGpsForm) {
  addGpsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const device_id = document.getElementById("gpsImei").value.trim();
    const shipment_id = document.getElementById("gpsShipment").value.trim();
    const notes = document.getElementById("gpsNotes").value.trim();

    if (!device_id || !shipment_id) {
      alert("Please enter device ID and select a shipment.");
      return;
    }

    try {
      const res = await fetch(`${CONFIG.gpsUrl}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id, shipment_id, notes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add and assign GPS device.");

      alert(data.message);
      addGpsForm.reset();
      bootstrap.Modal.getInstance(document.getElementById("addGpsModal")).hide();
    } catch (err) {
      alert("Error: " + err.message);
    }
  });
}

/* ==============================
   Unassign GPS device
   ============================== */
async function unassignGpsDevice(device_id) {
  if (!device_id) {
    alert("No device ID provided.");
    return;
  }

  if (!confirm(`Are you sure you want to unassign device "${device_id}"?`)) return;

  try {
    const res = await fetch(`${CONFIG.gpsUrl}/unassign/${device_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to unassign device.");

    showNotification({
      variant: "success",
      title: "GPS Device Unassigned",
      message: data.message || `Device ${device_id} unassigned successfully.`,
    });

    // Remove marker immediately
    for (const [shipmentId, marker] of Object.entries(mapMarkers)) {
      if (marker.device_id === device_id) {
        try { modalMap.removeLayer(marker); } catch(_) {}
        delete mapMarkers[shipmentId];
      }
    }

    await fetchShipments();
  } catch (err) {
    showNotification({
      variant: "error",
      title: "Unassign Failed",
      message: err.message,
    });
  }
}

/* ==============================
   Order tracker helpers
   ============================== */
function normalizeShipmentStatus(s) {
  s = (s || "").toLowerCase();
  if (["pending", "approved", "processing", "processed", "booked", "awaiting pickup"].includes(s)) return "processed";
  if (["shipping", "shipped", "dispatch"].includes(s)) return "shipped";
  if (["in transit", "transit", "en route", "out for delivery"].includes(s)) return "en_route";
  if (["delivered", "completed", "arrival", "arrived"].includes(s)) return "delivered";
  return "processed";
}

function renderOrderTrackerHTML(shipment) {
  const statusKey = normalizeShipmentStatus(shipment?.status);
  const steps = ["processed", "shipped", "en_route", "delivered"];
  const idx = Math.max(0, steps.indexOf(statusKey));
  const pct = (idx / (steps.length - 1)) * 100;
  const cls = (n) => (n < idx ? "is-done" : n === idx ? "is-current" : "is-future");

  const orderId = shipment?.tracking_number || shipment?.id || "—";
  const origin = shipment?.origin || shipment?.port_origin || "—";
  const destination = shipment?.destination || shipment?.port_destination || "—";
  const eta = shipment?.expected_delivery_date
    ? new Date(shipment.expected_delivery_date).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return `
<section class="ot ot-lg card border-0 p-3">
  <div class="d-flex flex-wrap justify-content-between align-items-start">
    <h6 class="mb-2 fw-semibold d-flex align-items-center">
      <i class="bi bi-truck-front-fill ot-title-icon text-primary me-2"></i>
      <span>ORDER <span class="text-primary">#${orderId}</span></span>
    </h6>
    <div class="text-end small">
      <div>Expected Delivery <strong>${eta}</strong></div>
    </div>
  </div>
  <div class="ot-route mt-1">
    <span>${origin}</span>
    <i class="bi bi-arrow-right-short mx-1"></i>
    <span>${destination}</span>
  </div>
  <div class="ot-progress mt-4">
    <div class="ot-line"></div>
    <div class="ot-line-fill" style="width:${pct}%"></div>
    <div class="ot-steps">
      <div class="ot-step ${cls(0)}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Booking Processed</div></div>
      <div class="ot-step ${cls(1)}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Order Shipped</div></div>
      <div class="ot-step ${cls(2)}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">In Transit</div></div>
      <div class="ot-step ${cls(3)}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Delivered</div></div>
    </div>
  </div>
</section>`;
}

/* ==============================
   Notifications polling
   ============================== */
const notifCountEl = document.getElementById("notifCount");

async function fetchNotifications() {
  try {
    const res = await fetch(CONFIG.notifUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();
    if (!notifCountEl) return;

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0";
      notifCountEl.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* ==============================
   INIT
   ============================== */
function initApp() {
  fetchShipments();
  fetchNotifications();
  initWebSocket();
  setInterval(fetchNotifications, 30000);
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();

  const addGpsModal = document.getElementById("addGpsModal");
  if (addGpsModal) {
    addGpsModal.addEventListener("show.bs.modal", populateShipmentDropdown);
  }
});

// also refresh notifications on a cadence
setInterval(fetchNotifications, 30000);
