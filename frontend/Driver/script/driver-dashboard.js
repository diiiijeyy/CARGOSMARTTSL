/*********************************************
 *  DRIVER DASHBOARD — FINAL CLEAN VERSION
 *  ✔ ORS Road Snapping
 *  ✔ Smooth Auto-Follow (no animation mode)
 *  ✔ Accurate Bearing Rotation
 *  ✔ Route Redraw Every 50m
 *  ✔ ETA Updated by Live GPS
 *********************************************/

const API_BASE_URL = 
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:5001"
    : "https://cargosmarttsl-1.onrender.com";


/* ================================
   GLOBAL STATE
================================ */
let driverLiveLine = null; // straight line from driver to destination
let driverWatchId = null;
let driverId = null;

let driverMap = null;
let driverMarker = null;

let routeLayer = null;
let routeCoordinates = []; // ORS route (lat,lng)

let liveETAElement = null;

let currentAssignedShipmentId = null;
let currentDeliveryDest = null;

// Auto-follow on GPS moves
let autoCenterEnabled = true;

// GPS smoothing
let lastDriverPos = null;
let lastGPS = null;
let lastGPSTime = null;

// WS
let driverWS = null;
let wsConnected = false;
let wsUrl =
  API_BASE_URL.replace("http://", "ws://").replace("https://", "wss://") +
  "/driver";

// Throttle GPS sending
const GPS_SEND_THROTTLE_MS = 2500;
let lastSentAt = 0;

// Route redraw threshold
let lastRouteStart = {}; // per shipment
const ROUTE_REDRAW_MIN_DISTANCE = 50;

/* =======================================
   START DRIVER GPS BROADCAST
======================================= */
function startDriverLocationBroadcast() {
  if (!navigator.geolocation) {
    showToast("Device does not support GPS.", "warning");
    return;
  }

  // Open WS
  if (!driverWS || driverWS.readyState === WebSocket.CLOSED) {
    driverWS = new WebSocket(wsUrl);

    driverWS.onopen = () => {
      console.log("Driver WS connected");
      wsConnected = true;
    };

    driverWS.onclose = () => {
      wsConnected = false;
      setTimeout(() => {
        if (!wsConnected) startDriverLocationBroadcast();
      }, 2000);
    };

    driverWS.onerror = (err) => console.error("Driver WS error", err);
  }

  // Clear old watch
  if (driverWatchId !== null) navigator.geolocation.clearWatch(driverWatchId);

  driverWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();

      if (lat === 0 && lng === 0) return;

      updateDriverMap(lat, lng);

      if (now - lastSentAt > GPS_SEND_THROTTLE_MS) {
        lastSentAt = now;

        const payload = {
          type: "driver_gps",
          driverId,
          shipmentId: currentAssignedShipmentId,
          lat,
          lng,
          timestamp: now,
        };

        if (driverWS && wsConnected) {
          try {
            driverWS.send(JSON.stringify(payload));
          } catch (_) {}
        }

        sendLocationHttp(lat, lng);
      }

      updateETA(lat, lng, now);
    },
    (err) => console.warn("GPS error:", err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 }
  );

  showToast("GPS broadcasting started", "success");
}

function stopDriverLocationBroadcast() {
  if (driverWatchId !== null) {
    navigator.geolocation.clearWatch(driverWatchId);
    driverWatchId = null;
  }
  if (driverWS) {
    try {
      driverWS.close();
    } catch (_) {}
    driverWS = null;
    wsConnected = false;
  }
  showToast("GPS broadcasting stopped", "info");
}

/* =======================================
   HTTP BACKUP
======================================= */
function sendLocationHttp(lat, lng) {
  fetch(`${API_BASE_URL}/api/driver/location`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  }).catch((err) => console.error("HTTP GPS failed:", err));
}

/* =======================================
   MAP SETUP
======================================= */
function initDriverMap() {
  driverMap = L.map("driverMap").setView([12.8797, 121.774], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(driverMap);

  driverMap.on("dragstart", () => (autoCenterEnabled = false));

  // ETA widget
  liveETAElement = L.control({ position: "topright" });
  liveETAElement.onAdd = () => {
    const div = L.DomUtil.create("div", "eta-box");
    div.style.cssText =
      "padding:8px 12px;background:white;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-weight:bold;";
    div.innerHTML = "ETA: Calculating…";
    return div;
  };
  liveETAElement.addTo(driverMap);
}

/* =======================================
   DRIVER GPS UPDATE
======================================= */
function updateDriverMap(lat, lng) {
  if (!driverMap) return;

  // Ignore tiny jitter <3 meters
  if (lastDriverPos) {
    if (haversine(lastDriverPos.lat, lastDriverPos.lng, lat, lng) < 3) return;
  }

  /* =====================================================
     CREATE OR UPDATE DRIVER MARKER  (NO SNAP-TO-ROUTE)
     ===================================================== */
  if (!driverMarker) {
    driverMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<i class="fa-solid fa-truck-moving" style="font-size:24px;color:#0077b6;"></i>`,
        className: "driver-truck",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(driverMap);
  } else {
    driverMarker.setLatLng([lat, lng]);
  }

  /* =====================================================
     ROTATE TRUCK ICON USING MOVEMENT BEARING
     ===================================================== */
  if (lastDriverPos) {
    const moved = haversine(lastDriverPos.lat, lastDriverPos.lng, lat, lng);

    if (moved > 2) {
      const bearing = computeBearing(
        lastDriverPos.lat,
        lastDriverPos.lng,
        lat,
        lng
      );

      const iconEl = driverMarker._icon?.querySelector("i");
      if (iconEl) {
        iconEl.style.transform = `rotate(${bearing - 90}deg)`;
      }
    }
  }

  /* =====================================================
     AUTO-FOLLOW CAMERA (smooth pan / fly)
     ===================================================== */
  if (autoCenterEnabled) {
    if (!lastDriverPos) {
      driverMap.setView([lat, lng], 16); // initial center
    } else {
      const jump = haversine(lastDriverPos.lat, lastDriverPos.lng, lat, lng);

      if (jump > 50) {
        driverMap.flyTo([lat, lng], 16, {
          animate: true,
          duration: 0.7,
        });
      } else {
        driverMap.panTo([lat, lng], {
          animate: true,
          duration: 0.4,
          easeLinearity: 0.3,
        });
      }
    }
  }

  /* Save last driver position */
  lastDriverPos = { lat, lng };

  /* =====================================================
     DRAW LIVE STRAIGHT LINE → DELIVERY DESTINATION
     ===================================================== */
  if (
    currentDeliveryDest &&
    isFinite(currentDeliveryDest.lat) &&
    isFinite(currentDeliveryDest.lng)
  ) {
    // Remove old line
    if (driverLiveLine) {
      driverMap.removeLayer(driverLiveLine);
      driverLiveLine = null;
    }

    // Draw updated line
    driverLiveLine = L.polyline(
      [
        [lat, lng],
        [currentDeliveryDest.lat, currentDeliveryDest.lng],
      ],
      {
        color: "#ff6600",
        weight: 4,
        opacity: 0.9,
        dashArray: "6,4",
      }
    ).addTo(driverMap);
  }
}

/* =======================================
   ROUTE DRAWING (ORS)
======================================= */
async function drawRoute(startLat, startLng, destLat, destLng) {
  if (!driverMap) return;

  function fallback() {
    routeCoordinates = [
      [startLat, startLng],
      [destLat, destLng],
    ];
    if (routeLayer) driverMap.removeLayer(routeLayer);
    routeLayer = L.polyline(routeCoordinates, {
      color: "#0077b6",
      weight: 5,
      opacity: 0.9,
    }).addTo(driverMap);
    driverMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
  }

  try {
    const url = `${API_BASE_URL}/api/map/route?originLat=${startLat}&originLng=${startLng}&destLat=${destLat}&destLng=${destLng}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return fallback();

    const json = await res.json();
    const coords = json?.features?.[0]?.geometry?.coordinates;
    if (!coords) return fallback();

    // Convert ORS [lng,lat] → [lat,lng]
    routeCoordinates = coords.map((c) => [c[1], c[0]]);

    if (routeLayer) driverMap.removeLayer(routeLayer);
    routeLayer = L.polyline(routeCoordinates, {
      color: "#0077b6",
      weight: 5,
      opacity: 0.9,
    }).addTo(driverMap);

    driverMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
  } catch (err) {
    console.error("Route error:", err);
    fallback();
  }
}

/* =======================================
   SNAP TO ROUTE
======================================= */
function snapToRoute(lat, lng, routeCoords) {
  if (!routeCoords || !routeCoords.length) return { lat, lng };

  let nearest = null;
  let nearestDist = Infinity;

  for (let i = 0; i < routeCoords.length; i++) {
    const [rLat, rLng] = routeCoords[i];
    const d = haversine(lat, lng, rLat, rLng);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = { lat: rLat, lng: rLng };
    }
  }
  return nearest || { lat, lng };
}

/* =======================================
   BEARING + HAVERSINE
======================================= */
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

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* =======================================
   ETA CALCULATION
======================================= */
function getRemainingDistance(lat, lng) {
  if (!routeCoordinates.length) return 0;

  let dist = 0;
  let found = false;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [rLat, rLng] = routeCoordinates[i];

    if (!found) {
      if (haversine(lat, lng, rLat, rLng) < 30) found = true;
      continue;
    }

    const [nLat, nLng] = routeCoordinates[i + 1];
    dist += haversine(rLat, rLng, nLat, nLng);
  }

  return dist;
}

function updateETA(lat, lng, timestamp) {
  if (!routeCoordinates.length) return;

  if (lastGPS && lastGPSTime) {
    const dt = (timestamp - lastGPSTime) / 1000; // seconds
    const dx = haversine(lastGPS.lat, lastGPS.lng, lat, lng);

    const speed = dx / dt; // m/s
    if (!isFinite(speed) || speed <= 0) return;

    const rem = getRemainingDistance(lat, lng);
    const etaSec = rem / speed;

    if (etaSec > 0) {
      const minutes = Math.round(etaSec / 60);
      liveETAElement.getContainer().innerHTML = `ETA: ${minutes} min`;
    }
  }

  lastGPS = { lat, lng };
  lastGPSTime = timestamp;
}

/* =======================================
   LOAD DRIVER INFO
======================================= */
async function loadDriverInfo() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/driver/profile`, {
      credentials: "include",
    });

    const data = await res.json();
    driverId = data.id;

    document.getElementById("driverName").textContent = data.full_name;
    document.getElementById("driverEmail").textContent = data.email;
    document.getElementById("driverPhone").textContent = data.phone;
  } catch (err) {
    console.error("Driver profile failed:", err);
  }
}

/* =======================================  
   LOAD ACTIVE SHIPMENTS  
======================================= */
async function loadShipments() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/driver/shipments/active`, {
      credentials: "include",
    });

    const shipments = await res.json();
    const container = document.getElementById("shipmentList");
    container.innerHTML = "";

    currentDeliveryDest = null;
    routeCoordinates = [];

    if (routeLayer) {
      driverMap.removeLayer(routeLayer);
      routeLayer = null;
    }

    if (!shipments.length) {
      container.innerHTML = `
      <div class="text-center mt-4">
        <i class="fa-solid fa-box-open text-muted mb-2" style="font-size:40px;"></i>
        <p class="text-muted">No active shipments assigned.</p>
      </div>`;
      liveETAElement.getContainer().innerHTML = "ETA: —";
      return;
    }

    currentAssignedShipmentId = shipments[0].id;

    const s = shipments[0];
    const dLat = parseFloat(s.delivery_lat);
    const dLng = parseFloat(s.delivery_lon);

    if (!isNaN(dLat) && !isNaN(dLng)) {
      currentDeliveryDest = { lat: dLat, lng: dLng };

      if (driverMarker) {
        const p = driverMarker.getLatLng();
        drawRoute(p.lat, p.lng, dLat, dLng);
      }
    }

    shipments.forEach((ship) => {
      const card = document.createElement("div");
      card.className = "card mb-3 shadow-sm border-0";

      const status = ship.status.toLowerCase();
      let btn = "";

      if (status === "approved" || status === "shipping") {
        btn = `
          <button class="btn btn-primary w-100 mt-3"
            onclick="driverAction(${ship.id}, 'In Transit')">
            Start Delivery
          </button>`;
      } else if (status === "in transit") {
        btn = `
          <button class="btn btn-success w-100 mt-3"
            onclick="driverAction(${ship.id}, 'Delivered')">
            Mark Delivered
          </button>`;
      }

      card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h6 class="card-title fw-semibold text-primary">#${ship.tracking_number}</h6>
            <span class="badge bg-info">${ship.status}</span>
          </div>
          <p class="mb-1"><strong>Route:</strong> ${ship.port_origin} → ${ship.port_delivery}</p>
          ${btn}
        </div>`;

      container.appendChild(card);
    });
  } catch (err) {
    console.error("Shipments failed:", err);
  }
}

/* =======================================
   DRIVER ACTION BUTTONS
======================================= */
async function driverAction(shipmentId, newStatus) {
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML =
    `<span class="spinner-border spinner-border-sm me-2"></span>Updating...`;

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/driver/shipments/${shipmentId}/status`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Failed to update status", "error");
      btn.disabled = false;
      btn.innerHTML = "Retry";
      return;
    }

    showToast(`Status updated to ${newStatus}`, "success");

    if (newStatus === "Delivered") stopDriverLocationBroadcast();

    loadShipments();
  } catch (err) {
    console.error(err);
    showToast("Status update failed.", "error");
    btn.disabled = false;
  }
}

/* =======================================
   UI HELPERS
======================================= */
function showToast(message, type = "info") {
  const toastEl = document.getElementById("driverToast");
  const toastMsg = document.getElementById("driverToastMessage");

  toastMsg.textContent = message;
  toastEl.className = "toast text-white";

  const classMap = {
    success: "toast-success",
    error: "toast-error",
    warning: "toast-warning",
    info: "toast-info",
  };

  toastEl.classList.add(classMap[type]);
  new bootstrap.Toast(toastEl, { delay: 2500 }).show();
}

function showTab(tab) {
  document
    .getElementById("shipmentList")
    .classList.toggle("d-none", tab !== "active");
  document
    .getElementById("completedList")
    .classList.toggle("d-none", tab !== "completed");

  if (tab === "active") loadShipments();
  else loadCompletedShipments();
}

/* =======================================
   COMPLETED SHIPMENTS
======================================= */
async function loadCompletedShipments() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/driver/shipments/completed`, {
      credentials: "include",
    });

    const shipments = await res.json();
    const container = document.getElementById("completedList");
    container.innerHTML = "";

    if (!shipments.length) {
      container.innerHTML = `
      <div class="text-center mt-4">
        <i class="fa-solid fa-circle-check text-success mb-2" style="font-size:40px;"></i>
        <p class="text-muted">No completed shipments yet.</p>
      </div>`;
      return;
    }

    shipments.forEach((s) => {
      const card = document.createElement("div");
      card.className = "card mb-3 shadow-sm border-0";

      card.innerHTML = `
        <div class="card-body">
          <h6 class="fw-bold text-success">#${s.tracking_number}</h6>
          <p><strong>Route:</strong> ${s.port_origin} → ${
        s.port_delivery
      }</p>
          <p class="small text-muted">Delivered at ${new Date(
            s.delivered_at
          ).toLocaleString()}</p>
        </div>`;

      container.appendChild(card);
    });
  } catch (err) {
    console.error("Completed shipments failed:", err);
  }
}

/* =======================================
   INIT
======================================= */
document.addEventListener("DOMContentLoaded", () => {
  initDriverMap();
  loadDriverInfo();
  loadShipments();
  requestGPSPermission();

  const recenter = document.getElementById("recenterBtn");
  if (recenter) {
    recenter.addEventListener("click", () => {
      autoCenterEnabled = true;
      if (driverMarker) {
        driverMap.setView(driverMarker.getLatLng(), 16, { animate: true });
      }
    });
  }

  setInterval(loadShipments, 30000);
});

/* =======================================
   GPS PERMISSION
======================================= */
async function requestGPSPermission() {
  if (!navigator.permissions || !navigator.geolocation) {
    showToast("Your device does not support GPS.", "error");
    return;
  }

  try {
    const status = await navigator.permissions.query({
      name: "geolocation",
    });

    if (status.state === "granted") {
      startDriverLocationBroadcast();
    } else if (status.state === "prompt") {
      navigator.geolocation.getCurrentPosition(
        () => startDriverLocationBroadcast(),
        () => showToast("Please allow GPS to use the app.", "warning")
      );
    } else {
      showToast("GPS blocked in browser.", "error");
    }
  } catch (_) {
    showToast("GPS permission error.", "error");
  }
}