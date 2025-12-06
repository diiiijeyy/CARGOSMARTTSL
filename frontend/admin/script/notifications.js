// ===============================
// 🔧 Detect Base URL for API calls
// ===============================
function getApiBaseUrl() {
  const isLocal =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  
  return isLocal
    ? "http://localhost:5001" // local backend
    : "https://cargosmarttsl-1.onrender.com"; // deployed backend
}


// ⚙️ Set this true if page is for admin dashboard
const isAdmin = true;

// Build API URLs depending on role
const NOTIF_BASE = isAdmin ? "/api/admin/notifications" : "/api/notifications";

// ===============================
// 🎨 Notification Modal System
// ===============================
function ensureNotificationModal() {
  if (document.getElementById("notificationModal")) return;
  const modalHTML = `
    <div class="modal fade" id="notificationModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:520px;width:92%;">
        <div class="modal-content border-0 shadow-sm">
          <div class="modal-body p-3 rounded d-flex align-items-center gap-3" 
               id="notificationBody" style="background:#0077b6;color:#fff;">
            <i id="notificationIcon" class="fas fa-info-circle" style="font-size:22px;"></i>
            <div>
              <h6 class="mb-1 fw-bold" id="notificationTitle">Notification</h6>
              <div id="notificationMessage">Message here</div>
            </div>
            <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="modal"></button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

const NotificationTheme = {
  success: { accent: "#2fbf71", icon: "fas fa-check-circle", title: "Success" },
  warning: { accent: "#ffc107", icon: "fas fa-exclamation-triangle", title: "Warning" },
  error:   { accent: "#e63946", icon: "fas fa-times-circle", title: "Error" },
  info:    { accent: "#0d6efd", icon: "fas fa-info-circle", title: "Info" },
};

function showNotification({ variant = "info", title, message }) {
  ensureNotificationModal();
  const theme = NotificationTheme[variant] || NotificationTheme.info;

  const body = document.getElementById("notificationBody");
  const iconEl = document.getElementById("notificationIcon");
  const titleEl = document.getElementById("notificationTitle");
  const msgEl = document.getElementById("notificationMessage");

  body.style.background = theme.accent;
  iconEl.className = theme.icon;
  titleEl.textContent = title || theme.title;
  msgEl.innerHTML = message || "";

  const modal = new bootstrap.Modal(document.getElementById("notificationModal"));
  modal.show();

  setTimeout(() => {
    const inst = bootstrap.Modal.getInstance(document.getElementById("notificationModal"));
    if (inst) inst.hide();
  }, 2000);
}

// ===============================
// ⚙️ Global Notification State
// ===============================
let NOTIFS = [];
const $ = (sel) => document.querySelector(sel);

function unreadCount() {
  return NOTIFS.filter((n) => !n.is_read).length;
}
function updateBadge() {
  const badge = document.getElementById("notifCount");
  if (!badge) return;
  const count = unreadCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}
function setEmptyState(visible, text = "No notifications found.") {
  const emptyText = document.getElementById("noNotifications");
  if (!emptyText) return;
  emptyText.style.display = visible ? "block" : "none";
  emptyText.textContent = text;
}

// ===============================
// 🔔 Load Notifications
// ===============================
async function loadNotifications() {
  const container = document.getElementById("notificationList");
  if (!container) return;

  try {
    const res = await fetch(`${getApiBaseUrl()}${NOTIF_BASE}`, { credentials: "include" });
    if (res.status === 401) {
      container.innerHTML = `<div class="alert alert-warning">⚠️ Please log in to see notifications.</div>`;
      updateBadge();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    NOTIFS = await res.json();
    renderActiveTab();
  } catch (err) {
    console.error("❌ Error loading notifications:", err);
    container.innerHTML = `<div class="alert alert-danger">❌ Failed to load notifications. ${err.message}</div>`;
  }
}

// ===============================
// 🎨 Build Notification Item
// ===============================
function buildNotificationItem(notif) {
  const isUnread = !notif.is_read;
  const borderColor =
    notif.type === "shipment" ? "border-success" :
    notif.type === "invoice"  ? "border-primary" :
    notif.type === "system"   ? "border-warning" :
    notif.type === "booking"  ? "border-info" : "border-secondary";

  const div = document.createElement("div");
  div.className = `
    notification-item d-flex align-items-start mb-3 p-3 rounded border-start border-4 ${borderColor}
    ${isUnread ? "unread" : "read"}
  `.replace(/\s+/g, " ").trim();
  div.setAttribute("data-id", notif.id);

  div.innerHTML = `
    <i class="bi bi-info-circle-fill text-primary fs-4 me-3"></i>
    <div class="flex-grow-1">
      <div class="fw-bold text-capitalize">${notif.type || "Notice"}</div>
      <div class="text-muted">${notif.message}</div>
      <small class="text-secondary">${new Date(notif.created_at).toLocaleString()}</small>
    </div>
  `;

  div.addEventListener("click", () => markOneRead(notif.id, div));
  return div;
}

// ===============================
// 🎯 Render helpers
// ===============================
function renderListTo(containerId, mode = "all") {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  let list = [];
  if (mode === "unread") {
    list = NOTIFS.filter(n => !n.is_read);
  } else if (["invoice", "booking", "shipments"].includes(mode)) {
    list = NOTIFS.filter(n => (n.type || "").toLowerCase() === mode);
  } else {
    list = NOTIFS;
  }

  if (list.length === 0) {
    container.innerHTML = `<p class="text-muted small">No ${mode === "all" ? "notifications" : mode} found.</p>`;
  } else {
    list.forEach(n => container.appendChild(buildNotificationItem(n)));
  }

  if (mode === "all") {
    setEmptyState(list.length === 0, list.length === 0 ? "No notifications found." : "");
  } else {
    setEmptyState(false);
  }

  updateBadge();
}

function renderActiveTab() {
  const active = document.querySelector('#notifTabs .nav-link.active');
  const targetId = active?.getAttribute("href")?.replace("#", "") || "all";

  switch (targetId) {
    case "unread":
      renderListTo("unreadNotificationList", "unread");
      break;
    case "invoice":
      renderListTo("invoiceNotificationList", "invoice");
      break;
    case "booking":
      renderListTo("bookingNotificationList", "booking");
      break;
    case "shipments":
      renderListTo("shipmentNotificationList", "shipments");
      break;
    default:
      renderListTo("notificationList", "all");
  }
}

// ===============================
// ✅ Mark ONE as Read (fixed with live count update)
// ===============================
async function markOneRead(id, domNode) {
  const target = NOTIFS.find((n) => n.id === id);
  if (!target || target.is_read) return;

  // Mark locally as read
  target.is_read = true;
  domNode.classList.remove("unread");
  domNode.classList.add("read");
  domNode.style.transition = "background-color 0.3s ease, border-color 0.3s ease";
  domNode.style.backgroundColor = "#f1f3f5";
  domNode.style.borderLeft = "6px solid #b0b0b0";

  // Immediately update badge count
  updateBadge();

  // If in unread tab, remove it from that list instantly
  const active = document.querySelector('#notifTabs .nav-link.active');
  const activeId = active?.getAttribute("href")?.replace("#", "");
  if (activeId === "unread" && domNode.parentElement) {
    const parent = domNode.parentElement;
    domNode.remove();
    if (parent.children.length === 0) {
      parent.innerHTML = `<p class="text-muted small">No unread notifications.</p>`;
    }
  }

  // API call
  const markReadUrl = isAdmin
    ? `${getApiBaseUrl()}${NOTIF_BASE}/mark-read/${id}`
    : `${getApiBaseUrl()}${NOTIF_BASE}/${id}/read`;

  try {
    const res = await fetch(markReadUrl, { method: "PUT", credentials: "include" });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
  } catch (err) {
    console.error("❌ Error marking notification read:", err);
    // rollback on failure
    target.is_read = false;
    renderActiveTab();
  }
}

// ===============================
// ✅ Mark ALL as Read
// ===============================
document.getElementById("markAllRead")?.addEventListener("click", async () => {
  try {
    const markAllUrl = `${getApiBaseUrl()}${NOTIF_BASE}/mark-all-read`;
    NOTIFS = NOTIFS.map((n) => ({ ...n, is_read: true }));
    renderActiveTab();
    updateBadge();
    const res = await fetch(markAllUrl, { method: "PUT", credentials: "include" });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
  } catch (err) {
    console.error("❌ Error marking all as read:", err);
    loadNotifications();
  }
});

// ===============================
// 🧩 Bootstrap Tab Switching
// ===============================
document.querySelectorAll('#notifTabs a[data-bs-toggle="pill"]').forEach((tab) => {
  tab.addEventListener("shown.bs.tab", () => {
    renderActiveTab();
  });
});

// ===============================
// 🚀 Auto-load + Polling
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  loadNotifications();
  setInterval(loadNotifications, 30000); // refresh every 30s
});
