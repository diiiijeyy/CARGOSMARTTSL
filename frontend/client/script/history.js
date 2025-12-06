let shipmentData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 5;

document.addEventListener("DOMContentLoaded", () => {
  updateCurrentDate();
  fetchShipmentHistory();
  setupEventListeners();
});

// ====== Render Table ======
function renderTable() {
  const tbody = document.getElementById("shipmentTableBody");
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  tbody.innerHTML = "";

  if (paginatedData.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="8" class="text-center py-4 text-muted">
        No shipments found matching your criteria.
      </td>
    </tr>`;
    updatePaginationInfo();
    updatePaginationButtons();
    return;
  }

  paginatedData.forEach((shipment) => {
    const row = document.createElement("tr");
    row.innerHTML = `
  <td class="fw-medium">${shipment.id || ""}</td>
  <td>${shipment.service}</td> 
  <td>${getStatusBadge(shipment.status)}</td>
<td class="text-danger">
  ${
    ["declined", "cancelled by client", "cancel by client"].includes(
      shipment.status?.toLowerCase()
    )
      ? shipment.reason || ""
      : ""
  }
</td>

  <td class="text-muted">${shipment.origin}</td>
  <td class="text-muted">${shipment.destination}</td>
  <td class="text-muted">${new Date(shipment.date).toLocaleDateString()}</td>
  <td class="font-monospace small">
  ${shipment.tracking ? shipment.tracking : ""}
</td>

  <td>
    <button class="btn btn-sm btn-primary view-btn" data-id="${shipment.id}">
      <i class="fas fa-eye"></i>
    </button>
  </td>
`;
    tbody.appendChild(row);
  });

  setupViewButtons();
  updatePaginationInfo();
  updatePaginationButtons();
}

// ====== Pagination Buttons ======
function updatePaginationButtons() {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageButtonsContainer = document.querySelector(
    ".pagination-wrapper .d-flex"
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;

  // Remove old page number buttons
  pageButtonsContainer
    .querySelectorAll(".page-btn")
    .forEach((btn) => btn.remove());

  // Generate page number buttons
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className =
      "btn btn-sm page-btn " +
      (i === currentPage ? "btn-primary" : "btn-light");
    btn.addEventListener("click", () => {
      currentPage = i;
      renderTable();
    });
    nextBtn.before(btn);
  }
}

// ====== Pagination Next/Previous ======
document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

document.getElementById("nextBtn").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
});

// ====== UI Helpers ======
function updateCurrentDate() {
  const currentDateElement = document.getElementById("current-date");
  const now = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  currentDateElement.textContent = now.toLocaleDateString("en-US", options);
}

function getServiceIcon(service) {
  const icons = {
    Air: '<i class="fas fa-plane me-2"></i>',
    Sea: '<i class="fas fa-ship me-2"></i>',
    Land: '<i class="fas fa-truck me-2"></i>',
  };
  return icons[service] || '<i class="fas fa-truck me-2"></i>';
}

function getStatusBadge(status) {
  if (!status) return `<span class="badge bg-secondary">${status}</span>`;

  const normalized = status.toString().trim().toLowerCase();

  switch (normalized) {
    case "pending":
      return `<span class="badge bg-pending">${status}</span>`;
    case "approved":
      return `<span class="badge bg-approved">${status}</span>`;
    case "decline":
    case "declined":
      return `<span class="badge bg-declined">${status}</span>`;
    case "completed":
      return `<span class="badge bg-completed">${status}</span>`;
    case "shipping":
      return `<span class="badge bg-shipping">${status}</span>`;
    case "in transit":
      return `<span class="badge bg-intransit">${status}</span>`;
    case "delivered":
      return `<span class="badge bg-delivered">${status}</span>`;
    case "cancel by client":
    case "cancelled by client":
      return `<span class="badge bg-declined">${status}</span>`;

    default:
      return `<span class="badge bg-secondary">${status}</span>`;
  }
}

// ====== Pagination Info ======
function updatePaginationInfo() {
  const startIndex = filteredData.length
    ? (currentPage - 1) * itemsPerPage + 1
    : 0;
  const endIndex = Math.min(currentPage * itemsPerPage, filteredData.length);
  const total = filteredData.length;
  document.getElementById(
    "paginationInfo"
  ).textContent = `Showing ${startIndex} to ${endIndex} of ${total} results`;
  document.getElementById(
    "shipmentCount"
  ).textContent = `${total} total shipments`;
}

// ===================== FILTER BUTTON POPOVER ===================== //
const filterBtn = document.getElementById("invoiceFilterBtn");
const filterPopover = document.getElementById("filterPopover");
const applyBtn = document.getElementById("applyFilterBtn");
const resetBtn = document.getElementById("resetFilterBtn");

filterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const rect = filterBtn.getBoundingClientRect();

  // Position BELOW and slightly right of button, fixed position so it doesn't move when scrolling
  filterPopover.style.top = `${rect.bottom + 10}px`;
  filterPopover.style.left = `${rect.left + 20}px`;
  filterPopover.style.display =
    filterPopover.style.display === "block" ? "none" : "block";
});

applyBtn.addEventListener("click", () => {
  filterData();
  filterPopover.style.display = "none";
});

resetBtn.addEventListener("click", () => {
  document.getElementById("serviceFilter").value = "all";
  document.getElementById("statusFilter").value = "all";
  filteredData = [...shipmentData];
  currentPage = 1;
  renderTable();
  filterPopover.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!filterPopover.contains(e.target) && !filterBtn.contains(e.target)) {
    filterPopover.style.display = "none";
  }
});

function filterData() {
  const searchTerm = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();
  const serviceFilter = (
    document.getElementById("serviceFilter")?.value || "all"
  ).toLowerCase();
  const statusFilter = (
    document.getElementById("statusFilter")?.value || "all"
  ).toLowerCase();

  filteredData = shipmentData.filter((item) => {
    const id = (item.id || "").toLowerCase();
    const origin = (item.origin || "").toLowerCase();
    const destination = (item.destination || "").toLowerCase();
    const tracking = (item.tracking || "").toLowerCase();
    const service = (item.service || "").toLowerCase();
    const status = (item.status || "").toLowerCase();

    const matchesSearch =
      !searchTerm ||
      id.includes(searchTerm) ||
      origin.includes(searchTerm) ||
      destination.includes(searchTerm) ||
      tracking.includes(searchTerm) ||
      service.includes(searchTerm);

    const matchesService = serviceFilter === "all" || service === serviceFilter;

    const matchesStatus = statusFilter === "all" || status === statusFilter;

    return matchesSearch && matchesService && matchesStatus;
  });

  currentPage = 1;
  renderTable();
}

// ====== Export CSV (Respects Current Filter) ======
function exportShipments() {
  // Use filteredData if available; otherwise, export all shipmentData
  const exportData = filteredData.length > 0 ? filteredData : shipmentData;

  if (!exportData.length) {
    alert("No data available to export.");
    return;
  }

  // Prepare CSV headers and rows
  const headers = [
    "Shipment ID",
    "Service",
    "Status",
    "Origin",
    "Destination",
    "Date",
    "Tracking",
  ];

  const csvRows = [
    headers.join(","),
    ...exportData.map((item) =>
      [
        `"${item.id}"`,
        `"${item.service}"`,
        `"${item.status}"`,
        `"${item.origin}"`,
        `"${item.destination}"`,
        `"${new Date(item.date).toLocaleDateString()}"`,
        `"${item.tracking}"`,
      ].join(",")
    ),
  ];

  // Create and download CSV file
  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shipment-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ====== View Button Event ======
function setupViewButtons() {
  const viewButtons = document.querySelectorAll(".view-btn");
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const shipmentId = btn.getAttribute("data-id");
      const shipment = shipmentData.find((s) => s.id === shipmentId);
      if (!shipment) return;

      const detailsBody = document.getElementById("shipmentDetailsBody");
      detailsBody.innerHTML = `
  ${createDetail("Shipment ID", shipment.id)}
  ${createDetail("Service", shipment.service)}
  ${createDetail("Status", getStatusBadge(shipment.status))}

  ${
    ["declined", "cancel by client", "cancelled by client"].includes(
      shipment.status?.toLowerCase()
    )
      ? createDetail(
          "Reason",
          `<span class="text-danger">${shipment.reason || "-"}</span>`
        )
      : ""
  }

  ${createDetail("Origin", shipment.origin)}
  ${createDetail("Destination", shipment.destination)}
  ${createDetail("Date", new Date(shipment.date).toLocaleString())}
  ${createDetail("Tracking Number", shipment.tracking || "")}

  ${createDetail("Delivery Type", shipment.delivery_type || "-")}
  ${createDetail("Shipment Type", shipment.shipment_type || "-")}
  ${createDetail("Delivery Mode", shipment.delivery_mode || "-")}

  ${createDetail(
    "Gross Weight",
    `${shipment.gross_weight || "-"} ${shipment.gross_weight_unit || ""}`
  )}

  ${createDetail(
    "Net Weight",
    `${shipment.net_weight || "-"} ${shipment.net_weight_unit || ""}`
  )}

  ${createDetail("Number of Packages", shipment.num_packages || "-")}
  ${createDetail("Packing List", shipment.packing_list || "-")}
  ${createDetail("Commercial Invoice", shipment.commercial_invoice || "-")}
`;

      const modalEl = document.getElementById("shipmentModal");

      // Set modal title
      document.getElementById("shipmentModalLabel").textContent =
        "Shipment ID: " + shipment.id;

      // Initialize modal
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    });
  });
}

// helper function
function createDetail(label, value) {
  const safeValue = value === null || value === undefined ? "" : value;
  return `
    <div class="col-md-6 detail-item">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${safeValue}</div>
    </div>
  `;
}

// ====== Event Listeners ======
function setupEventListeners() {
  document.getElementById("searchInput").addEventListener("input", filterData);
  document
    .getElementById("serviceFilter")
    .addEventListener("change", filterData);
  document
    .getElementById("statusFilter")
    .addEventListener("change", filterData);

  const hamburgerMenu = document.getElementById("hamburgerMenu");
  const nav = document.querySelector("nav");
  hamburgerMenu.addEventListener("click", () => nav.classList.toggle("active"));

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !hamburgerMenu.contains(e.target))
      nav.classList.remove("active");
  });

  // ===================== Profile Dropdown ===================== //
  document.addEventListener("click", (e) => {
    const icon = document.getElementById("profileIcon");
    const dropdown = document.getElementById("profileDropdown");
    if (!icon || !dropdown) return;

    if (icon.contains(e.target)) {
      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
      dropdown.style.position = "absolute";
      dropdown.style.right = "0";
      dropdown.style.top = "45px";
      dropdown.style.zIndex = "1060";
    } else if (!dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // ===================== Reload Profile on Page Return ===================== //
  window.addEventListener("pageshow", () => {
    loadProfile();
    loadNotificationCount();
  });

  // ===================== Load Profile ===================== //
  async function loadProfile() {
    try {
      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/profile",
        {
          method: "GET",
          credentials: "include",
        }
      );
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
        profileIcon.src = `https://cargosmarttsl-1.onrender.com/uploads/${data.photo}`;
        profileIcon.alt = "Profile";
      }
    } catch (err) {
      console.error("❌ Error loading profile:", err);
    }
  }

  const filterBtn = document.getElementById("filterBtn");
  const filterPopover = document.getElementById("filterPopover");
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    filterPopover.style.display =
      filterPopover.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!profileIcon.contains(e.target) && !profileDropdown.contains(e.target))
      profileDropdown.style.display = "none";
    if (!filterBtn.contains(e.target) && !filterPopover.contains(e.target))
      filterPopover.style.display = "none";
  });
}

// ✅ Ensure Export Button Works After Page Loads
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportShipments);
  }
});

// ===============================
// 🔔 LOAD NOTIFICATION COUNT (Dashboard Badge Only)
// ===============================
async function loadNotificationCount() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/client/notifications",
      {
        credentials: "include",
      }
    );

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
    console.error("❌ Error fetching notification count:", err);
  }
}

setInterval(loadNotificationCount, 30000);

// ====== Preloader ======
window.addEventListener("load", function () {
  const preloader = document.getElementById("preloader");
  preloader.style.opacity = "0";
  preloader.style.visibility = "hidden";
  setTimeout(() => preloader.remove(), 600);
});

// ====== Fetch shipment history from backend ======
async function fetchShipmentHistory() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/bookings/history",
      {
        credentials: "include",
      }
    );

    if (!res.ok) throw new Error("Failed to fetch shipment history");

    const data = await res.json();
    shipmentData = data.bookings.map((item) => ({
      id: item.tracking_number || "",
      service: item.service_type,
      status: item.status,
      origin: item.port_origin,
      destination: item.port_delivery,
      date: item.created_at,
      tracking: item.tracking_number || "",
      delivery_type: item.delivery_type,
      shipment_type: item.shipment_type,
      delivery_mode: item.delivery_mode,
      gross_weight: item.gross_weight,
      gross_weight_unit: item.gross_weight_unit,
      net_weight: item.net_weight,
      net_weight_unit: item.net_weight_unit,
      num_packages: item.num_packages,
      packing_list: item.packing_list,
      commercial_invoice: item.commercial_invoice,
      reason: item.decline_reason || item.cancel_reason || "",
    }));

    filteredData = [...shipmentData];
    renderTable();
  } catch (err) {
    console.error("Error loading shipment history:", err);
    const tbody = document.getElementById("shipmentTableBody");
    tbody.innerHTML = `<tr>
      <td colspan="8" class="text-center py-4 text-danger">
        Failed to load shipment history.
      </td>
    </tr>`;
  }
}
