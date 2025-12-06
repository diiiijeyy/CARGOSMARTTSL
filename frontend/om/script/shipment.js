let pendingGPSUpdates = []; // buffer GPS updates before map loads
let mapMarkers = {}; // active map markers per shipment
let markerAnimations = {}; // small trails memory
let lastPositions = {}; // last known coordinates per shipment
let allShipments = []; // cache from /api/admin/shipments
let ws = null;

let currentStatusFilter = "all";
let currentSearch = "";

let adminRouteLayer = null;
let adminRouteCoordinates = [];
let adminLastRouteStart = {}; // store per shipment
const ADMIN_ROUTE_REDRAW_MIN_DISTANCE = 50; // meters
let autoFollow = true; // Map will follow the truck unless user moves map

let adminLiveLine = null;

/* ==============================
   Configuration
   ============================== */
const CONFIG = {
  apiUrl:
    "https://cargosmarttsl-1.onrender.com/api/admin/shipments",
  notifUrl:
    "https://cargosmarttsl-1.onrender.com/api/admin/notifications",
  wsUrl: "wss://cargosmarttsl-1.onrender.com",
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

function computeBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);

  lat1 = toRad(lat1);
  lat2 = toRad(lat2);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = Math.atan2(y, x);
  return (toDeg(brng) + 360) % 360;
}

/* ==============================
   Mga dinagdag ko (RUDY)
   ============================== */

// Convert driverId → shipmentId
function getShipmentIdByDriverId(driverId) {
  if (!driverId) return null;

  const shipment = state.shipments.find(
    (s) => String(s.driver_id) === String(driverId)
  );

  return shipment ? String(shipment.id) : null;
}

let modalMap = null;

/* ==============================
   WebSocket stream for GPS updates
   ============================== */
function initWebSocket() {
  try {
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
  } catch (_) {}

  ws = new WebSocket(CONFIG.wsUrl);

  ws.onopen = () => console.log("✅ GPS WebSocket connected (admin)");

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      /* ==============================
         1) INITIAL COORDINATE BATCH
         ============================== */
      if (data.type === "init" || data.type === "init_data") {
        const allData = data.data || {};
        console.log("🟦 INIT DATA RECEIVED:", allData);

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

      /* ==============================
         2) LIVE DRIVER GPS UPDATE
         ============================== */
      if (
        data.type === "gps_update" ||
        data.type === "update" ||
        data.type === "driver_location" ||
        data.type === "driver_gps"
      ) {
        const resolvedShipmentId = String(
          data.shipmentId || getShipmentIdByDriverId(data.driverId)
        );

        const newLat = Number(data.latitude || data.lat);
        const newLng = Number(data.longitude || data.lng);

        if (!resolvedShipmentId || !isFinite(newLat) || !isFinite(newLng)) {
          console.warn(
            "⚠ GPS update ignored – invalid data",
            data,
            "resolvedShipmentId:",
            resolvedShipmentId
          );
          return;
        }

        const shipment = state.shipments.find(
          (s) => String(s.id) === resolvedShipmentId
        );

        if (!shipment) {
          console.warn(
            "⚠ GPS update for shipment that is not in state.shipments yet:",
            resolvedShipmentId
          );
          return;
        }

        if (String(shipment.status).toLowerCase() === "delivered") {
          console.log(
            "ℹ GPS ignored because shipment already delivered:",
            resolvedShipmentId
          );
          return;
        }

        if (!shipment.driver_id) {
          console.log(
            "ℹ GPS ignored because shipment has no driver_id:",
            resolvedShipmentId
          );
          return;
        }

        console.log(
          `📡 GPS → Shipment #${resolvedShipmentId} | ${newLat}, ${newLng}`
        );

        // jitter filter
        const last = lastPositions[resolvedShipmentId];
        const moved =
          !last ||
          Math.abs(last.lat - newLat) > 0.00001 ||
          Math.abs(last.lng - newLng) > 0.00001;

        if (!moved) {
          // console.log("🟡 Ignoring tiny jitter for shipment", resolvedShipmentId);
          return;
        }

        // save last coord
        lastPositions[resolvedShipmentId] = {
          lat: newLat,
          lng: newLng,
          t: Date.now(),
        };

        /* ==============================
           3) If modal is open → live marker move
           ============================== */
        if (
          modalMap &&
          state.activeShipmentId &&
          String(state.activeShipmentId) === resolvedShipmentId
        ) {
          console.log(
            "🟢 Applying LIVE GPS to active modal shipment:",
            resolvedShipmentId
          );
          updateShipmentMarker(resolvedShipmentId, newLat, newLng);

          const shipment = state.shipments.find(
            (s) => String(s.id) === resolvedShipmentId
          );
          if (!shipment || !shipment.driver_id) return;

          if (shipment?.delivery_lat && shipment?.delivery_lon) {
            drawAdminRoute(resolvedShipmentId, newLat, newLng);
          }

          if (mapMarkers[resolvedShipmentId]) {
            mapMarkers[resolvedShipmentId].setLatLng([newLat, newLng]);
          }
        } else {
          /* ==============================
             4) Modal closed → buffer update
             ============================== */
          console.log(
            "📦 Buffering GPS update for shipment (modal closed):",
            resolvedShipmentId
          );

          pendingGPSUpdates = pendingGPSUpdates.filter(
            (u) => String(u.shipmentid) !== resolvedShipmentId
          );

          pendingGPSUpdates.push({
            shipmentid: resolvedShipmentId,
            latitude: newLat,
            longitude: newLng,
          });
        }
      }
    } catch (err) {
      console.error("GPS parse error:", err, "raw:", event.data);
    }
  };

  ws.onclose = () => {
    console.warn("GPS socket closed — reconnecting in 3s…");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (e) => {
    console.warn("GPS socket error:", e?.message || e);
  };
}

//===================================//
//            GPS CODES             //
//=================================//
async function drawAdminRoute(shipmentId, startLat, startLng) {
  const shipment = state.shipments.find(
    (s) => String(s.id) === String(shipmentId)
  );
  if (!shipment) {
    console.warn(
      "❌ drawAdminRoute: shipment not found in state for id",
      shipmentId
    );
    return;
  }

  // Ensure that the origin coordinates are valid
  if (!isFinite(startLat) || !isFinite(startLng)) {
    console.warn("❌ Invalid origin coordinates:", startLat, startLng);
    return;
  }

  // Ensure the destination coordinates are valid (priority: specific_lat > delivery_lat)
  let destLat = null;
  let destLng = null;

  if (isFinite(shipment.specific_lat) && isFinite(shipment.specific_lon)) {
    destLat = Number(shipment.specific_lat);
    destLng = Number(shipment.specific_lon);
  } else if (
    isFinite(shipment.delivery_lat) &&
    isFinite(shipment.delivery_lon)
  ) {
    destLat = Number(shipment.delivery_lat);
    destLng = Number(shipment.delivery_lon);
  }

  if (!isFinite(destLat) || !isFinite(destLng)) {
    console.warn(
      "❌ No valid destination coordinates for shipment:",
      shipmentId
    );
    return;
  }

  console.log("🧭 ADMIN ROUTE REQUEST:", {
    shipmentId,
    startLat,
    startLng,
    destLat,
    destLng,
  });

  // Now we can safely send the request to ORS
  try {
    const url = `/api/map/route?originLat=${startLat}&originLng=${startLng}&destLat=${destLat}&destLng=${destLng}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("⚠ ORS HTTP error:", res.status);
      return;
    }

    const json = await res.json();
    let coords = json.features?.[0]?.geometry?.coordinates;

    // Check if ORS returned coordinates
    if (!coords || coords.length < 2) {
      console.warn("⚠ ORS returned NO route — skipping draw.");
      showNotification({
        variant: "warning",
        title: "No Route Found",
        message: `Could not find a route between the driver and the destination for shipment #${shipmentId}.`,
      });
      return;
    }

    const latlng = coords.map((c) => [c[1], c[0]]);

    if (adminRouteLayer && modalMap) {
      modalMap.removeLayer(adminRouteLayer);
    }

    if (modalMap) {
      adminRouteLayer = L.polyline(latlng, {
        color: "#0077b6",
        weight: 5,
        opacity: 0.95,
      }).addTo(modalMap);

      adminRouteCoordinates = latlng;
    }
  } catch (err) {
    console.error("❌ ADMIN ROUTE ERROR:", err);
  }
}

//===================================//
//       END of GPS CODES           //
//=================================//

function snapToRoute(lat, lng, routeCoords) {
  if (!routeCoords || routeCoords.length === 0) return { lat, lng };

  let nearestPoint = null;
  let nearestDist = Infinity;

  for (let i = 0; i < routeCoords.length; i++) {
    const [rLat, rLng] = routeCoords[i];

    const dist = haversine(lat, lng, rLat, rLng);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPoint = { lat: rLat, lng: rLng };
    }
  }

  return nearestPoint || { lat, lng };
}

/* ============================
   Haversine Distance (meters)
=============================*/
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function updateShipmentMarker(shipmentId, newLat, newLng) {
  shipmentId = String(shipmentId);

  const shipment = state.shipments.find((s) => String(s.id) === shipmentId);
  if (!shipment) return;

  if (String(shipment.status).toLowerCase() === "delivered") return;
  if (!modalMap || !isFinite(newLat) || !isFinite(newLng)) return;

  const markerExists = !!mapMarkers[shipmentId];

  // Create marker if missing
  if (!markerExists) {
    const truckIcon = L.divIcon({
      html: '<i class="fas fa-truck-moving" style="font-size:28px;color:#0077b6;"></i>',
      className: "truck-marker",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    mapMarkers[shipmentId] = L.marker([newLat, newLng], {
      icon: truckIcon,
    }).addTo(modalMap);

    adminLastRouteStart[shipmentId] = { lat: newLat, lng: newLng };
  }

  const marker = mapMarkers[shipmentId];
  marker.setLatLng([newLat, newLng]);

  /* ----------------------------------------------
     DESTINATION PRIORITY:
     1) specific_lat/lon
     2) delivery_lat/lon
     3) fallback geocode(port_delivery)
  ---------------------------------------------- */
  let destLat = null;
  let destLng = null;

  if (isFinite(shipment.specific_lat) && isFinite(shipment.specific_lon)) {
    destLat = Number(shipment.specific_lat);
    destLng = Number(shipment.specific_lon);
  } else if (
    isFinite(shipment.delivery_lat) &&
    isFinite(shipment.delivery_lon)
  ) {
    destLat = Number(shipment.delivery_lat);
    destLng = Number(shipment.delivery_lon);
  } else {
    // Fallback geocoding
    const address = shipment.port_delivery;
    if (address && address.trim()) {
      console.warn("⏳ Destination missing — geocoding:", address);

      const geo = await validateGeoapifyLocation(address);
      if (geo) {
        destLat = geo.lat;
        destLng = geo.lon;

        // Save result into shipment for future use
        shipment.delivery_lat = geo.lat;
        shipment.delivery_lon = geo.lon;

        console.log("✅ Geocoded destination:", geo.display_name);
      }
    }
  }

  // Still invalid → stop
  if (!isFinite(destLat) || !isFinite(destLng)) {
    if (adminLiveLine && modalMap) {
      modalMap.removeLayer(adminLiveLine);
      adminLiveLine = null;
    }
    console.warn(
      "❌ No valid destination coordinates for shipment:",
      shipmentId
    );
    return;
  }

  // Redraw straight line driver → destination
  if (adminLiveLine && modalMap) {
    modalMap.removeLayer(adminLiveLine);
  }

  adminLiveLine = L.polyline(
    [
      [newLat, newLng],
      [destLat, destLng],
    ],
    {
      color: "#ff8800",
      weight: 4,
    }
  ).addTo(modalMap);
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
  warning: {
    accent: "#ffc107",
    icon: "fas fa-exclamation-triangle",
    title: "Warning",
  },
  error: { accent: "#e63946", icon: "fas fa-times-circle", title: "Error" },
  info: { accent: "#0d6efd", icon: "fas fa-info-circle", title: "Info" },
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

  const modal = new bootstrap.Modal(
    document.getElementById("notificationModal")
  );
  modal.show();
  setTimeout(() => modal.hide(), 1800);
}

/* ==============================
   Show Shipment Details (map + progress)
   ============================== */
async function showShipmentDetails(shipment) {
  state.activeShipmentId = String(shipment.id);
  const idStr = state.activeShipmentId;

  console.log("🔍 showShipmentDetails for shipment:", shipment.id);

  const card = document.getElementById("shipmentDetailsCard");
  if (!card) {
    console.error("shipmentDetailsCard not found in DOM");
    return;
  }

  /** ==========================================
   *  CLEAN OLD MAP
   * ========================================== */
  if (modalMap) {
    try {
      modalMap.remove();
    } catch (_) {}
    modalMap = null;
  }

  /** ==========================================
   *  RENDER UI
   * ========================================== */
  if (typeof renderOrderTrackerHTML === "function") {
    card.innerHTML =
      renderOrderTrackerHTML(shipment) + renderDriverInfoHTML(shipment);
  }

  // Progress bar
  const statusKey = normalizeShipmentStatus(shipment.status);
  const steps = ["processed", "shipped", "en_route", "delivered"];
  const idx = Math.max(0, steps.indexOf(statusKey));
  if (typeof setOrderStep === "function") setOrderStep(idx);

  /** ==========================================
   *  OPEN MODAL
   * ========================================== */
  const modal = new bootstrap.Modal(
    document.getElementById("shipmentDetailsModal")
  );
  modal.show();

  setTimeout(async () => {
    /** ==========================================
     *  DRIVER LAST POSITION
     * ========================================== */
    const hasDriver =
      shipment.driver_id &&
      shipment.driver_first_name &&
      shipment.driver_last_name;

    let latestLive = lastPositions[idStr];
    let coord = null;

    if (hasDriver) {
      if (latestLive && isFinite(latestLive.lat) && isFinite(latestLive.lng)) {
        coord = { lat: latestLive.lat, lng: latestLive.lng, source: "live" };
      } else if (
        isFinite(Number(shipment.driver_lat)) &&
        isFinite(Number(shipment.driver_lng))
      ) {
        coord = {
          lat: Number(shipment.driver_lat),
          lng: Number(shipment.driver_lng),
          source: "driver_last_gps",
        };
      }
    }

    console.log("🗺 Initial coord for modal map:", { shipmentId: idStr, coord });

    const centerLat = coord ? coord.lat : CONFIG.defaultCenter[0];
    const centerLon = coord ? coord.lng : CONFIG.defaultCenter[1];

    /** ==========================================
     *  CREATE MAP
     * ========================================== */
    modalMap = L.map(elements.mapId).setView(
      [centerLat, centerLon],
      CONFIG.defaultZoom
    );

    L.tileLayer(CONFIG.mapTileUrl, {
      attribution: CONFIG.mapAttribution,
    }).addTo(modalMap);

    modalMap.on("dragstart", () => (autoFollow = false));
    modalMap.on("zoomstart", () => (autoFollow = false));

    /** ==========================================
     *  DESTINATION MARKER & LINE
     * ========================================== */
    await drawAdminRoute(idStr, coord.lat, coord.lng); // Redraw route with destination

    /** ==========================================
     *  APPLY LAST GPS / BUFFERED UPDATES
     * ========================================== */
    if (hasDriver && latestLive) {
      updateShipmentMarker(idStr, latestLive.lat, latestLive.lng);
    }

    const buffered = pendingGPSUpdates.filter(
      (u) => String(u.shipmentid) === idStr
    );
    for (const b of buffered) {
      updateShipmentMarker(idStr, b.latitude, b.longitude);
    }

    pendingGPSUpdates = pendingGPSUpdates.filter(
      (u) => String(u.shipmentid) !== idStr
    );

    /** ==========================================
     *  TRACK ONLY THIS SHIPMENT
     * ========================================== */
    startGpsTracking(shipment.id, modalMap);
  }, 250);
}

/* Map Resize When Modal Opens */
document
  .getElementById("shipmentDetailsModal")
  ?.addEventListener("shown.bs.modal", () => {
    if (modalMap) setTimeout(() => modalMap.invalidateSize(), 200);
  });

/* Cleanup on Close */
document
  .getElementById("shipmentDetailsModal")
  ?.addEventListener("hidden.bs.modal", () => {
    if (modalMap) {
      try {
        modalMap.eachLayer((layer) => {
          if (layer instanceof L.Marker || layer instanceof L.Polyline)
            modalMap.removeLayer(layer);
        });
        modalMap.remove();
      } catch (_) {}
    }
    modalMap = null;
  });

/* ==============================
   Keep map responsive
============================== */
document
  .getElementById("shipmentDetailsModal")
  ?.addEventListener("shown.bs.modal", () => {
    if (modalMap) setTimeout(() => modalMap.invalidateSize(), 200);
  });

/* ==============================
   Cleanup map when modal closes
============================== */
document
  .getElementById("shipmentDetailsModal")
  ?.addEventListener("hidden.bs.modal", () => {
    if (modalMap && typeof modalMap.remove === "function") {
      try {
        modalMap.eachLayer((layer) => {
          if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            modalMap.removeLayer(layer);
          }
        });
        modalMap.remove();
      } catch (err) {
        console.warn("Map cleanup skipped:", err);
      }
    }
    modalMap = null;
  });

/* ==============================
   View Button + Status Buttons (Delegated)
   ============================== */
document.addEventListener("click", (e) => {
  // View button
  if (e.target.closest(".btn-view")) {
    const btn = e.target.closest(".btn-view");
    const shipmentId = btn.dataset.id;
    const shipment = state.shipments.find((s) => String(s.id) === shipmentId);
    if (shipment) showShipmentDetails(shipment);
    return;
  }

  // Status buttons
  if (e.target.closest(".shipment-action-btn")) {
    const btn = e.target.closest(".shipment-action-btn");
    const shipmentId = btn.dataset.id;
    const newStatus = btn.dataset.status;
    checkStatusSequenceBeforeUpdate(shipmentId, newStatus);
    return;
  }
});

/* ==============================
   Update shipment status (admin)
   ============================== */
async function updateShipmentStatus(shipmentId, newStatus) {
  try {
    console.log("Updating status...", shipmentId, newStatus);

    const res = await fetch(`${CONFIG.apiUrl}/${shipmentId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
      credentials: "include",
    });

    const data = await res.json();
    console.log("Backend response:", data);

    if (!res.ok) throw new Error(data.error || "Update failed");

    showNotification({
      variant: "success",
      title: "Status Updated",
      message: `Shipment #${shipmentId} is now "${newStatus}".`,
    });

    await fetchShipments(); // refresh
  } catch (err) {
    console.error("Status update error:", err);
    showNotification({
      variant: "error",
      title: "Update Failed",
      message: err.message,
    });
  }
}

/* ==============================
   Status sequence validation (no more GPS requirement)
   ============================== */
function isValidStatusTransition(currentStatus, newStatus) {
  const order = ["approved", "shipping", "in transit", "delivered"];

  const normalize = (s) => (s || "").toLowerCase().trim();

  const cur = normalize(currentStatus);
  const next = normalize(newStatus);

  const i = order.indexOf(cur);
  const j = order.indexOf(next);

  if (i === -1 || j === -1) return false;
  return j === i + 1; // must be exactly the next step
}

async function checkStatusSequenceBeforeUpdate(shipmentId, newStatus) {
  const shipment = state.shipments.find(
    (s) => String(s.id) === String(shipmentId)
  );
  if (!shipment) {
    showNotification({
      variant: "error",
      title: "Error",
      message: "Shipment not found.",
    });
    return;
  }

  const currentStatus = (shipment.status || "").toLowerCase().trim();
  const requestedStatus = (newStatus || "").toLowerCase().trim();

  if (!isValidStatusTransition(currentStatus, requestedStatus)) {
    showNotification({
      variant: "warning",
      title: "Invalid Status Transition",
      message: `Cannot change to "${newStatus}" from "${shipment.status}".`,
    });
    return;
  }

  updateShipmentStatus(shipmentId, newStatus);
}

/* ==============================
   Start GPS tracking (keep only active marker)
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
   Fetch shipments + pagination
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
  if (
    s.includes("cancelled") ||
    s.includes("declined") ||
    s.includes("returned")
  )
    return "badge-cancelled";
  return "badge-pending";
}

function renderPaginatedShipments(page = 1) {
  const allowedStatuses = ["approved", "shipping", "in transit", "delivered"];

  const visible = state.shipments
    .filter((s) =>
      allowedStatuses.includes((s.status || "").toLowerCase().trim())
    )
    .filter((s) => {
      const status = (s.status || "").toLowerCase().trim();
      if (currentStatusFilter === "all") return true;
      return status === currentStatusFilter;
    });

  // Search filter (does NOT affect dropdown filter)
  const searchFiltered = visible.filter((s) => {
    if (!currentSearch) return true;

    const text = `
      ${s.tracking_number ?? s.id}
      ${s.company_name ?? ""}
      ${s.origin ?? ""}
      ${s.destination ?? ""}
      ${s.status ?? ""}
    `.toLowerCase();

    return text.includes(currentSearch);
  });

  totalPages = Math.ceil(searchFiltered.length / rowsPerPage) || 1;
  currentPage = Math.max(1, Math.min(page, totalPages));

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const paginated = searchFiltered.slice(start, end);

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
      <td>${
        s.expected_delivery_date
          ? new Date(s.expected_delivery_date).toLocaleDateString()
          : "-"
      }</td>

      <td>
        <span class="badge ${getBadgeClass(s.status)}">
          ${s.status || "Unknown"}
        </span>
      </td>

      <td>
        <button class="btn btn-sm btn-primary btn-view" data-id="${
          s.id
        }">View</button>
      </td>

      <td>
        <div class="d-flex gap-2 justify-content-center">
          ${
            !s.driver_id && (s.status || "").toLowerCase() !== "delivered"
              ? `
              <button 
              class="btn btn-sm btn-assign-driver assign-driver-btn"
              data-id="${s.id}"
              data-bs-toggle="modal"
              data-bs-target="#assignDriverModal">
              Assign Driver
              </button>
            `
              : (s.status || "").toLowerCase() === "approved"
              ? `
              <button 
                class="shipment-action-btn btn-shipping"
                data-id="${s.id}"
                data-status="Shipping"
              >
                Shipping
              </button>
            `
              : (s.status || "").toLowerCase() === "shipping"
              ? `
              <button 
                class="shipment-action-btn btn-intransit"
                data-id="${s.id}"
                data-status="In Transit"
              >
                In Transit
              </button>
            `
              : (s.status || "").toLowerCase() === "in transit"
              ? `
              <button 
                class="shipment-action-btn btn-delivered"
                data-id="${s.id}"
                data-status="Delivered"
              >
                Delivered
              </button>
            `
              : ""
          }
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

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
  prevItem.innerHTML = `<button class="page-link custom-page" ${
    currentPage === 1 ? "disabled" : ""
  }><i class="fas fa-chevron-left"></i></button>`;
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
  nextItem.className = `page-item ${
    currentPage === totalPages ? "disabled" : ""
  }`;
  nextItem.innerHTML = `<button class="page-link custom-page" ${
    currentPage === totalPages ? "disabled" : ""
  }><i class="fas fa-chevron-right"></i></button>`;
  nextItem.onclick = () => {
    if (currentPage < totalPages) renderPaginatedShipments(currentPage + 1);
  };
  pagination.appendChild(nextItem);

  container.appendChild(pagination);
}

/* ==============================
   Order tracker helpers
   ============================== */
function normalizeShipmentStatus(s) {
  s = (s || "").toLowerCase();
  if (
    [
      "pending",
      "approved",
      "processing",
      "processed",
      "booked",
      "awaiting pickup",
    ].includes(s)
  )
    return "processed";
  if (["shipping", "shipped", "dispatch"].includes(s)) return "shipped";
  if (["in transit", "transit", "en route", "out for delivery"].includes(s))
    return "en_route";
  if (["delivered", "completed", "arrival", "arrived"].includes(s))
    return "delivered";
  return "processed";
}

function renderOrderTrackerHTML(shipment) {
  const statusKey = normalizeShipmentStatus(shipment?.status);
  const steps = ["processed", "shipped", "en_route", "delivered"];
  const idx = Math.max(0, steps.indexOf(statusKey));
  const pct = (idx / (steps.length - 1)) * 100;
  const cls = (n) =>
    n < idx ? "is-done" : n === idx ? "is-current" : "is-future";

  const orderId = shipment?.tracking_number || shipment?.id || "—";
  const origin = shipment?.origin || shipment?.port_origin || "—";
  const destination =
    shipment?.destination || shipment?.port_destination || "—";
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
      <div class="ot-step ${cls(
        0
      )}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Booking Processed</div></div>
      <div class="ot-step ${cls(
        1
      )}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Order Shipped</div></div>
      <div class="ot-step ${cls(
        2
      )}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">In Transit</div></div>
      <div class="ot-step ${cls(
        3
      )}"><div class="ot-dot"><i class="bi bi-check-lg"></i></div><div class="ot-label">Delivered</div></div>
    </div>
  </div>
</section>`;
}

function renderDriverInfoHTML(shipment) {
  const fullName =
    `${shipment.driver_first_name || ""} ${
      shipment.driver_last_name || ""
    }`.trim() || "Not assigned";

  const phone = shipment.driver_phone || "Not provided";
  const hasDriver = !!shipment.driver_id;
  const statusLabel = hasDriver ? "Driver Assigned" : "No driver assigned";

  return `
  <div class="card border-0 shadow-sm mb-3">
    <div class="card-body py-3 d-flex align-items-center">
      <div class="me-3 d-flex align-items-center justify-content-center rounded-circle border"
           style="width:42px;height:42px;">
        <i class="fas fa-user text-secondary"></i>
      </div>
      <div class="flex-grow-1">
        <div class="small text-muted text-uppercase">Driver Information</div>
        <div class="fw-semibold">${fullName}</div>
        <div class="small text-muted">Phone: ${phone}</div>
      </div>
      <span class="badge bg-light text-dark border small">${statusLabel}</span>
    </div>
  </div>`;
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
   Filter dropdown
   ============================== */
function setupFilterDropdown(filterBtn) {
  // Inject CSS once
  if (!document.getElementById("filterDropdownStyle")) {
    const style = document.createElement("style");
    style.id = "filterDropdownStyle";
    style.textContent = `
      .filter-option {
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .filter-option:hover {
        color: var(--bs-primary) !important;
        background-color: rgba(0,123,255,0.1) !important;
      }
    `;
    document.head.appendChild(style);
  }

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.background = "#fff";
  dropdown.style.border = "1px solid #ccc";
  dropdown.style.borderRadius = "6px";
  dropdown.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  dropdown.style.padding = "4px 0";
  dropdown.style.display = "none";
  dropdown.style.zIndex = "9999";
  dropdown.style.width = "150px";

  dropdown.innerHTML = `
    <div class="filter-option" data-value="all" style="padding:8px 12px; cursor:pointer;">All</div>
    <div class="filter-option" data-value="approved" style="padding:8px 12px; cursor:pointer;">Approved</div>
    <div class="filter-option" data-value="shipping" style="padding:8px 12px; cursor:pointer;">Shipping</div>
    <div class="filter-option" data-value="in transit" style="padding:8px 12px; cursor:pointer;">In Transit</div>
    <div class="filter-option" data-value="delivered" style="padding:8px 12px; cursor:pointer;">Delivered</div>
  `;

  document.body.appendChild(dropdown);

  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.left = rect.left + "px";
    dropdown.style.top = rect.bottom + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== filterBtn) {
      dropdown.style.display = "none";
    }
  });

  dropdown.querySelectorAll(".filter-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      currentStatusFilter = opt.dataset.value;
      dropdown.style.display = "none";
      renderPaginatedShipments(1);
    });
  });
}

/* ==============================
   Success & Warning Modals
   ============================== */
function ensureSuccessModal() {
  if (document.getElementById("successModal")) return;

  const modalHTML = `
    <div class="modal fade" id="successModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content success-modal border-0 shadow-lg">
          <div class="modal-header success-modal-header text-white">
            <h5 class="modal-title fw-bold" id="successModalTitle">Success</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center py-4 success-modal-body">
            <div class="success-modal-icon">
              <i class="fas fa-check"></i>
            </div>
            <p class="mb-0" id="successModalMessage">Action completed successfully!</p>
          </div>
          <div class="modal-footer justify-content-center border-0">
            <button type="button" class="btn btn-success rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">
              <i class="fas fa-check me-2"></i>OK
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showSuccessModal(title, message) {
  ensureSuccessModal();
  document.getElementById("successModalTitle").innerText = title;
  document.getElementById("successModalMessage").innerText = message;

  const modalEl = document.getElementById("successModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      location.reload();
    },
    { once: true }
  );
}

function ensureWarningModal() {
  if (document.getElementById("warningModal")) return;

  const modalHTML = `
    <div class="modal fade" id="warningModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content warning-modal border-0 shadow-lg">
          <div class="modal-header warning-modal-header text-white">
            <h5 class="modal-title fw-bold" id="warningModalTitle">Warning</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center py-4">
            <div class="warning-modal-icon mb-3">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <p class="mb-0" id="warningModalMessage">This is a warning message.</p>
          </div>
          <div class="modal-footer justify-content-center border-0">
            <button type="button" class="btn btn-warning rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">
              <i class="fas fa-check me-2"></i>OK
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showWarningModal(title, message) {
  ensureWarningModal();
  document.getElementById("warningModalTitle").innerText = title;
  document.getElementById("warningModalMessage").innerText = message;

  const modal = new bootstrap.Modal(document.getElementById("warningModal"));
  modal.show();
}

/* ==============================
   Driver assignment
   ============================== */
async function loadActiveDrivers(shipmentId) {
  const container = document.getElementById("driverList");
  if (!container) return;

  container.innerHTML = `<div class="text-center text-muted py-2">Loading...</div>`;

  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/admin/drivers/active",
      { credentials: "include" }
    );

    if (!res.ok) throw new Error("Failed to load drivers");

    const drivers = await res.json();

    if (!drivers.length) {
      container.innerHTML = `<div class="text-center text-danger py-2">
        No active drivers available
      </div>`;
      return;
    }

    container.innerHTML = "";

    drivers.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "driver-btn w-100";

      btn.textContent = `${d.first_name} ${d.last_name} (${
        d.phone || "No phone"
      })`;

      // IMPORTANT: BACKEND RETURNS d.driver_id NOT d.id
      btn.dataset.driverId = d.driver_id || d.id;

      btn.onclick = () => {
        const driverId = btn.dataset.driverId;
        assignDriverToShipment(shipmentId, driverId);
      };

      container.appendChild(btn);
    });
  } catch (err) {
    container.innerHTML = `<div class="text-center text-danger py-2">Failed to load drivers</div>`;
  }
}

async function assignDriverToShipment(shipmentId, driverId) {
  try {
    const res = await fetch(
      `https://cargosmarttsl-1.onrender.com/api/admin/shipments/${shipmentId}/assign-driver`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ driver_id: driverId }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to assign driver.");

    showSuccessModal(
      "Driver Assigned",
      `Driver successfully assigned to shipment #${shipmentId}`
    );

    fetchShipments();

    const modalInstance = bootstrap.Modal.getInstance(
      document.getElementById("assignDriverModal")
    );
    if (modalInstance) modalInstance.hide();
  } catch (err) {
    showWarningModal("Assignment Failed", err.message);
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".assign-driver-btn");
  if (!btn) return;

  const shipmentId = btn.dataset.id;
  loadActiveDrivers(shipmentId);
});

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

  // dropdown filter
  const filterBtn = document.querySelector(
    "button.btn-outline-secondary.btn-sm"
  );
  if (filterBtn) setupFilterDropdown(filterBtn);

  // search
  const searchInput = document.getElementById("clientSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      renderPaginatedShipments(1);
    });
  }
});
