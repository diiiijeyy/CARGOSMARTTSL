// ==============================
// Bookings Admin JS (Unified Confirm + Notification Theming)
// ==============================

let allBookings = [];
let currentPage = 1;
const rowsPerPage = 10;
const REFRESH_DELAY_MS = 5000;

/* -------------------------------
  Update Summary Cards
--------------------------------*/
let hasAnimatedSummary = false;

function updateSummaryCards(data) {
  const total = data.length;
  const confirmed = data.filter(b => (b.status || "").toLowerCase() === "approved").length;
  const pending = data.filter(b => (b.status || "").toLowerCase() === "pending").length;
  const completed = data.filter(b => (b.status || "").toLowerCase() === "completed").length;

  const el = (id) => document.getElementById(id);

  if (el("totalBookings")) {
    !hasAnimatedSummary ? animateValue(el("totalBookings"), 0, total, 1000) : el("totalBookings").textContent = total;
  }
  if (el("confirmedBookings")) {
    !hasAnimatedSummary ? animateValue(el("confirmedBookings"), 0, confirmed, 1000) : el("confirmedBookings").textContent = confirmed;
  }
  if (el("pendingBookings")) {
    !hasAnimatedSummary ? animateValue(el("pendingBookings"), 0, pending, 1000) : el("pendingBookings").textContent = pending;
  }
  if (el("completedBookings")) {
    !hasAnimatedSummary ? animateValue(el("completedBookings"), 0, completed, 1000) : el("completedBookings").textContent = completed;
  }

  hasAnimatedSummary = true;
}

/* -------------------------------
  Status Color Helper
--------------------------------*/
function getStatusClass(status) {
  switch ((status || "").toLowerCase()) {
    case "pending":   return "text-warning fw-bold";
    case "approved":  return "text-primary fw-bold";
    case "declined":  return "text-danger fw-bold";
    case "completed": return "text-success fw-bold";
    default:          return "text-muted";
  }
}

/* -------------------------------
  Render Bookings (with filter + search + pagination)
--------------------------------*/
function renderBookings() {
  const tableBody = document.getElementById("bookingsBody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  let filtered = [...allBookings];

  // Status filter
  const filterBtn = document.getElementById("bookingFilterBtn");
  if (filterBtn && filterBtn.dataset.value && filterBtn.dataset.value.toLowerCase() !== "all") {
    const currentFilter = filterBtn.dataset.value.toLowerCase();
    filtered = filtered.filter(b => (b.status || "").toLowerCase() === currentFilter);
  }

  // Search filter
  const searchInput = document.getElementById("bookingSearch");
  if (searchInput && searchInput.value.trim() !== "") {
    const query = searchInput.value.toLowerCase();
    filtered = filtered.filter(b =>
      (b.client_name || "").toLowerCase().includes(query) ||
      (b.service_type || "").toLowerCase().includes(query) ||
      ((b.mode || b.delivery_mode || "") + "").toLowerCase().includes(query) ||
      (b.status || "").toLowerCase().includes(query) ||
      (b.created_at ? new Date(b.created_at).toLocaleString().toLowerCase().includes(query) : false)
    );
  }

  // Sort order
  filtered.sort((a, b) => {
    const statusOrder = { pending: 0, approved: 1, completed: 2, declined: 3 };
    const sa = statusOrder[a.status?.toLowerCase()] ?? 99;
    const sb = statusOrder[b.status?.toLowerCase()] ?? 99;
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const paginated = filtered.slice(start, end);

  // Render rows
  if (paginated.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No bookings found</td></tr>`;
  } else {
    paginated.forEach((booking) => {
      const status = (booking.status || "").toLowerCase();
      const hasExpected = Boolean(booking.expected_delivery_date);

      const expectedCell = hasExpected
        ? new Date(booking.expected_delivery_date).toLocaleDateString()
        : (status === "approved"
            ? `<button class="btn btn-sm btn-outline-primary" onclick="openExpectedDeliveryModal(${booking.id})">Set Date</button>`
            : `<button class="btn btn-sm btn-outline-secondary"
                 onclick="alertApproveFirst()"
                 title="Approve the booking first">Set Date</button>`);

      const optionsHtml = getStatusOptions(status, hasExpected);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${booking.id}</td>
        <td>${booking.client_name || "-"}</td>
        <td>${booking.service_type || "-"}</td>
        <td>${booking.mode || booking.delivery_mode || "-"}</td>
        <td>
          <span class="d-block mb-1 text-capitalize ${getStatusClass(booking.status)}">${booking.status || "-"}</span>
          <select class="no-arrow"
                  data-current-status="${booking.status || ""}"
                  onchange="handleStatusChange(this, ${booking.id})"
                  ${status === "completed" || status === "declined" ? "disabled" : ""}>
            ${optionsHtml}
          </select>
        </td>
        <td>${booking.created_at ? new Date(booking.created_at).toLocaleString() : "-"}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary" onclick="showBookingDetailsById(${booking.id})" title="View Booking Details">
            <i class="fas fa-eye"></i>
          </button>
        </td>
        <td>${expectedCell}</td>
      `;
      tableBody.appendChild(row);
    });
  }

  renderPagination(totalPages);
}

/* -------------------------------
  Status Options Logic
--------------------------------*/
function getStatusOptions(status) {
  let options = `<option selected hidden>Update</option>`;
  status = (status || "").toLowerCase();

  if (status === "pending") {
    options += `
      <option value="Approved">Approve</option>
      <option value="Declined">Decline</option>
    `;
  } else if (status === "approved") {
    options += `<option value="Completed">Completed</option>`;
  } else if (status === "completed") {
    options += `<option disabled>Completed</option>`;
  } else if (status === "declined") {
    options += `<option disabled>Declined</option>`;
  }

  return options;
}

/* -------------------------------
  Render Pagination
--------------------------------*/
function renderPagination(totalPages) {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;
  pagination.innerHTML = "";
  if (totalPages <= 1) return;

  const makeLi = (html, className = "", onClick = null) => {
    const li = document.createElement("li");
    li.className = `page-item ${className}`;
    li.innerHTML = html;
    if (onClick) {
      li.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
    }
    return li;
  };

  // Prev
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentPage === 1 ? "disabled" : "",
      () => { if (currentPage > 1) { currentPage--; renderBookings(); } }
    )
  );

  // Numbers
  for (let i = 1; i <= totalPages; i++) {
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === currentPage ? "active" : "",
        () => { currentPage = i; renderBookings(); }
      )
    );
  }

  // Next
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      currentPage === totalPages ? "disabled" : "",
      () => { if (currentPage < totalPages) { currentPage++; renderBookings(); } }
    )
  );
}

/* -------------------------------
  FILTER + SEARCH
--------------------------------*/
function applyCurrentFilterAndSearch() {
  currentPage = 1;
  renderBookings();
}

/* -------------------------------
  EXPECTED DELIVERY MODAL
--------------------------------*/
function ensureExpectedDeliveryModal() {
  if (document.getElementById("expectedDeliveryModal")) return;
  const modalHTML = `
    <div class="modal fade" id="expectedDeliveryModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:400px;">
        <div class="modal-content">
          <div class="modal-header" style="background:#0077b6;color:#fff;">
            <h5 class="modal-title">Set Expected Delivery</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="date" id="expectedDeliveryInput" class="form-control">
            <input type="hidden" id="expectedDeliveryBookingId">
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" onclick="saveExpectedDelivery()">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function openExpectedDeliveryModal(bookingId) {
  ensureExpectedDeliveryModal();
  document.getElementById("expectedDeliveryBookingId").value = bookingId;
  document.getElementById("expectedDeliveryInput").value = "";
  new bootstrap.Modal(document.getElementById("expectedDeliveryModal")).show();
}

async function saveExpectedDelivery() {
  const bookingId = document.getElementById("expectedDeliveryBookingId").value;
  const expectedDate = document.getElementById("expectedDeliveryInput").value;
  if (!expectedDate) {
    return showNotification({ variant: "warning", title: "Missing Date", message: "Please select a date." });
  }
  try {
    const res = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/expected-delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_delivery: expectedDate })
    });
    if (res.ok) {
      showNotification({ variant: "setdate", title: "Expected Date Saved", message: "Expected delivery updated." });
      setTimeout(() => location.reload(), 1000);
    } else {
      const errMsg = await res.text();
      showNotification({ variant: "error", title: "Update Failed", message: "Failed to update: " + errMsg });
    }
  } catch (err) {
    console.error("Error updating expected delivery:", err);
    showNotification({ variant: "error", title: "Update Failed", message: "Error updating expected delivery." });
  }
}

/* -------------------------------
  BOOKING DETAILS MODAL
--------------------------------*/
function ensureBookingModal() {
  if (document.getElementById("bookingDetailsModal")) return;
  const modalHTML = `
    <div class="modal fade" id="bookingDetailsModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:95vw; width:95vw; margin:2rem auto;">
        <div class="modal-content">
          <div class="modal-header" style="background:#0077b6;color:#fff;">
            <h5 class="modal-title">Booking Details</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="bookingDetailsForm" class="row">
              <div id="bookingDetailsBody" class="row"></div>
              <div class="col-12 mt-3">
                <label class="form-label fw-bold">Update Status</label>
                <select class="form-select" id="bookingStatusSelect">
                  <option value="Approved">Approved</option>
                  <option value="Declined">Declined</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" id="updateBookingBtn" class="btn btn-primary">Update Booking</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showBookingDetailsById(id) {
  const booking = allBookings.find(b => b.id === id);
  if (booking) showBookingDetails(booking);
}

function showBookingDetails(booking) {
  ensureBookingModal();
  const modalEl = document.getElementById("bookingDetailsModal");
  modalEl.dataset.bookingId = booking.id;
  const detailsBody = document.getElementById("bookingDetailsBody");
  detailsBody.innerHTML = `
    ${renderField("Tracking Number", booking.tracking_number || booking.id)}
    ${renderField("Client Name", booking.client_name || "-")}
    ${renderField("Service Type", booking.service_type || "-")}
    ${renderField("Delivery Mode", booking.mode || booking.delivery_mode || "-")}
    ${renderField("Created At", booking.created_at ? new Date(booking.created_at).toLocaleString() : "-")}
    ${renderField("Origin", booking.origin || "-")}
    ${renderField("Destination", booking.destination || "-")}
    ${renderField("Packing List", booking.packing_list ? `<a href="${booking.packing_list}" target="_blank">View File</a>` : "-")}
    ${renderField("Commercial Invoice", booking.commercial_invoice ? `<a href="${booking.commercial_invoice}" target="_blank">View File</a>` : "-")}
    ${renderField("Gross Weight", booking.gross_weight ? booking.gross_weight + " " + (booking.gross_weight_unit || "") : "-")}
    ${renderField("Net Weight", booking.net_weight ? booking.net_weight + " " + (booking.net_weight_unit || "") : "-")}
    ${renderField("Number of Packages", booking.num_packages || "-")}
    ${renderField("Consignee", booking.consignee || "-")}
    ${renderFullWidthField("Remarks", booking.remarks || "-")}
    ${renderField("Status", `<span class="${getStatusClass(booking.status)}">${booking.status || "-"}</span>`)}
  `;
const statusSelect = document.getElementById("bookingStatusSelect");
statusSelect.value = booking.status || "Approved";

const updateBtn = document.getElementById("updateBookingBtn");
updateBtn.onclick = () => {
  const newStatus = statusSelect.value;

  // ✅ Require a different status before updating
  if (!newStatus || newStatus === booking.status) {
    showNotification({
      variant: "warning",
      title: "Update Required",
      message: "Please select a new status before updating this booking."
    });
    return;
  }

  updateStatus(booking.id, newStatus);
  bootstrap.Modal.getInstance(modalEl).hide();
};

  new bootstrap.Modal(modalEl).show();
}

function renderField(label, value) {
  return `
    <div class="col-lg-3 col-md-4 col-sm-6">
      <label class="form-label fw-bold">${label}</label>
      <div class="form-control bg-light">${value}</div>
    </div>
  `;
}

function renderFullWidthField(label, value) {
  return `
    <div class="col-12">
      <label class="form-label fw-bold">${label}</label>
      <div class="form-control bg-light">${value}</div>
    </div>
  `;
}


/* -------------------------------
  NOTIFICATION MODAL
--------------------------------*/
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
  approve : { accent: "#0077b6", icon: "fas fa-check-circle",  title: "Approved" },
  complete: { accent: "#2fbf71", icon: "fas fa-check-double", title: "Completed" },
  decline : { accent: "#e63946", icon: "fas fa-times-circle",  title: "Declined" },
  setdate : { accent: "#0077b6", icon: "far fa-calendar-check", title: "Set Expected Date" },
  success : { accent: "#2fbf71", icon: "fas fa-check-circle",  title: "Success" },
  warning : { accent: "#ffc107", icon: "fas fa-exclamation-triangle", title: "Warning" },
  error   : { accent: "#e63946", icon: "fas fa-times-circle",  title: "Error" },
  info    : { accent: "#0d6efd", icon: "fas fa-info-circle",  title: "Info" }
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
  body.style.color = "#fff";
  iconEl.className = theme.icon;
  titleEl.textContent = title || theme.title;
  msgEl.innerHTML = message || "";

  const modal = new bootstrap.Modal(document.getElementById("notificationModal"));
  modal.show();

  setTimeout(() => {
    const inst = bootstrap.Modal.getInstance(document.getElementById("notificationModal"));
    if (inst) inst.hide();
  }, 1600);
}

/* -------------------------------
  API FUNCTIONS
--------------------------------*/
async function fetchBookings() {
  try {
    const res = await fetch("http://localhost:5001/api/admin/bookings");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    allBookings = await res.json();
    updateSummaryCards(allBookings);
    renderBookings();
  } catch (error) {
    console.error("Failed to load bookings:", error);
  }
}

async function updateStatus(bookingId, newStatus) {
  try {
    const res = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const statusLower = (newStatus || "").toLowerCase();
      const variant =
        statusLower === "approved"  ? "approve"  :
        statusLower === "completed" ? "complete" :
        statusLower === "declined"  ? "decline"  : "success";

      const nice = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();
      showNotification({ variant, title: nice, message: `Status updated to <b>${nice}</b> successfully.` });
      setTimeout(() => location.reload(), 1000);
    } else {
      const errMsg = await res.text();
      showNotification({ variant: "error", title: "Update Failed", message: "Failed to update status: " + errMsg });
    }
  } catch (err) {
    console.error("Error updating status:", err);
    showNotification({ variant: "error", title: "Update Failed", message: "Error updating status." });
  }
}

/* -------------------------------
  STATUS CHANGE HANDLER
--------------------------------*/
function handleStatusChange(selectEl, bookingId) {
  const newStatus = (selectEl.value || "").toLowerCase();
  if (!newStatus) return;

  const booking = allBookings.find(b => b.id === bookingId);
  const resetSelect = () => { selectEl.selectedIndex = 0; };

  if (newStatus === "approved") {
    confirmAction({
      variant: "approve",
      message: `Are you sure you want to <b>Approve</b> this booking (#${bookingId})?`,
      onConfirm: () => updateStatus(bookingId, "Approved"),
      onCancel: resetSelect,
    });
    return;
  }

  if (newStatus === "completed") {
    if (!booking.expected_delivery_date) {
      resetSelect();
      confirmAction({
        variant: "setdate",
        message: `You must set an <b>Expected Delivery Date</b> before marking this booking as Completed.`,
        onConfirm: () => openExpectedDeliveryModal(bookingId),
        onCancel: resetSelect,
      });
      return;
    }
    confirmAction({
      variant: "complete",
      message: `Mark booking (#${bookingId}) as <b>Completed</b>?`,
      onConfirm: () => updateStatus(bookingId, "Completed"),
      onCancel: resetSelect,
    });
    return;
  }

  if (newStatus === "declined") {
    confirmAction({
      variant: "decline",
      message: `Are you sure you want to <b>Decline</b> this booking (#${bookingId})?`,
      onConfirm: () => updateStatus(bookingId, "Declined"),
      onCancel: resetSelect,
    });
    return;
  }
}

/* -------------------------------
  UI INIT
--------------------------------*/
function alertApproveFirst() {
  confirmAction({
    variant: "setdate",
    message: "Approve the booking first before setting the <b>Expected Delivery</b> date.",
    onConfirm: () => {},
    overrides: {
      title: "Set Expected Date",
      confirmText: "OK",
      iconClass: "far fa-calendar-check"
    },
    onCancel: () => {}
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fetchBookings();
  setInterval(fetchBookings, REFRESH_DELAY_MS);

  const searchInput = document.getElementById("bookingSearch");
  if (searchInput) {
    searchInput.addEventListener("input", applyCurrentFilterAndSearch);
  }

  document.querySelectorAll(".filter-card").forEach(card => {
    card.addEventListener("click", () => {
      const status = card.getAttribute("data-status");
      const filterBtn = document.getElementById("bookingFilterBtn");
      if (filterBtn) {
        filterBtn.dataset.value = status;
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${status}`;
      }
      applyCurrentFilterAndSearch();
    });
  });

  const filterBtn = document.getElementById("bookingFilterBtn");
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu show";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <a class="dropdown-item" data-value="all" href="#">All</a>
      <a class="dropdown-item" data-value="Approved" href="#">Approved</a>
      <a class="dropdown-item" data-value="Pending" href="#">Pending</a>
      <a class="dropdown-item" data-value="Completed" href="#">Completed</a>
      <a class="dropdown-item" data-value="Declined" href="#">Declined</a>
    `;
    document.body.appendChild(dropdown);

    filterBtn.dataset.value = "all";

    filterBtn.addEventListener("click", () => {
      const rect = filterBtn.getBoundingClientRect();
      dropdown.style.top = rect.bottom + window.scrollY + "px";
      dropdown.style.left = rect.left + window.scrollX + "px";
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });

    dropdown.querySelectorAll(".dropdown-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const value = item.dataset.value;
        filterBtn.dataset.value = value;
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        dropdown.style.display = "none";
        applyCurrentFilterAndSearch();
      });
    });

    document.addEventListener("click", (e) => {
      if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }
});

// -------------------------------
// Inert fix for all Bootstrap modals
// -------------------------------
document.addEventListener("show.bs.modal", (e) => {
  // Remove inert when modal opens
  e.target.removeAttribute("inert");
});

document.addEventListener("hide.bs.modal", (e) => {
  // Apply inert when modal closes
  e.target.setAttribute("inert", "");
  document.body.focus(); // send focus back safely
});


/* -------------------------------
  CONFIRM MODAL + THEME
--------------------------------*/
function ensureConfirmModal() {
  if (document.getElementById("confirmModal")) return;
  const modalHTML = `
    <div class="modal fade" id="confirmModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header" id="confirmModalHeader" style="background:#0077b6;color:#fff;">
            <h5 class="modal-title" id="confirmModalTitle">Confirm Action</h5>
            <div class="d-flex align-items-center">
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
          </div>
          <div class="modal-body">
            <div class="confirm-body d-flex align-items-start gap-2">
              <i id="confirmModalIcon" class="confirm-icon fas fa-question-circle" style="font-size:22px;color:#0077b6;"></i>
              <div id="confirmModalMessage">Are you sure?</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" id="confirmModalYesBtn">Yes</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showConfirm(message, onConfirm, opts = {}) {
  ensureConfirmModal();

  const modalEl = document.getElementById("confirmModal");
  const headerEl = document.getElementById("confirmModalHeader");
  const titleEl = document.getElementById("confirmModalTitle");
  const msgEl = document.getElementById("confirmModalMessage");
  const yesBtn = document.getElementById("confirmModalYesBtn");
  const iconEl = document.getElementById("confirmModalIcon");

  const {
    title = "Confirm Approve",
    confirmText = "Approve",
    iconClass = "fas fa-check-circle",
    accent = "#0077b6",
    onCancel = null,
  } = opts;

  titleEl.textContent = title;
  msgEl.innerHTML = message;
  yesBtn.textContent = confirmText;

  iconEl.className = `confirm-icon ${iconClass}`;
  iconEl.style.color = accent;
  headerEl.style.background = accent;
  headerEl.style.color = "#fff";
  yesBtn.style.background = accent;
  yesBtn.style.borderColor = accent;

  let confirmed = false;

  const bsModal = new bootstrap.Modal(modalEl);
  const onHidden = () => {
    modalEl.removeEventListener("hidden.bs.modal", onHidden);
    if (!confirmed && typeof onCancel === "function") onCancel();
  };
  modalEl.addEventListener("hidden.bs.modal", onHidden);

  yesBtn.onclick = () => {
    confirmed = true;
    bsModal.hide();
    if (typeof onConfirm === "function") onConfirm();
  };

  bsModal.show();
}

const ConfirmTheme = {
  approve: { title: "Confirm Approve",  confirmText: "Approve",  iconClass: "fas fa-check-circle",   accent: "#0077b6" },
  decline: { title: "Confirm Decline",  confirmText: "Decline",  iconClass: "fas fa-times-circle",  accent: "#e63946" },
  complete:{ title: "Confirm Complete", confirmText: "Complete", iconClass: "fas fa-check-double",  accent: "#2fbf71" },
  setdate: { title: "Set Expected Date", confirmText: "Set Date", iconClass: "far fa-calendar-check", accent: "#0077b6" },
};

function confirmAction({ variant, message, onConfirm, onCancel, overrides = {} }) {
  const theme = { ...(ConfirmTheme[variant] || ConfirmTheme.approve), ...overrides };
  showConfirm(message, onConfirm, {
    title: theme.title,
    confirmText: theme.confirmText,
    iconClass: theme.iconClass,
    accent: theme.accent,
    onCancel,
  });
}

/* -------------------------------
  Animated Counter
--------------------------------*/
function animateValue(el, start, end, duration, prefix = "", suffix = "") {
  if (!el) return;
  let startTimestamp = null;

  if (start === null) {
    const currentText = el.textContent.replace(/[^\d]/g, "");
    start = parseInt(currentText) || 0;
  }

  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const current = Math.floor(progress * (end - start) + start);
    el.textContent = prefix + current.toLocaleString() + suffix;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}