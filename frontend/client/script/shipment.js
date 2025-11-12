// ==========================
// Configuration
// ==========================
const CONFIG = {
  apiUrl: "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/shipments",
  wsUrl: "wss://caiden-recondite-psychometrically.ngrok-free.dev", // Ngrok secure WebSocket URL
  defaultCenter: [14.5995, 120.9842],
  defaultZoom: 13,
  mapTileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  mapAttribution: "© OpenStreetMap contributors",
};

console.log("Connecting to", CONFIG.wsUrl);



// ==========================
// DOM Elements
// ==========================
const elements = {
  map: document.getElementById('map'),
  connectionStatus: document.getElementById('connection-status'),
  shipmentList: document.getElementById('shipment-list')
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
  routes: {}
};

// ==========================
// Initialize Map
// ==========================
const map = L.map('map').setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
L.tileLayer(CONFIG.mapTileUrl, { attribution: CONFIG.mapAttribution }).addTo(map);

// ==========================
// Ports (coords only; no pins added)
// ==========================
const manilaCoords = [14.5995, 120.9842];
const batangasPortCoords = [13.7560, 121.0585];
const cebuCoords = [10.3157, 123.8854];

// (Pins removed)
// L.marker(manilaCoords).addTo(map).bindPopup('<strong>Manila Port</strong>');
// L.marker(batangasPortCoords).addTo(map).bindPopup('<strong>Batangas Port</strong>');
// L.marker(cebuCoords).addTo(map).bindPopup('<strong>Cebu Port</strong>');

// ==========================
// Icons
// ==========================
const shipmentIcon = L.icon({
  iconUrl: '../../assets/img/shipment-icon.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -35]
});

const truckIcon = L.icon({
  iconUrl: '../../assets/img/truck-icon.png',
  iconSize: [50, 50],
  iconAnchor: [25, 50],
  popupAnchor: [0, -40]
});

// ==========================
// WebSocket
// ==========================
function initializeWebSocket() {
  state.websocket = new WebSocket(CONFIG.wsUrl);

  state.websocket.onopen = handleConnectionOpen;
  state.websocket.onmessage = handleMessage;
  state.websocket.onclose = handleConnectionClose;
  state.websocket.onerror = handleConnectionError;
}

function handleConnectionOpen() {
  updateConnectionStatus('connected', 'Connected');
  state.connectionAttempts = 0;
}

function handleMessage(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      Object.entries(data.data).forEach(([shipmentId, shipmentData]) => {
        updateShipmentData(shipmentId, shipmentData);
      });
    } else if (data.type === 'update') {
      updateShipmentData(data.shipmentid, {
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp
      });
    } else if (data.type === 'error') {
      console.error('Server error:', data.message);
    }
  } catch (err) {
    console.error('Error parsing message:', err);
  }
}

function handleConnectionClose() {
  updateConnectionStatus('disconnected', 'Disconnected');
  attemptReconnection();
}

function handleConnectionError(error) {
  console.error('WebSocket error:', error);
  updateConnectionStatus('disconnected', 'Connection Error');
}

// ==========================
// Reconnection Logic
// ==========================
function attemptReconnection() {
  if (state.connectionAttempts < CONFIG.maxReconnectAttempts) {
    state.connectionAttempts++;
    updateConnectionStatus('disconnected', `Reconnecting (${state.connectionAttempts})...`);
    setTimeout(() => {
      initializeWebSocket();
    }, CONFIG.reconnectInterval);
  } else {
    updateConnectionStatus('disconnected', 'Connection Failed');
  }
}

// ==========================
// UI Helpers
// ==========================
function updateConnectionStatus(status, message) {
  if (!elements.connectionStatus) return;
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.className = status;
}

// ==========================
// Shipment Updates
// ==========================
function updateShipmentData(shipmentId, data) {
  const { latitude, longitude, timestamp } = data;

  state.shipments[shipmentId] = {
    latitude,
    longitude,
    timestamp: timestamp || Date.now()
  };

  // Marker handling
  if (!state.markers[shipmentId]) {
    state.markers[shipmentId] = L.marker([latitude, longitude], { icon: truckIcon })
      .addTo(map)
      .bindPopup(`<strong>Shipment: ${shipmentId}</strong><br> Lat: ${latitude.toFixed(6)}<br> Lng: ${longitude.toFixed(6)}`);

    state.markers[shipmentId].on('click', () => {
      setActiveShipment(shipmentId);
    });
  } else {
    state.markers[shipmentId].setLatLng([latitude, longitude]);
    state.markers[shipmentId].getPopup().setContent(
      `<strong>Shipment: ${shipmentId}</strong><br> Lat: ${latitude.toFixed(6)}<br> Lng: ${longitude.toFixed(6)}`
    );
  }

  // Route drawing
  drawRoute(shipmentId);

  // Auto focus if active
  if (!state.activeShipmentId || state.activeShipmentId === shipmentId) {
    setActiveShipment(shipmentId);
  }

  updateShipmentListUI();
}

// ==========================
// Route Drawing (Land & Sea)
// ==========================
function drawRoute(shipmentId) {
  const shipment = state.shipments[shipmentId];
  if (!shipment) return;

  // Remove old route if exists
  if (state.routes[shipmentId]) {
    if (state.routes[shipmentId].remove) {
      state.routes[shipmentId].remove(); // LRM route
    } else {
      map.removeLayer(state.routes[shipmentId]); // polyline
    }
  }

  let destination = batangasPortCoords; // default
  let lineColor = 'gray';
  let usePolyline = false;

  if (shipmentId.includes("CEBU")) {
    destination = cebuCoords;
    lineColor = 'blue';
    usePolyline = true; // Manila → Cebu is sea route
  }

  if (usePolyline) {
    // Draw polyline for sea route
    state.routes[shipmentId] = L.polyline([
      [manilaCoords[0], manilaCoords[1]],
      [shipment.latitude, shipment.longitude],
      [destination[0], destination[1]]
    ], { color: lineColor, weight: 4, opacity: 0.7 }).addTo(map);
  } else {
    // Land route via LRM
    state.routes[shipmentId] = L.Routing.control({
      waypoints: [
        L.latLng(manilaCoords),
        L.latLng(shipment.latitude, shipment.longitude),
        L.latLng(destination)
      ],
      lineOptions: {
        styles: [{ color: lineColor, weight: 4, opacity: 0.7 }]
      },
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      createMarker: () => null
    }).addTo(map);
  }
}

// ==========================
// Set Active Shipment
// ==========================
function setActiveShipment(shipmentId) {
  state.activeShipmentId = shipmentId;

  const { latitude, longitude } = state.shipments[shipmentId];
  map.setView([latitude, longitude], 15);
  state.markers[shipmentId].openPopup();

  updateShipmentListUI();
}

// ==========================
// Shipment List UI
// ==========================
function updateShipmentListUI() {
  if (!elements.shipmentList) return;
  elements.shipmentList.innerHTML = '';

  const sortedShipments = Object.entries(state.shipments)
    .sort((a, b) => b[1].timestamp - a[1].timestamp);

  sortedShipments.forEach(([shipmentId, data]) => {
    const item = document.createElement('div');
    item.className = `shipment-item ${shipmentId === state.activeShipmentId ? 'active' : ''}`;

    const formattedTime = new Date(data.timestamp).toLocaleTimeString();
    const formattedDate = new Date(data.timestamp).toLocaleDateString();

    item.innerHTML = `
      <div class="shipment-id">Shipment: ${shipmentId}</div>
      <div class="shipment-coordinates">${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}</div>
      <div class="timestamp">${formattedTime} - ${formattedDate}</div>
    `;

    item.addEventListener('click', () => {
      setActiveShipment(shipmentId);
    });

    elements.shipmentList.appendChild(item);
  });
}

// ==========================
// WebSocket
// ==========================
function initializeWebSocket() {
  state.websocket = new WebSocket(CONFIG.wsUrl);

  state.websocket.onopen = handleConnectionOpen;
  state.websocket.onmessage = handleMessage;
  state.websocket.onclose = handleConnectionClose;
  state.websocket.onerror = handleConnectionError;
}

function handleConnectionOpen() {
  updateConnectionStatus("connected", "Connected");
  state.connectionAttempts = 0;
}

function handleMessage(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.type === "update") {
      updateShipmentData(data.shipmentid, {
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed,
        timestamp: data.timestamp
      });
    } else if (data.type === "init") {
      Object.entries(data.data).forEach(([shipmentId, shipmentData]) => {
        updateShipmentData(shipmentId, shipmentData);
      });
    } else if (data.type === "error") {
      console.error("Server error:", data.message);
    }
  } catch (err) {
    console.error("Error parsing message:", err);
  }
}

// Run app
document.addEventListener('DOMContentLoaded', initApp);

// Ensure map resize
setTimeout(() => {
  map.invalidateSize();
}, 200);

// ===================== Global Dropdown Toggle ===================== //
document.addEventListener("click", (e) => {
  const icon = document.getElementById("profileIcon");
  const dropdown = document.getElementById("profileDropdown");
  if (!icon || !dropdown) return;

  if (icon.contains(e.target)) {
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  } else if (!dropdown.contains(e.target)) {
    dropdown.style.display = "none";
  }
});

// ===================== Reload Profile on Page Return ===================== //
window.addEventListener("pageshow", () => {
  loadProfile();
});


// ===================== Load Profile ===================== //
async function loadProfile() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile", {
      method: "GET",
      credentials: "include"
    });
    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();

    // Username
    const usernameEl = document.getElementById("username");
    if (usernameEl) usernameEl.textContent = data.contact_person || "Client";

    // Profile icon
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
      profileIcon.src = `https://caiden-recondite-psychometrically.ngrok-free.dev/uploads/${data.photo}`;
      profileIcon.alt = "Profile";
    }
  } catch (err) {
    console.error("❌ Error loading profile:", err);
  }
}

// ===============================
// 🔔 LOAD NOTIFICATION COUNT (Dashboard Badge Only)
// ===============================
async function loadNotificationCount() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/notifications", {
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to fetch notifications (${res.status})`);

    const notifications = await res.json();
    if (!Array.isArray(notifications)) return;

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const notifCountEl = document.getElementById("notifCount");
    if (notifCountEl) {
      notifCountEl.textContent = unreadCount > 0 ? unreadCount : "";
      notifCountEl.style.display = unreadCount > 0 ? "inline-block" : "none";
    }

  } catch (err) {
    console.error("❌ Error fetching notification count:", err);
  }
}

setInterval(loadNotificationCount, 30000);
// ==========================
// WebSocket: Message Handler
// ==========================
function handleMessage(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.type === "update") {
      updateShipmentData(data.shipmentid, {
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed,
        timestamp: data.timestamp
      });
    } else if (data.type === "init") {
      Object.entries(data.data).forEach(([shipmentId, shipmentData]) => {
        updateShipmentData(shipmentId, shipmentData);
      });
    } else if (data.type === "error") {
      console.error("Server error:", data.message);
    }
  } catch (err) {
    console.error("Error parsing message:", err);
  }
}


// ==========================
// Shipment Updates
// ==========================
function updateShipmentData(shipmentId, data) {
  const { latitude, longitude, speed, timestamp } = data;

  // Save into state
  state.shipments[shipmentId] = {
    latitude,
    longitude,
    speed: speed || 0,
    timestamp: timestamp || Date.now()
  };

  // Marker handling
  if (!state.markers[shipmentId]) {
    state.markers[shipmentId] = L.marker([latitude, longitude], { icon: truckIcon })
      .addTo(map)
      .bindPopup(`
        <strong>Shipment: ${shipmentId}</strong><br>
        Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}<br>
        Speed: ${speed || 0} km/h
      `);

    state.markers[shipmentId].on("click", () => setActiveShipment(shipmentId));
  } else {
    state.markers[shipmentId].setLatLng([latitude, longitude]);
    state.markers[shipmentId].getPopup().setContent(`
      <strong>Shipment: ${shipmentId}</strong><br>
      Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}<br>
      Speed: ${speed || 0} km/h
    `);
  }

  // Route drawing
  drawRoute(shipmentId);

  // Auto focus if active
  if (!state.activeShipmentId || state.activeShipmentId === shipmentId) {
    setActiveShipment(shipmentId);
  }

  updateShipmentListUI();
}


//jade binago
// ==========================
// Init Application
// ==========================
function initApp() {
  initializeWebSocket();
  loadProfile();
  loadNotificationCount();

  // load client shipment
  loadClientShipments();


  window.addEventListener("focus", () => {
    if (state.websocket && state.websocket.readyState !== WebSocket.OPEN) {
      initializeWebSocket();
    }
  });
}


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
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/shipments", {
      credentials: "include"
    });

    if (!res.ok) throw new Error("Failed to fetch client shipments");
    const shipments = await res.json();

    // ✅ Allowed statuses only
    const allowedStatuses = ["approved", "in transit"];

    // ✅ Normalize and filter
    const activeShipments = shipments
      .filter(s => allowedStatuses.includes(s.status.toLowerCase()))
      .map(s => ({
        ...s,
        // Rename Approved → Order Shipped
        status: s.status.toLowerCase() === "approved" ? "Order Shipped" : s.status
      }));

    // ✅ Handle empty shipments
    if (activeShipments.length === 0) {
      shipmentList.innerHTML = `<p class="text-muted text-center mt-3">No active shipments.</p>`;
      return;
    }

    // ✅ Build dropdown manually (no auto population from API)
    statusSelect.innerHTML = `
      <option value="all">All Shipments</option>
      <option value="order shipped">Order Shipped</option>
      <option value="in transit">In Transit</option>
    `;

    // ==========================
    // Render shipment cards
    // ==========================
    function renderList() {
      const filter = statusSelect.value.toLowerCase();
      const query = searchInput.value.toLowerCase();
      shipmentList.innerHTML = "";

      const filtered = activeShipments.filter(s => {
        const matchesStatus = filter === "all" || s.status.toLowerCase() === filter;
        const matchesSearch = s.tracking_number.toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      });

      if (filtered.length === 0) {
        shipmentList.innerHTML = `<p class="text-muted text-center mt-3">No shipments found.</p>`;
        return;
      }

      filtered.forEach(s => {
        const card = document.createElement("div");
        card.className = "shipment-card";

        // Progress bar color based on status
        let progressColor = "#2e7fc0";
        let progressWidth = "50%";

        if (s.status.toLowerCase().includes("in transit")) {
          progressColor = "#2e7fc0";
          progressWidth = "65%";
        } else if (s.status.toLowerCase().includes("order shipped")) {
          progressColor = "#17a2b8";
          progressWidth = "35%";
        }

        card.innerHTML = `
          <h6><i class="fas fa-truck-moving me-2"></i> ${s.tracking_number}</h6>
          <p><strong>Status:</strong> ${s.status}</p>
          <p><strong>From:</strong> ${s.origin} → ${s.destination}</p>
          <p><strong>Updated:</strong> ${new Date(s.updated_at).toLocaleString()}</p>
          <div class="progress">
            <div class="progress-bar" style="width:${progressWidth}; background-color:${progressColor};"></div>
          </div>
          <div class="shipment-actions">
            <button class="btn-view" data-id="${s.id}">View</button>
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
