// ==========================
// GLOBAL API BASE
// ==========================
const API_BASE = "https://cargosmarttsl-5.onrender.com";

let clientOwnedTrackingNumbers = [];
let clientOwnedShipmentIds = [];

const CONFIG = {
  apiUrl: `${API_BASE}/api/admin/shipments`,
  clientShipmentsUrl: `${API_BASE}/api/client/shipments`,
  wsUrl: "wss://cargosmarttsl-5.onrender.com/client",
  defaultCenter: [14.5995, 120.9842],
  defaultZoom: 13,
  mapTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  mapAttribution: "© OpenStreetMap contributors",
  maxReconnectAttempts: 10,
  reconnectInterval: 2000,
};

console.log("Connecting to", CONFIG.wsUrl);

// ==========================
// DOM Elements
// ==========================
const elements = {
  map: document.getElementById("map"),
  connectionStatus: document.getElementById("connection-status"),
  shipmentList: document.getElementById("shipment-list"),
};

// ==========================
// State Management
// ==========================
const state = {
  markers: {},
  shipments: {},
  activeShipmentId: null,
  connectionAttempts: 0,
  websocket: null,
  routes: {},
};

// ==========================
// Initialize Map
// ==========================
const map = L.map("map").setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
L.tileLayer(CONFIG.mapTileUrl, { attribution: CONFIG.mapAttribution }).addTo(
  map
);

// ==========================
// Icons
// ==========================
const truckIcon = L.divIcon({
  html: '<i class="fas fa-truck-moving" style="font-size:28px;color:#0077b6;"></i>',
  className: "truck-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// ==========================
// Reconnection
// ==========================
function attemptReconnection() {
  if (state.connectionAttempts < CONFIG.maxReconnectAttempts) {
    state.connectionAttempts++;
    updateConnectionStatus(
      "disconnected",
      `Reconnecting (${state.connectionAttempts})...`
    );
    setTimeout(initializeWebSocket, CONFIG.reconnectInterval);
  } else {
    updateConnectionStatus("disconnected", "Connection Failed");
  }
}

function updateConnectionStatus(status, message) {
  if (!elements.connectionStatus) return;
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.className = status;
}

// ==========================
// DRAW ROUTE (Client Version)
// ==========================
async function drawRoute(shipmentId) {
  shipmentId = String(shipmentId);
  const shipment = state.shipments[shipmentId];
  if (!shipment) return;

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
    console.warn("❌ Client: No valid destination for shipment", shipmentId);
    return;
  }

  const startLat = shipment.latitude;
  const startLng = shipment.longitude;

  if (state.routes[shipmentId]) {
    map.removeLayer(state.routes[shipmentId]);
  }

  try {
    const url = `https://cargosmarttsl-5.onrender.com/api/map/route?originLat=${startLat}&originLng=${startLng}&destLat=${destLat}&destLng=${destLng}`;
    const res = await fetch(url);

    if (!res.ok) return;

    const json = await res.json();
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    const latlng = coords.map((c) => [c[1], c[0]]);

    state.routes[shipmentId] = L.polyline(latlng, {
      color: "#0077b6",
      weight: 4,
      opacity: 0.9,
    }).addTo(map);
  } catch (err) {
    console.error("❌ Client route error:", err);
  }
}

// ==========================
// SET ACTIVE SHIPMENT
// ==========================
function setActiveShipment(shipmentId) {
  shipmentId = String(shipmentId);

  const ship = state.shipments[shipmentId];
  if (!ship) return;

  map.setView([ship.latitude, ship.longitude], 15);
  state.markers[shipmentId]?.openPopup();
  state.activeShipmentId = shipmentId;
  updateShipmentListUI();
}

function updateShipmentListUI() {
  const activeId = state.activeShipmentId;
  document.querySelectorAll(".shipment-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.tracking === activeId);
  });
}

function getShipmentIdByDriverId_Client(driverId) {
  for (const id in state.shipments) {
    const s = state.shipments[id];
    if (String(s.driver_id) === String(driverId)) {
      return id;
    }
  }
  return null;
}

/* ==============================
   CLIENT GPS WebSocket Stream
============================== */

let lastPositions = {}; // shipmentId → last GPS
let pendingGPSUpdates = []; // buffer when not active

function initClientWebSocket() {
  try {
    if (
      state.websocket &&
      (state.websocket.readyState === WebSocket.OPEN ||
        state.websocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
  } catch (_) {}

  state.websocket = new WebSocket(CONFIG.wsUrl);

  state.websocket.onopen = () => {
    console.log("🟢 Client GPS WS connected");
    updateConnectionStatus("connected", "Connected");
    state.connectionAttempts = 0;
  };

  state.websocket.onclose = () => {
    console.warn("🔻 Client GPS WS closed — reconnecting...");
    updateConnectionStatus("disconnected", "Disconnected");
    attemptReconnection();
  };

  state.websocket.onerror = (err) => {
    console.warn("⚠ Client GPS WS error:", err);
    updateConnectionStatus("disconnected", "Connection Error");
  };

  state.websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      /* ==============================
         INIT batch from backend
      =============================== */
      if (data.type === "init" || data.type === "init_data") {
        const allData = data.data || [];
        console.log("🟦 CLIENT INIT DATA:", allData);

        allData.forEach((s) => {
          const shipmentId = String(s.id || s.shipmentId || s.tracking_number);
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);

          if (!isFinite(lat) || !isFinite(lng)) return;

          lastPositions[shipmentId] = {
            lat,
            lng,
            t: s.timestamp || Date.now(),
          };

          // Preload into map
          updateShipmentData(shipmentId, {
            latitude: lat,
            longitude: lng,
            specific_lat: s.specific_lat,
            specific_lon: s.specific_lon,
            delivery_lat: s.delivery_lat,
            delivery_lon: s.delivery_lon,
            driver_id: s.driver_id,
          });
        });

        return;
      }

      /* ==============================
         LIVE GPS UPDATE (streaming)
      =============================== */
      if (
        ["gps_update", "update", "driver_location", "driver_gps"].includes(
          data.type
        )
      ) {
        let shipmentId = String(
          data.shipmentId || data.id || data.tracking_number
        );

        // Fallback using driver ID
        if (!shipmentId || shipmentId === "undefined") {
          shipmentId = getShipmentIdByDriverId_Client(
            data.driverId || data.driver_id
          );
        }

        if (!shipmentId) return;

        const newLat = Number(data.latitude || data.lat);
        const newLng = Number(data.longitude || data.lng);

        if (!isFinite(newLat) || !isFinite(newLng)) return;

        const shipment = state.shipments[shipmentId];
        if (!shipment) return; // not owned by this client

        // ignore delivered
        if (String(shipment.status).toLowerCase() === "delivered") return;

        console.log(
          `📡 CLIENT GPS SHIPMENT#${shipmentId} → ${newLat}, ${newLng}`
        );

        /* ==============================
           JITTER FILTER
        =============================== */
        const last = lastPositions[shipmentId];
        const moved =
          !last ||
          Math.abs(last.lat - newLat) > 0.00001 ||
          Math.abs(last.lng - newLng) > 0.00001;

        if (!moved) return;

        lastPositions[shipmentId] = {
          lat: newLat,
          lng: newLng,
          t: Date.now(),
        };

        /* ==============================
           If map focusing this shipment → update now
        =============================== */
        if (state.activeShipmentId === shipmentId) {
          console.log("🟢 Client LIVE apply:", shipmentId);
          updateShipmentData(shipmentId, {
            latitude: newLat,
            longitude: newLng,
            specific_lat: data.specific_lat,
            specific_lon: data.specific_lon,
            delivery_lat: data.delivery_lat,
            delivery_lon: data.delivery_lon,
            driver_id: data.driver_id,
          });

          // redraw route
          if (state.shipments[shipmentId]?.delivery_lat) {
            drawRoute(shipmentId);
          }
        } else {
          /* ==============================
             Shipment not selected → buffer
          =============================== */
          console.log("📦 CLIENT buffer GPS update:", shipmentId);
          pendingGPSUpdates = pendingGPSUpdates.filter(
            (u) => String(u.shipmentId) !== shipmentId
          );

          pendingGPSUpdates.push({
            shipmentId,
            latitude: newLat,
            longitude: newLng,
          });
        }
      }
    } catch (err) {
      console.error("CLIENT WS parse error:", err);
    }
  };
}

// ==========================
// UPDATE SHIPMENT DATA
// ==========================
function updateShipmentData(shipmentId, data) {
  console.log("DEBUG → updateShipmentData:", shipmentId, data);
  shipmentId = String(shipmentId);

  // Stop bad GPS from creating duplicate markers
  if (!isFinite(data.latitude) || !isFinite(data.longitude)) {
    console.warn("Skipping marker — invalid GPS for", shipmentId);
    return;
  }

  // Update stored shipment data
  state.shipments[shipmentId] = {
    ...state.shipments[shipmentId],
    latitude: data.latitude,
    longitude: data.longitude,
    speed: data.speed || 0,
    timestamp: data.timestamp || Date.now(),
    specific_lat: data.specific_lat,
    specific_lon: data.specific_lon,
    delivery_lat: data.delivery_lat,
    delivery_lon: data.delivery_lon,
    driver_id: data.driver_id || state.shipments[shipmentId]?.driver_id || null,
  };

  // Create marker ONLY once
  if (!state.markers[shipmentId]) {
    console.log("Creating marker ONE TIME for", shipmentId);

    state.markers[shipmentId] = L.marker([data.latitude, data.longitude], {
      icon: truckIcon,
    }).addTo(map);

    state.markers[shipmentId].on("click", () => setActiveShipment(shipmentId));
  } else {
    state.markers[shipmentId].setLatLng([data.latitude, data.longitude]);
  }

  drawRoute(shipmentId);
  updateShipmentListUI();
}

// ==========================
// LOAD PROFILE (Client)
// ==========================
async function loadProfile() {
  try {
    const res = await fetch(
      `https://cargosmarttsl-5.onrender.com/api/profile`,
      {
        method: "GET",
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();

    const usernameEl = document.getElementById("username");
    if (usernameEl) usernameEl.textContent = data.contact_person || "Client";

    let profileIcon = document.getElementById("profileIcon");
    if (profileIcon && data.photo) {
      if (profileIcon.tagName.toLowerCase() !== "img") {
        const img = document.createElement("img");
        img.id = "profileIcon";
        img.className = "profile-icon rounded-circle";
        img.style.width = "40px";
        img.style.height = "40px";
        img.style.objectFit = "cover";
        img.style.cursor = "pointer";
        profileIcon.replaceWith(img);
        profileIcon = img;
      }
      profileIcon.src = `https://cargosmarttsl-5.onrender.com/uploads/${data.photo}`;
      profileIcon.alt = "Profile";
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

/* =================== LOAD NOTIFICATION COUNT =================== */
async function loadNotificationCount() {
  try {
    const res = await fetch(`${API_BASE}/api/client/notifications`, {
      credentials: "include",
    });
    if (!res.ok)
      throw new Error(`Failed to fetch notifications (${res.status})`);

    const notifications = await res.json();
    if (!Array.isArray(notifications)) return;

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const notifCountEl = document.getElementById("notifCount");
    if (notifCountEl) {
      notifCountEl.textContent = unreadCount > 0 ? unreadCount : "";
      notifCountEl.style.display = unreadCount > 0 ? "inline-block" : "none";
    }
  } catch (err) {
    console.error("Error fetching notification count:", err);
  }
}

loadProfile();
loadNotificationCount();
setInterval(loadNotificationCount, 30000);

// ==========================
// INIT APP
// ==========================
function initApp() {
  initClientWebSocket();
  loadProfile();
  loadNotificationCount();
  loadClientShipments();

  // Reconnect when returning to tab
  window.addEventListener("focus", () => {
    if (state.websocket && state.websocket.readyState !== WebSocket.OPEN) {
      initClientWebSocket();
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);

// Ensure map layout refreshes
setTimeout(() => map.invalidateSize(), 200);

/* =================== Profile Dropdown =================== */
document.addEventListener("click", (e) => {
  const icon = document.getElementById("profileIcon");
  const dropdown = document.getElementById("profileDropdown");
  if (!icon || !dropdown) return;

  if (icon.contains(e.target)) {
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  } else if (!dropdown.contains(e.target)) {
    dropdown.style.display = "none";
  }
});

window.addEventListener("pageshow", () => {
  loadProfile();
});

//dinagdag ni jade

// ===============================
// 🛰️ Load Client Shipments Dynamically (with Loading & Empty States)
// ===============================
async function loadClientShipments() {
  const shipmentList = document.getElementById("shipment-list");
  const statusSelect = document.getElementById("statusFilter");
  const searchInput = document.getElementById("searchInput");

  // Show loading text while fetching
  shipmentList.innerHTML = `<p class="text-muted text-center mt-3">Loading shipments...</p>`;

  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/client/shipments",
      {
        credentials: "include",
      }
    );

    if (!res.ok) throw new Error("Failed to fetch client shipments");
    const shipments = await res.json();

    // Allowed statuses only
    const allowedStatuses = ["shipping", "in transit"];

    // Normalize statuses and filter
    const activeShipments = shipments
      .map((s) => ({
        ...s,
        status: s.status.toLowerCase(), // keep original status only
      }))
      .filter((s) => allowedStatuses.includes(s.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    clientOwnedTrackingNumbers = activeShipments.map((s) => s.tracking_number);
    clientOwnedShipmentIds = activeShipments.map((s) => String(s.id));

    console.log("DEBUG → Active shipments:", activeShipments);
    console.log("DEBUG → clientOwnedShipmentIds:", clientOwnedShipmentIds);
    console.log(
      "DEBUG → clientOwnedTrackingNumbers:",
      clientOwnedTrackingNumbers
    );

    // ✅ Handle empty shipments
    if (activeShipments.length === 0) {
      shipmentList.innerHTML = `<p class="text-muted text-center mt-3">No active shipments.</p>`;
      return;
    }

    // ✅ Build dropdown manually (no auto population from API)
    statusSelect.innerHTML = `
  <option value="all">All Shipments</option>
  <option value="shipping">Shipping</option>
  <option value="in transit">In Transit</option>
`;

    shipmentList.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-view");
      if (!btn) return;

      const shipmentId = btn.dataset.id;
      console.log("DEBUG → View on map clicked:", shipmentId);
      focusShipmentOnMap(shipmentId);
    });

    // ==========================
    // Render shipment cards
    // ==========================
    function renderList() {
      const filter = statusSelect.value.toLowerCase();
      const query = searchInput.value.toLowerCase();
      shipmentList.innerHTML = "";

      const filtered = activeShipments.filter((s) => {
        const matchesStatus =
          filter === "all" || s.status.toLowerCase() === filter;
        const matchesSearch = s.tracking_number.toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      });

      if (filtered.length === 0) {
        shipmentList.innerHTML = `<p class="text-muted text-center mt-3">No shipments found.</p>`;
        return;
      }

      filtered.forEach((s) => {
        const card = document.createElement("div");
        card.className = "shipment-card";
        card.dataset.tracking = s.id;

        const normalizedStatus = s.status.toLowerCase();
        let statusLabel = s.status;
        let statusClass = "status-badge-default";
        let progressWidth = "40";

        if (normalizedStatus === "shipping") {
          statusLabel = "Shipping";
          statusClass = "status-badge-shipped";
          progressWidth = "35";
        } else if (normalizedStatus === "in transit") {
          statusLabel = "In Transit";
          statusClass = "status-badge-transit";
          progressWidth = "65";
        }

        const updatedAt = new Date(s.updated_at);

        card.innerHTML = `
    <div class="shipment-card-header">
      <div class="shipment-id">
        <span class="shipment-label">Tracking ID</span>
        <span class="shipment-value">${s.tracking_number}</span>
      </div>
      <span class="shipment-status ${statusClass}">${statusLabel}</span>
    </div>

    <div class="shipment-card-body">
      <div class="shipment-route">
        <i class="uil uil-location-point route-icon"></i>
        <div class="route-text">
          <span class="route-label">Route</span>
          <span class="route-value">${s.origin} → ${s.destination}</span>
        </div>
      </div>

      <div class="shipment-meta">
        <span class="meta-label">Last updated</span>
        <span class="meta-value">${updatedAt.toLocaleString()}</span>
      </div>

      <div class="shipment-progress-wrapper">
        <div class="shipment-progress-track">
          <div class="shipment-progress-fill" style="width:${progressWidth}%;"></div>
        </div>
        <div class="shipment-progress-steps">
          <span class="step-dot step-done"></span>
          <span class="step-dot ${
            normalizedStatus.includes("in transit") ? "step-current" : ""
          }"></span>
          <span class="step-dot"></span>
        </div>
      </div>
    </div>

    <div class="shipment-card-footer">
      <button class="btn-view" data-id="${s.id}">
        <i class="uil uil-focus-add"></i>
        View on map
      </button>
    </div>
  `;

        shipmentList.appendChild(card);
      });
    }

    // Initial render
    renderList();

    // Event listeners for filters
    statusSelect.addEventListener("change", renderList);
    searchInput.addEventListener("input", renderList);
  } catch (err) {
    console.error("❌ Error loading client shipments:", err);
    shipmentList.innerHTML = `<p class="text-danger text-center mt-3">Failed to load shipments.</p>`;
  }
}

function focusShipmentOnMap(shipmentId) {
  shipmentId = String(shipmentId);
  console.log(
    "DEBUG → focusShipmentOnMap:",
    shipmentId,
    state.shipments[shipmentId]
  );

  if (!state.shipments[shipmentId]) {
    alert("GPS location not available yet for this shipment.");
    return;
  }

  // HIDE other markers (but keep them alive)
  for (const id in state.markers) {
    if (id !== shipmentId) {
      if (map.hasLayer(state.markers[id])) {
        map.removeLayer(state.markers[id]);
      }
    }
  }

  const { latitude, longitude } = state.shipments[shipmentId];

  // Center map and zoom
  map.setView([latitude, longitude], 18, {
    animate: true,
    duration: 0.7,
  });

  // DO NOT openPopup (you removed popup binding)
  // state.markers[shipmentId].openPopup();  <-- REMOVE

  // If marker was removed before, re-add it
  if (!map.hasLayer(state.markers[shipmentId])) {
    state.markers[shipmentId].addTo(map);
  }

  // MARK AS ACTIVE (this fixes live updates)
  state.activeShipmentId = shipmentId;

  updateShipmentListUI();
}
