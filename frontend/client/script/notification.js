// ===============================
// Detect base URL for API calls
// ===============================
const getApiBaseUrl = () => {
  const isLocal =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return isLocal
    ? "http://localhost:5001"
    : "https://caiden-recondite-psychometrically.ngrok-free.dev";
};

// ===============================
// 🟢 LOAD PROFILE (Username + Profile Photo)
// ===============================
async function loadProfile() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/profile`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();

    // ✅ Update Username
    const usernameEl = document.getElementById("username");
    if (usernameEl) usernameEl.textContent = data.contact_person || "Client";

    // ✅ Update Profile Icon
    let profileIcon = document.getElementById("profileIcon");
    const photoUrl = data.photo
      ? `${getApiBaseUrl()}/uploads/${data.photo}`
      : "../../assets/img/default-profile.png";

    if (profileIcon) {
      if (profileIcon.tagName.toLowerCase() !== "img") {
        const img = document.createElement("img");
        img.id = "profileIcon";
        img.className = "profile-icon rounded-circle position-relative";
        img.style.width = "40px";
        img.style.height = "40px";
        img.style.objectFit = "cover";
        img.style.cursor = "pointer";
        profileIcon.replaceWith(img);
        profileIcon = img;
      }
      profileIcon.src = photoUrl;
      profileIcon.alt = "Profile";
    }
  } catch (err) {
    console.error("❌ Error loading profile:", err);
  }
}

// ===============================
// 🔔 LOAD NOTIFICATIONS
// ===============================
async function loadNotifications() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/client/notifications`, {
      credentials: "include",
    });

    if (!res.ok) throw new Error(`Failed to fetch notifications (${res.status})`);

    const notifications = await res.json();
    console.log("📦 Notifications fetched:", notifications);

    if (!Array.isArray(notifications)) {
      console.error("❌ Invalid response format:", notifications);
      return;
    }

    // 🔢 Update badge
    const notifCountEl = document.getElementById("notifCount");
    if (notifCountEl) {
      const unread = notifications.filter((n) => !n.is_read).length;
      console.log(`📬 Unread count: ${unread}`);
      notifCountEl.textContent = unread > 0 ? unread : "";
      notifCountEl.style.display = unread > 0 ? "inline-block" : "none";
    }

// 🧩 Render per tab
renderNotifications(notifications, "all"); // all notifications
renderNotifications(notifications.filter((n) => !n.is_read), "unread"); // unread only
renderNotifications(notifications.filter((n) => n.type === "system"), "system"); // system
renderNotifications(
  notifications.filter((n) => n.type === "shipment" || n.type === "booking"),
  "shipment"
); // shipments & bookings
renderNotifications(notifications.filter((n) => n.type === "invoice"), "invoice"); // invoices only

  } catch (err) {
    console.error("Error loading notifications:", err);
    document.querySelectorAll(".notifications-container").forEach((c) => {
      c.innerHTML = `<p class="text-danger small">Failed to load notifications.</p>`;
    });
  }
}

// ===============================
// 🧱 RENDER NOTIFICATIONS (Clickable cards)
// ===============================
function renderNotifications(list, filter) {
  const container = document.querySelector(
    `.notifications-container[data-filter="${filter}"]`
  );
  if (!container) return;

  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = `<p class="text-muted small">No ${filter} notifications</p>`;
    return;
  }

  list.forEach((n) => {
    const item = document.createElement("div");
    item.className = `notification-item p-3 mb-2 border rounded shadow-sm transition-all`;
    item.style.backgroundColor = n.is_read ? "#f8f9fa" : "#ffffff"; // 🔹 white if unread
    item.style.cursor = "pointer";
    item.dataset.id = n.id;

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <strong>${n.title}</strong><br>
          ${n.message}
          <br><small class="text-muted">${new Date(
            n.created_at
          ).toLocaleString()}</small>
        </div>
        ${!n.is_read ? `<span class="badge bg-primary ms-2">New</span>` : ""}
      </div>
    `;

    // 🔹 When clicked → mark as read + change color instantly
    item.addEventListener("click", async () => {
      if (!n.is_read) {
        await markAsRead(n.id);
        item.style.backgroundColor = "#f8f9fa"; // turn light gray
        item.querySelector(".badge")?.remove();
        n.is_read = true;
        loadNotifications(); // refresh counts + other tabs
      }
    });

    container.appendChild(item);
  });
}
// ===============================
// ✅ MARK AS READ (API)
// ===============================
async function markAsRead(id) {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/client/notifications/${id}/read`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to mark as read");
  } catch (err) {
    console.error("Error marking notification as read:", err);
  }
}

// ===============================
// ✅ MARK ALL AS READ
// ===============================
async function markAllAsRead() {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/client/notifications`, {
      credentials: "include",
    });
    const notifications = await res.json();
    await Promise.all(
      notifications
        .filter((n) => !n.is_read)
        .map((n) =>
          fetch(`${getApiBaseUrl()}/api/client/notifications/${n.id}/read`, {
            method: "PUT",
            credentials: "include",
          })
        )
    );
    loadNotifications();
  } catch (err) {
    console.error("Error marking all read:", err);
  }
}

// ===============================
// 🧭 UI INTERACTIONS
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // 🗓️ Display current date
  const currentDateElement = document.getElementById("current-date");
  if (currentDateElement) {
    const now = new Date();
    currentDateElement.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  // 🍔 Hamburger menu toggle
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  const nav = document.querySelector("nav");
  if (hamburgerMenu && nav) {
    hamburgerMenu.addEventListener("click", () => nav.classList.toggle("active"));
    document.addEventListener("click", (e) => {
      if (!nav.contains(e.target) && !hamburgerMenu.contains(e.target)) {
        nav.classList.remove("active");
      }
    });
  }

  // ⏳ Preloader
  const preloader = document.getElementById("preloader");
  if (preloader) {
    window.addEventListener("load", () => {
      preloader.style.opacity = "0";
      preloader.style.visibility = "hidden";
      setTimeout(() => preloader.remove(), 600);
    });
  }

  // ✅ Mark all read button
  const markAllBtn = document.getElementById("markAllRead");
  if (markAllBtn) markAllBtn.addEventListener("click", markAllAsRead);

  // 🚀 Initial load
  loadProfile();
  loadNotifications();

  setInterval(loadNotifications, 30000);
});

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
