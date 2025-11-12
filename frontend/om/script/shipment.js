// ==============================
// Optimized WebSocket for GPS updates 
// ==============================
let ws;
let mapMarkers = {};
let lastPositions = {}; // ✅ Track last known coordinates per shipment
let pendingGPSUpdates = [];
let markerAnimations = {}; 
let allShipments = [];


function initWebSocket() {
  ws = new WebSocket("wss://caiden-recondite-psychometrically.ngrok-free.dev");

  ws.onopen = () => console.log("✅ GPS WebSocket connected");

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // 🟢 INITIAL BATCH DATA (first load)
      if (data.type === "init" || data.type === "init_data") {
        if (!modalMap || !state.activeShipmentId) {
          pendingGPSUpdates.push(data);
          return;
        }

        const allData = data.data || {};
        const activeId = String(state.activeShipmentId);

        if (allData[activeId]) {
          const { latitude, longitude } = allData[activeId];
          if (latitude && longitude) {
            lastPositions[activeId] = { lat: latitude, lng: longitude };
            updateShipmentMarkerSmooth(activeId, latitude, longitude);
          }
        }
        return;
      }

      // 🟡 LIVE GPS UPDATE (from backend, no type)
      if (data.deviceId && data.latitude && data.longitude) {
        console.log(
          `📡 Live GPS update for ${data.deviceId}: ${data.latitude}, ${data.longitude}`
        );

        // Find which shipment belongs to this device
        const shipment = (allShipments || []).find(
          (s) => s.device_id === data.deviceId
        );

        if (!shipment) {
          console.warn("⚠️ No shipment found for device:", data.deviceId);
          return;
        }

        const shipmentId = String(shipment.id);

        // Only process if this shipment is currently viewed
        if (
          !state.activeShipmentId ||
          shipmentId !== String(state.activeShipmentId)
        )
          return;

        // Buffer update if map not ready
        if (!modalMap) {
          pendingGPSUpdates.push(data);
          return;
        }

        // Avoid redundant updates
        const last = lastPositions[shipmentId];
        if (
          last &&
          Math.abs(last.lat - data.latitude) < 0.00001 &&
          Math.abs(last.lng - data.longitude) < 0.00001
        ) {
          return;
        }

        // Save last known position
        lastPositions[shipmentId] = { lat: data.latitude, lng: data.longitude };

        // 🧭 Move marker smoothly
        updateShipmentMarkerSmooth(shipmentId, data.latitude, data.longitude);
      }
    } catch (err) {
      console.error("❌ WS parse error:", err, event.data);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ GPS WS disconnected, retrying in 3s...");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
  };
}




// ==============================
// 📍 Update or Create Shipment Marker (Improved + Auto Unassign)
// ==============================
async function updateShipmentMarker(shipmentId, lat, lng) {
  // Validate coordinates
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    console.warn("⚠️ Skipping marker update: invalid coordinates", { shipmentId, lat, lng });
    return;
  }

  if (!modalMap) {
    console.warn("⚠️ Map not ready yet — skipping marker update");
    return;
  }

  shipmentId = String(shipmentId);
  console.log("🟢 updateShipmentMarker CALLED for:", shipmentId, lat, lng);

  // ✅ Allow updates for ALL shipments (no filtering by activeShipmentId)
  if (mapMarkers[shipmentId]) {
    // Update existing marker position
    mapMarkers[shipmentId].setLatLng([lat, lng]);
   } else {
    // Create immediately and store first
    const marker = L.marker([lat, lng])
      .addTo(modalMap)
      .bindPopup(
        `<b>Shipment #${shipmentId}</b><br>
         Lat: ${lat.toFixed(5)}<br>
         Lng: ${lng.toFixed(5)}`
      );
    mapMarkers[shipmentId] = marker;

     hasAssignedGpsDevice(shipmentId).then(assigned => {
      if (assigned && assigned.device_id) {
        marker.device_id = assigned.device_id;
      }
    });
  }

  // 🧭 Auto-unassign when near destination
  const shipment = state.shipments.find(s => String(s.id) === String(shipmentId));
  if (shipment && shipment.delivery_port_lat && shipment.delivery_port_lng) {
    const destLat = shipment.destination_lat;
    const destLng = shipment.destination_lng;


    const current = L.latLng(lat, lng);
    const destination = L.latLng(destLat, destLng);
    const distance = modalMap.distance(current, destination);

    if (distance < 200) { // within 200 meters
      console.log(`🚩 Shipment ${shipmentId} reached destination (${distance.toFixed(1)}m)`);

      const deviceId = mapMarkers[shipmentId]?.device_id;
      if (deviceId) {
        try {
          await fetch(`${CONFIG.gpsUrl}/unassign/${deviceId}`, { method: "PUT" });
          modalMap.removeLayer(mapMarkers[shipmentId]);
          delete mapMarkers[shipmentId];

          showNotification({
            variant: "info",
            title: "Shipment Arrived",
            message: `Shipment #${shipmentId} reached destination. GPS auto-unassigned.`,
          });

          fetchShipments();
        } catch (err) {
          console.error("❌ Auto-unassign error:", err);
        }
      }
    }
  }
}

// ==============================
// Smoothly move markers (animated GPS updates)
// ==============================
function updateShipmentMarkerSmooth(shipmentId, newLat, newLng) {
  shipmentId = String(shipmentId);

  // Initialize trail storage
  if (!markerAnimations[shipmentId]) markerAnimations[shipmentId] = [];

  // Create truck marker if missing
  if (!mapMarkers[shipmentId]) {
    const truckIcon = L.divIcon({
      html: '<i class="fas fa-truck-moving" style="color:#0077b6;font-size:28px;transform:rotate(0deg);"></i>',
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
  const steps = 25; // smoother animation
  const duration = 1200; // ms
  const stepLat = (newLat - oldPos.lat) / steps;
  const stepLng = (newLng - oldPos.lng) / steps;
  let currentStep = 0;

  // 🧭 Rotate marker to face direction of movement
  const angle = Math.atan2(newLng - oldPos.lng, newLat - oldPos.lat) * (180 / Math.PI);
  const iconEl = marker.getElement()?.querySelector("i");
  if (iconEl) {
    iconEl.style.transition = "transform 0.3s linear";
    iconEl.style.transform = `rotate(${angle}deg)`;
  }

  // 🟦 Draw fading trail segment
  const prevPoint = markerAnimations[shipmentId].slice(-1)[0];
  const newPoint = [newLat, newLng];
  markerAnimations[shipmentId].push(newPoint);

  if (prevPoint) {
    const trail = L.polyline([prevPoint, newPoint], {
      color: "#0077b6",
      weight: 3,
      opacity: 0.8,
    }).addTo(modalMap);

    // 🔥 Gradually fade and remove after a few seconds
    let opacity = 0.8;
    const fadeInterval = setInterval(() => {
      opacity -= 0.1;
      if (opacity <= 0) {
        clearInterval(fadeInterval);
        modalMap.removeLayer(trail);
      } else {
        trail.setStyle({ opacity });
      }
    }, 400);
  }

  // 🎞️ Animate marker movement
  const moveInterval = setInterval(() => {
    if (currentStep >= steps) {
      clearInterval(moveInterval);
      marker.setLatLng([newLat, newLng]);
      return;
    }

    const lat = oldPos.lat + stepLat * currentStep;
    const lng = oldPos.lng + stepLng * currentStep;
    marker.setLatLng([lat, lng]);

    //center map optional when moving truck
    // modalMap.panTo([lat, lng], { animate: true, duration: 0.5 });

    currentStep++;
  }, duration / steps);
}

// ==============================
// Configuration
// ==============================
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

// ==============================
// DOM Elements
// ==============================
const elements = {
  tableBody: document.getElementById("recent-shipments-table"),
  modalEl: document.getElementById("shipmentDetailsModal"),
  detailsBody: document.getElementById("shipmentDetailsBody"),
  mapId: "shipmentMap",
};

// ==============================
// State
// ==============================
const state = {
  shipments: [],
  activeShipmentId: null,
};

let modalMap = null;

// ==============================
// Notifications
// ==============================
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

  const modal = new bootstrap.Modal(document.getElementById("notificationModal"));
  modal.show();
  setTimeout(() => modal.hide(), 1800);
}

// ==============================
// ✅ Fetch and Display Assigned GPS Device
// ==============================
async function loadAssignedGPS(shipmentId) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/assigned/${shipmentId}`);

    // 🟡 Silently handle 404 (no GPS)
    if (res.status === 404) {
      const gpsStatus = document.getElementById("gpsStatus");
      if (gpsStatus) {
        gpsStatus.innerHTML = `
          <div class="alert alert-warning py-2 px-3 mb-2">
            ⚠️ No GPS device assigned.
          </div>`;
      }
      return; // ✅ stop quietly — no console error
    }

    // 🟠 Handle unexpected errors but suppress console noise
    if (!res.ok) return;

    const data = await res.json();
    const gpsStatus = document.getElementById("gpsStatus");
    if (!gpsStatus) return;

    gpsStatus.innerHTML = `
      <div class="alert alert-success py-2 px-3 mb-2">
        ✅ <b>${data.device_id}</b> assigned<br>
        Notes: ${data.notes || "None"}<br>
        Assigned: ${new Date(data.assigned_at).toLocaleString()}
      </div>`;
  } catch (err) {
    // 👇 no error spam for harmless cases
    console.debug("loadAssignedGPS() silent:", err);
  }
}

// ==============================
// 🧭 Show Shipment Details (with map + progress tracker)
// ==============================
async function showShipmentDetails(shipment) {
  const card = document.getElementById("shipmentDetailsCard");
  if (!card) {
    console.error("❌ shipmentDetailsCard not found in DOM");
    return;
  }

  card.innerHTML = "";
  if (modalMap) {
    modalMap.remove();
    modalMap = null;
  }

  // Render shipment tracker header
  if (typeof renderOrderTrackerHTML === "function") {
    card.innerHTML = renderOrderTrackerHTML(shipment);
  }

  // Determine current shipment progress
  const statusKey = normalizeShipmentStatus(shipment.status);
  const steps = ["processed", "shipped", "en_route", "delivered"];
  const idx = Math.max(0, steps.indexOf(statusKey));
  if (typeof setOrderStep === "function") setOrderStep(idx);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("shipmentDetailsModal"));
  modal.show();

  state.activeShipmentId = shipment.id;

  // ✅ Load GPS assignment and check if one exists
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

  // ✅ Initialize map after short delay
  state.activeShipmentId = String(shipment.id);
  setTimeout(async () => {
    modalMap = L.map(elements.mapId).setView(
      [shipment.latitude || CONFIG.defaultCenter[0], shipment.longitude || CONFIG.defaultCenter[1]],
      CONFIG.defaultZoom
    );
    L.tileLayer(CONFIG.mapTileUrl, { attribution: CONFIG.mapAttribution }).addTo(modalMap);

    // ===============================
    // 🗺️ Origin → Destination + Driving Route
    // ===============================
    if (shipment.origin_lat && shipment.origin_lon && shipment.delivery_lat && shipment.delivery_lon) {
      const origin = [shipment.origin_lat, shipment.origin_lon];
      const destination = [shipment.delivery_lat, shipment.delivery_lon];

      // 🟢 Origin Marker
      L.marker(origin, {
        title: "Origin",
        icon: L.divIcon({
          className: "origin-marker",
          html: '<i class="fas fa-warehouse" style="color:#2e7fc0;font-size:24px;"></i>',
          iconSize: [24, 24],
        }),
      }).addTo(modalMap).bindPopup(`<b>Origin:</b><br>${shipment.port_origin || "Unknown"}`);

      // 🔵 Destination Marker
      L.marker(destination, {
        title: "Destination",
        icon: L.divIcon({
          className: "dest-marker",
          html: '<i class="fas fa-map-marker-alt" style="color:#60adf4;font-size:26px;"></i>',
          iconSize: [26, 26],
        }),
      }).addTo(modalMap).bindPopup(`<b>Destination:</b><br>${shipment.port_delivery || "Unknown"}`);

      // 🚗 Geoapify Driving Route (with fallback)
      try {
        const routeUrl = `https://api.geoapify.com/v1/routing?waypoints=${shipment.origin_lat},${shipment.origin_lon}|${shipment.delivery_lat},${shipment.delivery_lon}&mode=drive&apiKey=e5e95eba533c4eb69344256d49166905`;
        const routeRes = await fetch(routeUrl);
        const routeData = await routeRes.json();

        if (routeData.features?.length) {
          const coords = routeData.features[0].geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
          const routeLine = L.polyline(coords, {
            color: "#0077b6",
            weight: 4,
            opacity: 0.8,
          }).addTo(modalMap);
          modalMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
        } else {
          const fallback = L.polyline([origin, destination], {
            color: "#60adf4",
            weight: 4,
            opacity: 0.9,
            dashArray: "6,8",
          }).addTo(modalMap);
          modalMap.fitBounds(fallback.getBounds(), { padding: [50, 50] });
        }
      } catch (err) {
        console.warn("Geoapify route fetch failed:", err);
        const fallback = L.polyline([origin, destination], {
          color: "#60adf4",
          weight: 4,
          opacity: 0.9,
          dashArray: "6,8",
        }).addTo(modalMap);
        modalMap.fitBounds(fallback.getBounds(), { padding: [50, 50] });
      }
    }

    // ✅ Apply buffered GPS updates (before map ready)
    if (pendingGPSUpdates.length > 0) {
      console.log(`📍 Applying ${pendingGPSUpdates.length} buffered GPS updates`);
      for (const data of pendingGPSUpdates) {
        if (String(data.shipmentid) === String(shipment.id)) {
          updateShipmentMarkerSmooth(data.shipmentid, data.latitude, data.longitude);
        }
      }
      pendingGPSUpdates = [];
    }

    // ✅ Fetch and display ONLY if there is an active GPS device
    const activeDevice = await hasAssignedGpsDevice(shipment.id);
    if (!activeDevice) {
      console.log(`⛔ Skipping GPS history fetch — shipment ${shipment.id} has no assigned device.`);
      const mapContainer = document.getElementById("shipmentMap");
      if (mapContainer)
        mapContainer.innerHTML = `<div class="text-center text-muted py-4">No GPS device assigned</div>`;
      return;
    }

    // ✅ Fetch and display ONLY the latest GPS position (no route/trail)
    const history = await fetchGpsHistory(shipment.id);
    const lastValid = history
      .filter((p) => p.latitude != null && p.longitude != null)
      .pop();

    if (lastValid) {
      updateShipmentMarkerSmooth(String(shipment.id), lastValid.latitude, lastValid.longitude);
      modalMap.setView([lastValid.latitude, lastValid.longitude], CONFIG.defaultZoom);
    } else {
      modalMap.setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
    }

    // 🚀 Start live tracking (no history trails)
    startGpsTracking(shipment.id, modalMap);
  }, 350);
}

// 🔧 Ensure map resizes properly when modal becomes visible
document.getElementById("shipmentDetailsModal").addEventListener("shown.bs.modal", () => {
  if (modalMap) {
    setTimeout(() => modalMap.invalidateSize(), 250);
  }
});



// ==============================
// ✅ GPS + API calls
// ==============================
async function hasAssignedGpsDevice(id) {
  try {
    const res = await fetch(`${CONFIG.gpsUrl}/assigned/${id}`);

    // 🟡 Ignore normal “not found” case
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = await res.json();
    return data.device_id ? data : null;
  } catch {
    return null; // no console output
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

//check if currently assigned

async function fetchAssignedGPS(shipmentId) {
  const res = await fetch(`${CONFIG.gpsUrl}/assigned/${shipmentId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.device_id ? data : null;
}


// ==============================
// 💾 Add & Assign GPS Device
// ==============================
const addGpsForm = document.getElementById("addGpsForm");
if (addGpsForm) {
  addGpsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const device_id = document.getElementById("gpsImei").value.trim();
    const shipment_id = document.getElementById("gpsShipment").value.trim();
    const notes = document.getElementById("gpsNotes").value.trim();

console.log("🚀 Sending GPS assignment:", { device_id, shipment_id, notes });


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
      alert("❌ " + err.message);
    }
  });
}


// ==============================
// 🔴 Unassign GPS Device (Improved)
// ==============================
async function unassignGpsDevice(device_id) {
  if (!device_id) {
    alert("⚠️ No device ID provided.");
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

    // ✅ Remove the marker immediately
    for (const [shipmentId, marker] of Object.entries(mapMarkers)) {
      if (marker.device_id === device_id) {
        modalMap.removeLayer(marker);
        delete mapMarkers[shipmentId];
        console.log(`🗑️ Removed marker for shipment ${shipmentId} (device ${device_id})`);
      }
    }

    // ✅ Refresh GPS + shipments list
    await fetchShipments();

  } catch (err) {
    showNotification({
      variant: "error",
      title: "Unassign Failed",
      message: err.message,
    });
  }
}



// ============================================================
// ==============  ORDER TRACKER (4-step progress)  ============
// ============================================================
function normalizeShipmentStatus(s) {
  s = (s || "").toLowerCase();
  if (["pending", "approved", "processing", "processed", "booked", "awaiting pickup"].includes(s))
    return "processed";
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

// ==============================
// 👁️ View Handlers
// ==============================
function attachViewHandlers() {
  document.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const shipmentId = btn.dataset.id;
      const shipment = state.shipments.find(s => String(s.id) === String(shipmentId));
      if (shipment) showShipmentDetails(shipment);
      else console.error(`Shipment ${shipmentId} not found`);
    });
  });
}


// ==============================
// 🔘 Action Handlers
// ==============================
function attachActionHandlers() {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const shipmentId = e.currentTarget.dataset.id;
      const newStatus = e.currentTarget.dataset.status;
      await updateShipmentStatus(shipmentId, newStatus);
    });
  });
}


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
  <span class="badge ${getBadgeClass(s.status)}">
    ${s.status || "Unknown"}
  </span>
</td>

     <td>
  <button class="shipment-action-btn btn-view" data-id="${s.id}" title="View">
    View
  </button>
</td>

      <td><div class="d-flex gap-2">
          <button class="btn btn-sm btn-warning rounded-circle action-btn" data-id="${s.id}" data-status="Shipping" title="Shipping"><i class="fas fa-ship text-white"></i></button>
          <button class="btn btn-sm btn-info rounded-circle action-btn" data-id="${s.id}" data-status="In Transit" title="In Transit"><i class="fas fa-truck text-white"></i></button>
          <button class="btn btn-sm btn-success rounded-circle action-btn" data-id="${s.id}" data-status="Delivered" title="Delivered"><i class="fas fa-box-open text-white"></i></button>
      </div></td>`;
    elements.tableBody.appendChild(tr);
  });
  attachActionHandlers();
  attachViewHandlers();
}

// 2️⃣ Now define fetchShipments() below it
async function fetchShipments() {
  try {
    const res = await fetch(CONFIG.apiUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch shipments: ${res.status}`);
    const data = await res.json();
    console.log("✅ Shipments fetched:", data);

    // 🟢 Store globally for WebSocket GPS tracking
    allShipments = data;
    state.shipments = data;

    renderPaginatedShipments(1);
  } catch (err) {
    console.error("❌ Error loading shipments:", err);
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

// ==============================
// 📄 Pagination Setup
// ==============================
let currentPage = 1;
const rowsPerPage = 10;
let totalPages = 1;

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
  <span class="badge ${getBadgeClass(s.status)}">
    ${s.status || "Unknown"}
  </span>
</td>

      <td>
  <button class="shipment-action-btn btn-view" data-id="${s.id}" title="View">
   </i> View
  </button>
</td>

<td>
  <div class="d-flex gap-2 justify-content-center">
    <button class="shipment-action-btn btn-shipping" data-id="${s.id}" data-status="Shipping">Shipping</button>
    <button class="shipment-action-btn btn-intransit" data-id="${s.id}" data-status="In Transit">In Transit</button>
    <button class="shipment-action-btn btn-delivered" data-id="${s.id}" data-status="Delivered">Delivered</button>
  </div>
</td>
`;
    tbody.appendChild(tr);
  });

  attachActionHandlers();
  attachViewHandlers();
  renderPaginationControls();
}

// ==============================
// ⏩ Pagination Buttons
// ==============================
function renderPaginationControls() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  if (totalPages <= 1) return;

  // Create main pagination wrapper
  const pagination = document.createElement("ul");
  pagination.className = "pagination justify-content-center mt-3";

  // Previous button
  const prevItem = document.createElement("li");
  prevItem.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  prevItem.innerHTML = `
    <button class="page-link custom-page" ${currentPage === 1 ? "disabled" : ""}>
      <i class="fas fa-chevron-left"></i>
    </button>`;
  prevItem.onclick = () => {
    if (currentPage > 1) renderPaginatedShipments(currentPage - 1);
  };
  pagination.appendChild(prevItem);

  // Page number buttons (show up to 3 pages)
  const startPage = Math.floor((currentPage - 1) / 3) * 3 + 1;
  const endPage = Math.min(startPage + 2, totalPages);
  for (let i = startPage; i <= endPage; i++) {
    const pageItem = document.createElement("li");
    pageItem.className = `page-item ${i === currentPage ? "active" : ""}`;
    pageItem.innerHTML = `
      <button class="page-link custom-page">${i}</button>`;
    pageItem.onclick = () => renderPaginatedShipments(i);
    pagination.appendChild(pageItem);
  }

  // Next button
  const nextItem = document.createElement("li");
  nextItem.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
  nextItem.innerHTML = `
    <button class="page-link custom-page" ${currentPage === totalPages ? "disabled" : ""}>
       <i class="fas fa-chevron-right"></i>
    </button>`;
  nextItem.onclick = () => {
    if (currentPage < totalPages) renderPaginatedShipments(currentPage + 1);
  };
  pagination.appendChild(nextItem);

  container.appendChild(pagination);
}



// ==============================
// 🚚 Populate Shipment Dropdown (Approved only)
// ==============================

console.log("📦 populateShipmentDropdown() triggered");
async function populateShipmentDropdown() {
  const dropdown = document.getElementById("gpsShipment");
  if (!dropdown) return;

  dropdown.innerHTML = `<option value="">Loading...</option>`;

  try {
    const res = await fetch(CONFIG.apiUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch shipments (${res.status})`);

    const shipments = await res.json();
    dropdown.innerHTML = `<option value="">Select Shipment...</option>`;

    // ✅ Only include Approved or Active shipments
    const filtered = shipments.filter(s => 
      ["approved", "shipping", "in transit"].includes((s.status || "").toLowerCase())
    );

    if (filtered.length === 0) {
      dropdown.innerHTML = `<option value="">No available shipments</option>`;
      return;
    }

    filtered.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.tracking_number || "Shipment #" + s.id} (${s.status})`;
      dropdown.appendChild(opt);
    });

    console.log("✅ GPS shipment dropdown populated:", filtered.length, "shipments");
  } catch (err) {
    console.error("❌ Failed to populate dropdown:", err);
    dropdown.innerHTML = `<option value="">Failed to load shipments</option>`;
  }
}



// ==============================
// 🚀 Start Live GPS Tracking
// ==============================
function startGpsTracking(shipmentId, map) {
  console.log(`▶️ Starting live GPS tracking for shipment ${shipmentId}`);
  state.activeShipmentId = shipmentId;

  // track
for (const id in mapMarkers) {
  if (String(id) !== String(shipmentId)) {
    map.removeLayer(mapMarkers[id]);
    delete mapMarkers[id];
  }
}
}


// ==============================
// INIT
// ==============================
function initApp() {
  fetchShipments();
  fetchNotifications();
  initWebSocket();
  setInterval(fetchNotifications, 30000);
}



document.addEventListener("DOMContentLoaded", initApp);

document.addEventListener("DOMContentLoaded", () => {
  initApp();

  // 🚀 Populate dropdown every time modal opens
  const addGpsModal = document.getElementById("addGpsModal");
  if (addGpsModal) {
    addGpsModal.addEventListener("show.bs.modal", populateShipmentDropdown);
  }
});


/* -------------------------------
Notifications
--------------------------------*/
const notifCountEl = document.getElementById("notifCount");

async function fetchNotifications() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    if (!notifCountEl) return;

    // ✅ Count only unread notifications
    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0";   // optional (can hide "0")
      notifCountEl.style.display = "none"; // completely hide badge if no unread
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

// keep checking
setInterval(fetchNotifications, 30000);