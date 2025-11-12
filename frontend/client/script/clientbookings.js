/* =================== CLIENT BOOKINGS =================== */
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "https://caiden-recondite-psychometrically.ngrok-free.dev";
  const tableBody = document.querySelector('[data-table="recentBookings"]');
  const pagination = document.getElementById("pagination");
  const searchInput = document.getElementById("bookingSearch");

  /* =================== LOAD PROFILE =================== */
  async function loadProfile() {
    try {
      const res = await fetch(`${API_BASE}/api/profile`, { method: "GET", credentials: "include" });
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
        profileIcon.src = `${API_BASE}/uploads/${data.photo}`;
        profileIcon.alt = "Profile";
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  }

  /* =================== LOAD NOTIFICATION COUNT =================== */
  async function loadNotificationCount() {
    try {
      const res = await fetch(`${API_BASE}/api/client/notifications`, { credentials: "include" });
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
      console.error("Error fetching notification count:", err);
    }
  }

  loadProfile();
  loadNotificationCount();
  setInterval(loadNotificationCount, 30000);

/* =================== Profile Dropdown =================== */
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

window.addEventListener("pageshow", () => {
  loadProfile();
});

  /* =================== BOOKINGS TABLE =================== */
  if (!tableBody) return;

  let allBookings = [];
  let filteredBookings = [];
  let currentPage = 1;
  const rowsPerPage = 10;

  loadClientBookings();

  async function loadClientBookings() {
    try {
      const res = await fetch(`${API_BASE}/api/client/dashboard`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      allBookings = data.bookings || [];
      filteredBookings = [...allBookings];
      renderTablePage();
      renderPagination();
    } catch (err) {
      console.error("Failed to load bookings:", err);
      renderNoData("Failed to fetch bookings.");
    }
  }

  function renderTablePage() {
    tableBody.innerHTML = "";

    if (filteredBookings.length === 0) {
      renderNoData("No bookings found.");
      pagination.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredBookings.slice(start, end);

    pageData.forEach(booking => {
      const status = booking.status?.toLowerCase() || "-";
      const isDeclined = status === "declined" || status === "decline";
      const badgeClass = getStatusBadge(status);
      const declineReason = isDeclined
        ? `<span class="text-danger small">${booking.decline_reason || "No reason provided"}</span>`
        : `<span class="text-muted small">—</span>`;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${booking.tracking_number || booking.id || "-"}</td>
        <td>${booking.route || `${booking.origin || "-"} → ${booking.destination || "-"}`}</td>
        <td>${booking.service_type || "-"}</td>
        <td><span class="badge ${badgeClass}">${booking.status || "-"}</span></td>
        <td>${booking.created_at ? new Date(booking.created_at).toLocaleDateString() : "-"}</td>
        <td>${declineReason}</td>
        <td>
          <div class="action-buttons">
            <button 
              class="edit-booking-btn" 
              data-id="${booking.id}">
              <i class="fas fa-edit"></i> Edit
            </button>
            ${
              !isDeclined
                ? `<button 
                    class="cancel-booking-btn" 
                    data-tracking="${booking.tracking_number}">
                    <i class="fas fa-times"></i> Cancel
                  </button>`
                : ""
            }
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

function renderPagination() {
  pagination.innerHTML = "";
  const totalPages = Math.ceil(filteredBookings.length / rowsPerPage);
  if (totalPages <= 1) return;

  const groupSize = 3; 
  const currentGroup = Math.floor((currentPage - 1) / groupSize);
  const startPage = currentGroup * groupSize + 1;
  const endPage = Math.min(startPage + groupSize - 1, totalPages);

  const makeLi = (html, extraClass, onClick) => {
    const li = document.createElement("li");
    li.className = `page-item ${extraClass}`;
    li.innerHTML = html;

    const a = li.querySelector("a");
    if (a) {
      a.addEventListener("click", e => {
        e.preventDefault();
        if (onClick) onClick();
      });
    }

    return li;
  };

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentGroup === 0 ? "disabled" : "",
      () => {
        if (currentGroup > 0) {
          currentPage = (currentGroup - 1) * groupSize + 1;
          renderTablePage();
          renderPagination();
        }
      }
    )
  );

  for (let i = startPage; i <= endPage; i++) {
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === currentPage ? "active" : "",
        () => {
          currentPage = i;
          renderTablePage();
          renderPagination();
        }
      )
    );
  }

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      endPage >= totalPages ? "disabled" : "",
      () => {
        if (endPage < totalPages) {
          currentPage = endPage + 1;
          renderTablePage();
          renderPagination();
        }
      }
    )
  );
}


  /* =================== SEARCH FILTER =================== */
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.toLowerCase();
      filteredBookings = !term
        ? [...allBookings]
        : allBookings.filter(b =>
            Object.values(b).some(v => String(v).toLowerCase().includes(term))
          );
      currentPage = 1;
      renderTablePage();
      renderPagination();
    });
  }

  /* =================== GLOBAL REFRESH =================== */
  window.refreshBookings = async () => loadClientBookings();
});

/* =================== HELPER FUNCTIONS =================== */
function getStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case "pending": return "bg-warning text-dark";
    case "approved": return "bg-success";
    case "declined": return "bg-danger";
    case "cancelled": return "bg-secondary";
    case "shipping": return "bg-info text-dark";
    default: return "bg-secondary";
  }
}

function renderNoData(message) {
  const tableBody = document.querySelector('[data-table="recentBookings"]');
  if (!tableBody) return;
  tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">${message}</td></tr>`;
}

function editBooking(id) {
  window.location.href = `./booking-edit.html?id=${id}`;
}

async function cancelBooking(trackingNumber) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;
  try {
    const res = await fetch(
      `https://caiden-recondite-psychometrically.ngrok-free.dev/api/bookings/${trackingNumber}/cancel`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Client cancelled via dashboard" }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to cancel booking");
    alert("Booking cancelled successfully!");
    if (typeof window.refreshBookings === "function") window.refreshBookings();
  } catch (err) {
    console.error("Cancel booking error:", err);
    alert("Failed to cancel booking.");
  }
}
