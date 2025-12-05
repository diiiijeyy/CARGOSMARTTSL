let allBookings = [];
let currentPage = 1;
const rowsPerPage = 10;
const REFRESH_DELAY_MS = 5000;

/* =================== Notifications =================== */
async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/notifications",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    const notifCountEl = document.getElementById("notifCount");
    if (!notifCountEl) return;
    const unreadCount = notifications.filter((n) => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0";
      notifCountEl.style.display = "none"; // hide badge when 0
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* =================== Update Summary Cards =================== */
let hasAnimatedSummary = false;
function updateSummaryCards(data) {
  const total = data.length;
  const approved = data.filter(
    (b) => (b.status || "").toLowerCase() === "approved"
  ).length;
  const pending = data.filter(
    (b) => (b.status || "").toLowerCase() === "pending"
  ).length;
  const declined = data.filter(
    (b) => (b.status || "").toLowerCase() === "declined"
  ).length;
  cancelled = data.filter(
    (b) => (b.status || "").toLowerCase() === "cancelled by client"
  ).length;

  const el = (id) => document.getElementById(id);

  const set = (id, val) => {
    if (!el(id)) return;
    !hasAnimatedSummary
      ? animateValue(el(id), 0, val, 1000)
      : (el(id).textContent = val);
  };

  set("totalBookings", total);
  set("confirmedBookings", approved);
  set("pendingBookings", pending);

  set("declinedBookings", declined);
  set("canceledBookings", cancelled);

  if (el("completedBookings")) el("completedBookings").textContent = "0";

  hasAnimatedSummary = true;
}

/* =================== Status Color Helper =================== */
function getStatusClass(status) {
  switch ((status || "").toLowerCase()) {
    case "pending":
      return "text-warning fw-bold";
    case "approved":
      return "text-primary fw-bold";
    case "declined":
    case "cancelled by client":
      return "text-danger fw-bold";
    default:
      return "text-muted";
  }
}

/* -------------------------------
   Render Bookings
--------------------------------*/
function renderBookings() {
  const tableBody = document.getElementById("bookingsBody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  let filtered = window._filteredData || allBookings;

  // Status filter
  const filterBtn = document.getElementById("bookingFilterBtn");
  if (
    filterBtn &&
    filterBtn.dataset.value &&
    filterBtn.dataset.value.toLowerCase() !== "all"
  ) {
    const currentFilter = filterBtn.dataset.value.toLowerCase();
    filtered = filtered.filter(
      (b) => (b.status || "").toLowerCase() === currentFilter
    );
  }

  // UNIVERSAL SEARCH
  const searchInput = document.getElementById("bookingSearch");
  if (searchInput && searchInput.value.trim() !== "") {
    const query = searchInput.value.toLowerCase().trim();

    filtered = filtered.filter((b) => {
      let combined = "";

      for (const [key, val] of Object.entries(b)) {
        if (val === null || val === undefined) continue;
        let text = String(val).toLowerCase();

        // Date handling
        if (
          key.includes("date") ||
          key.includes("created_at") ||
          key.includes("expected")
        ) {
          const d = new Date(val);
          if (!isNaN(d)) {
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const year = d.getFullYear();
            const shortYear = String(year).slice(-2);

            text += ` ${month}/${day} ${month}/${day}/${year} ${month}/${day}/${shortYear}`;
            text += ` ${("0" + month).slice(-2)}/${("0" + day).slice(
              -2
            )}/${year}`;
            text += ` ${d.toLocaleDateString("en-US").toLowerCase()}`;
            text += ` ${d.toDateString().toLowerCase()}`;
          }
        }

        combined += text + " ";
      }

      return combined.includes(query);
    });
  }

  // Sort order
  filtered.sort((a, b) => {
    const statusOrder = {
      pending: 0,
      approved: 1,
      declined: 2,
      "cancelled by client": 3,
    };
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

  if (paginated.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No bookings found</td></tr>`;
  } else {
    paginated.forEach((booking) => {
      const status = (booking.status || "").toLowerCase();
      const expectedCell = booking.expected_delivery_date
        ? new Date(booking.expected_delivery_date).toLocaleDateString()
        : "-";

      const row = document.createElement("tr");
      row.innerHTML = `
  <td>${booking.id}</td>
  <td>${booking.client_name || "-"}</td>
  <td>${booking.service_type || "-"}</td>
  <td>${booking.mode || booking.delivery_mode || "-"}</td>

  <!-- STATUS -->
  <td>
    <span class="d-block mb-1 text-capitalize ${getStatusClass(
      booking.status
    )}">
      ${booking.status || "-"}
    </span>

    ${
      ["approved", "declined", "cancelled by client"].includes(status)
        ? ""
        : `
      <div class="action-btn-group">
        <button class="action-btn action-approve"
                onclick="approveBooking(${booking.id})">
          Approve
        </button>
        <button class="action-btn action-decline"
                onclick="declineBooking(${booking.id})">
          Decline
        </button>
      </div>
    `
    }
  </td>

<!-- DECLINE / CANCEL REASON -->
<td>${
        ["declined", "cancelled by client"].includes(status)
          ? booking.decline_reason ||
            booking.cancel_reason ||
            "No reason provided"
          : "-"
      }</td>


  <!-- CREATED AT -->
  <td>${
    booking.created_at ? new Date(booking.created_at).toLocaleString() : "-"
  }</td>

  <!-- ACTION BUTTON -->
  <td>
    <button class="btn btn-sm btn-outline-primary"
            onclick="showBookingDetailsById(${booking.id})"
            title="View Booking Details">
      <i class="fas fa-eye"></i>
    </button>
  </td>

  <!-- EXPECTED DELIVERY -->
  <td>${expectedCell}</td>
`;

      tableBody.appendChild(row);
    });
  }

  renderPagination(totalPages);
  hideEmptyColumns();
  // Delay execution so DOM updates FIRST
  setTimeout(hideEmptyColumns, 0);
}

function hideEmptyColumns() {
  const table = document.getElementById("bookingsTable");
  if (!table) return;

  const headerCells = table.querySelectorAll("thead th");
  const bodyRows = table.querySelectorAll("tbody tr");

  if (!bodyRows.length) return;

  const colCount = headerCells.length;
  const shouldHide = new Array(colCount).fill(true);

  // Scan column content
  bodyRows.forEach((row) => {
    row.querySelectorAll("td").forEach((cell, index) => {
      const text = cell.innerText.trim().toLowerCase();

      if (text !== "-" && text !== "") {
        shouldHide[index] = false;
      }
    });
  });

  // 🔥 MUST ADD THIS (prevents hiding your View button column)
  shouldHide[7] = false; // ACTION column index

  // Apply hide/show
  for (let i = 0; i < colCount; i++) {
    const display = shouldHide[i] ? "none" : "";
    headerCells[i].style.display = display;

    bodyRows.forEach((row) => {
      const cell = row.children[i];
      if (cell) cell.style.display = display;
    });
  }
}

/* -------------------------------
  Status Options
--------------------------------*/
function getStatusOptions(status) {
  let options = `<option selected hidden>Update</option>`;
  status = (status || "").toLowerCase();

  if (status === "pending") {
    options += `
      <option value="Approved">Approve</option>
      <option value="Declined">Decline</option>
    `;
  } else if (["approved", "declined", "cancelled by client"].includes(status)) {
    // ✅ Fixed: now includes "cancelled by client"
    options = `<option selected hidden>Update</option>`;
  }

  return options;
}

/* ============================
   BL NUMBER MODAL
=============================*/
function openBLNumberModal(bookingId) {
  const blModal = document.getElementById("blNumberModal");
  const blInput = document.getElementById("blNumberInput");
  const hiddenId = document.getElementById("blBookingId");

  blInput.value = "";
  hiddenId.value = bookingId;

  new bootstrap.Modal(blModal).show();
}

// SAVE BL NUMBER
document.getElementById("saveBLBtn").addEventListener("click", async () => {
  const blInput = document.getElementById("blNumberInput");
  const blError = document.getElementById("blError");
  const bl = blInput.value.trim();
  const bookingId = document.getElementById("blBookingId").value;

  // RESET styles
  blInput.classList.remove("input-error");
  blError.style.display = "none";

  // VALIDATE
  if (!bl) {
    blInput.classList.add("input-error");
    blError.style.display = "block";
    return;
  }

  try {
const res = await fetch(
  `https://cargosmarttsl-5.onrender.com/api/admin/bookings/${bookingId}/tracking-number`,
  {
    credentials: "include",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracking_number: bl }),
  }
);


    if (!res.ok) {
      throw new Error("Failed to save BL Number.");
    }

    // Success
    showSuccessModal(
      "BL Number Saved",
      `BL Number <b>${bl}</b> has been assigned to booking #${bookingId}.`
    );

    fetchBookings();

    bootstrap.Modal.getInstance(
      document.getElementById("blNumberModal")
    ).hide();
  } catch (err) {
    console.error("BL Error:", err);

    blInput.classList.add("input-error");

    // Custom message
    blError.textContent = "BL Number already exists.";
    blError.style.display = "block";
  }
});

/* -------------------------------
  DECLINE REASON MODAL
--------------------------------*/
function ensureDeclineModal() {
  if (document.getElementById("declineModal")) return;
  const modalHTML = `
    <div class="modal fade" id="declineModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:500px;">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title">Decline Booking</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p>Please provide a reason for declining this booking:</p>
            <textarea id="declineReasonInput" class="form-control" rows="4" placeholder="Enter reason..."></textarea>
            <div id="declineError" class="error-text">Reason is required.</div>
            <input type="hidden" id="declineBookingId">
          </div>
          <div class="modal-footer">
            <button class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-danger" onclick="submitDeclineReason()">Decline</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function openDeclineModal(bookingId) {
  ensureDeclineModal();
  document.getElementById("declineBookingId").value = bookingId;
  document.getElementById("declineReasonInput").value = "";
  new bootstrap.Modal(document.getElementById("declineModal")).show();
}

function submitDeclineReason() {
  const bookingId = document.getElementById("declineBookingId").value;
  const input = document.getElementById("declineReasonInput");
  const err = document.getElementById("declineError");
  const reason = input.value.trim();

  // Reset styles
  input.classList.remove("input-error");
  err.style.display = "none";

  // Validate
  if (!reason) {
    input.classList.add("input-error");
    err.style.display = "block";
    return;
  }

  // Save decline
  updateStatus(bookingId, "Declined", reason);

  // Close modal
  bootstrap.Modal.getInstance(document.getElementById("declineModal")).hide();
}

/* -------------------------------
  Render Pagination (3-page window)
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

  // Window size = 3 visible page numbers
  const windowSize = 3;
  const windowStart =
    Math.floor((currentPage - 1) / windowSize) * windowSize + 1;
  const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

  // Prev Button
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentPage === 1 ? "disabled" : "",
      () => {
        if (currentPage > 1) {
          currentPage--;
          renderBookings();
        }
      }
    )
  );

  // Page Numbers (only show current window)
  for (let i = windowStart; i <= windowEnd; i++) {
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === currentPage ? "active" : "",
        () => {
          currentPage = i;
          renderBookings();
        }
      )
    );
  }

  // Next Button
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      currentPage === totalPages ? "disabled" : "",
      () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderBookings();
        }
      }
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
      <div class="modal-dialog modal-dialog-centered" style="max-width:500px;">
        <div class="modal-content confirm-modal">
          <div class="confirm-modal-header" style="background:linear-gradient(to right, #60adf4, #3a94e9);">
            <h5 class="modal-title">Set Expected Delivery Date</h5>
          </div>
          <div class="confirm-modal-body" style="height:auto; padding:2rem 1.5rem;">
            <div class="confirm-modal-icon">
              <i class="far fa-calendar-check"></i>
            </div>
            <p class="mb-3 fw-medium" style="color:#333;">
              Please select the <b>Expected Delivery Date</b> for this booking.
            </p>
            <div class="expected-date-wrapper" style="position:relative; width:100%; max-width:280px;">
              <input type="date" id="expectedDeliveryInput"
                     class="form-control expected-delivery-input"
                     style="cursor:pointer; padding:0.75rem 1rem; font-size:1rem; border:1px solid #ccc; border-radius:10px; text-align:center; font-weight:500;"
                     required>
              <input type="hidden" id="expectedDeliveryBookingId">
            </div>
          </div>
          <div class="confirm-modal-footer">
            <button class="btn-cancel" data-bs-dismiss="modal">Cancel</button>
            <button class="btn-confirm" id="saveExpectedDeliveryBtn">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  const input = document.getElementById("expectedDeliveryInput");
  input.addEventListener("click", () => input.showPicker && input.showPicker());
}

/* -------------------------------
  OPEN EXPECTED DELIVERY MODAL
--------------------------------*/
function openExpectedDeliveryModal(bookingId, autoApprove = false) {
  ensureExpectedDeliveryModal();

  const modalEl = document.getElementById("expectedDeliveryModal");
  const input = document.getElementById("expectedDeliveryInput");
  const saveBtn = document.getElementById("saveExpectedDeliveryBtn");
  const hiddenBookingId = document.getElementById("expectedDeliveryBookingId");

  hiddenBookingId.value = bookingId;
  input.value = "";

  // Disable past dates
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  input.min = `${yyyy}-${mm}-${dd}`;

  modalEl.dataset.autoApprove = autoApprove ? "true" : "false";

  saveBtn.onclick = async () => {
    const dateValue = input.value;
    if (!dateValue) {
      const expectedModal = bootstrap.Modal.getInstance(
        document.getElementById("expectedDeliveryModal")
      );
      if (expectedModal) expectedModal.hide();
      setTimeout(() => {
        const missingModal = new bootstrap.Modal(
          document.getElementById("missingDateModal")
        );
        missingModal.show();
      }, 300);
      return;
    }

    try {
      const res = await fetch(
        `https://cargosmarttsl-5.onrender.com/api/admin/bookings/${bookingId}/expected-delivery
`,
        {
          credentials: "include",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_delivery_date: dateValue }),
        }
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to save expected delivery date.");
      }

      if (modalEl.dataset.autoApprove === "true") {
        setTimeout(() => openBLNumberModal(bookingId), 300);
      } else {
        showSuccessModal(
          "Expected Date Set",
          "Expected Delivery Date has been saved successfully."
        );
      }

      await fetchBookings();
    } catch (err) {
      console.error("Error setting expected date:", err);
      showNotification({
        variant: "error",
        title: "Error",
        message: err.message || "Failed to communicate with server.",
      });
    } finally {
      const modalInst = bootstrap.Modal.getInstance(modalEl);
      if (modalInst) modalInst.hide();
    }
  };

  new bootstrap.Modal(modalEl).show();
}

document.addEventListener("click", function (e) {
  if (e.target.id === "missingDateOkBtn") {
    const missModal = document.getElementById("missingDateModal");
    const missInst = bootstrap.Modal.getInstance(missModal);
    if (missInst) missInst.hide();

    setTimeout(() => {
      const expectedModal = new bootstrap.Modal(
        document.getElementById("expectedDeliveryModal")
      );
      expectedModal.show();

      const input = document.getElementById("expectedDeliveryInput");
      if (input) input.focus();
    }, 250);
  }
});

/* -------------------------------
  APPROVE MODAL → THEN EXPECTED DELIVERY MODAL
--------------------------------*/
function openApproveModal(bookingId) {
  const approveModalEl = document.getElementById("approveBookingModal");
  const confirmBtn = document.getElementById("confirmApproveBtn");

  if (!approveModalEl) {
    console.error("Approve modal not found!");
    return;
  }

  const bsModal = new bootstrap.Modal(approveModalEl);
  bsModal.show();

  // Remove previous click handlers to avoid duplicate triggers
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener("click", () => {
    bsModal.hide();

    // Step 1: Expected Delivery Date
    setTimeout(() => {
      openExpectedDeliveryModal(bookingId, true);
    }, 350);

    // Step 2 will be triggered AFTER expected date save
  });
}

/* -------------------------------
  SAVE EXPECTED DELIVERY DATE
--------------------------------*/
async function saveExpectedDelivery(bookingId, expectedDate) {
  try {
    const res = await fetch(
      `https://cargosmarttsl-5.onrender.com/api/om/bookings/${bookingId}/expected-delivery`,
      {
        credentials: "include",
        method: "PUT", // match backend
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_delivery_date: expectedDate }),
      }
    );

    if (res.ok) {
      showNotification({
        variant: "setdate",
        title: "Expected Date Set",
        message: `Expected Delivery Date has been set successfully.`,
      });
      fetchBookings(); // refresh data
    } else {
      const msg = await res.text();
      showNotification({
        variant: "error",
        title: "Failed to Save",
        message: msg || "Unable to save expected delivery date.",
      });
    }
  } catch (err) {
    console.error("Error saving expected delivery date:", err);
    showNotification({
      variant: "error",
      title: "Network Error",
      message: "Failed to communicate with server.",
    });
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
                </select>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" id="updateBookingBtn">Update Booking</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showBookingDetailsById(id) {
  const booking = allBookings.find((b) => Number(b.id) === Number(id));

  if (!booking) {
    console.error("Booking not found:", id);
    return;
  }

  showBookingDetails(booking);
}

/* -------------------------------
  BOOKING DETAILS MODAL (with Decline Reason shown)
--------------------------------*/
function showBookingDetails(booking) {
  ensureBookingModal();
  const modalEl = document.getElementById("bookingDetailsModal");
  modalEl.dataset.bookingId = booking.id;

  const fmt = (v) => (v && v !== "" ? v : "-");
  const fmtDate = (v) => (v ? new Date(v).toLocaleString() : "-");
  const fmtWeight = (w, u) => (w ? `${w} ${u || ""}` : "-");

  const detailsBody = document.getElementById("bookingDetailsBody");

  detailsBody.innerHTML = `
    ${renderField("Tracking Number", fmt(booking.tracking_number))}
    ${renderField("Client Name", fmt(booking.client_name))}
    ${renderField("Service Type", fmt(booking.service_type))}
    ${renderField("Delivery Mode", fmt(booking.delivery_mode))}

    ${renderField("Created At", fmtDate(booking.created_at))}
    ${renderField("Origin", fmt(booking.port_origin))}
    ${renderField("Destination", fmt(booking.port_delivery))}

    ${renderField(
      "Packing List",
      booking.packing_list
        ? `<a href="${booking.packing_list}" target="_blank">View File</a>`
        : "-"
    )}
    ${renderField(
      "Commercial Invoice",
      booking.commercial_invoice
        ? `<a href="${booking.commercial_invoice}" target="_blank">View File</a>`
        : "-"
    )}

    ${renderField(
      "Gross Weight",
      fmtWeight(booking.gross_weight, booking.gross_weight_unit)
    )}
    ${renderField(
      "Net Weight",
      fmtWeight(booking.net_weight, booking.net_weight_unit)
    )}
    ${renderField("Number of Packages", fmt(booking.num_packages))}

    ${renderField("Shipper", fmt(booking.shipper))}
    ${renderField("Consignee", fmt(booking.consignee))}

    ${renderFullWidthField("Specific Location", fmt(booking.specific_location))}
    ${renderFullWidthField("Remarks", fmt(booking.remarks))}

    ${renderField(
      "Status",
      `<span class="${getStatusClass(booking.status)}">${fmt(
        booking.status
      )}</span>`
    )}

    ${
      booking.decline_reason
        ? renderFullWidthField("Decline Reason", fmt(booking.decline_reason))
        : ""
    }
  `;

  const statusSelect = document.getElementById("bookingStatusSelect");
  const updateBtn = document.getElementById("updateBookingBtn");

  if (booking.status?.toLowerCase() === "approved") {
    statusSelect.parentElement.style.display = "none";
    updateBtn.style.display = "none";
  } else {
    statusSelect.parentElement.style.display = "";
    updateBtn.style.display = "";
  }

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
  approve: {
    accent: "#0077b6",
    icon: "fas fa-check-circle",
    title: "Approved",
  },
  complete: {
    accent: "#2fbf71",
    icon: "fas fa-check-double",
    title: "Completed",
  },
  decline: {
    accent: "#e63946",
    icon: "fas fa-times-circle",
    title: "Declined",
  },
  setdate: {
    accent: "#0077b6",
    icon: "far fa-calendar-check",
    title: "Set Expected Date",
  },
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
  body.style.color = "#fff";
  iconEl.className = theme.icon;
  titleEl.textContent = title || theme.title;
  msgEl.innerHTML = message || "";

  const modal = new bootstrap.Modal(
    document.getElementById("notificationModal")
  );
  modal.show();

  setTimeout(() => {
    const inst = bootstrap.Modal.getInstance(
      document.getElementById("notificationModal")
    );
    if (inst) inst.hide();
  }, 1600);
}

/* -------------------------------
  API FUNCTIONS
--------------------------------*/
async function fetchBookings() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/bookings",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    allBookings = await res.json();
    updateSummaryCards(allBookings);
    renderBookings();
  } catch (error) {
    console.error("Failed to load bookings:", error);
  }
}

async function updateStatus(bookingId, newStatus, declineReason = null) {
  try {
    const body = { status: newStatus };
    if (newStatus && newStatus.toLowerCase() === "declined" && declineReason) {
      body.decline_reason = declineReason; // ✅ send to backend
    }

    const res = await fetch(
      `https://cargosmarttsl-5.onrender.com/api/admin/bookings/${bookingId}/status`,
      {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      const statusLower = (newStatus || "").toLowerCase();
      const variant =
        statusLower === "approved"
          ? "approve"
          : statusLower === "completed"
          ? "complete"
          : statusLower === "declined"
          ? "decline"
          : "success";

      const nice =
        newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();

      closeAllModals();

      if (["approved", "completed", "declined"].includes(statusLower)) {
        let msg = "";

        if (statusLower === "declined" && declineReason) {
          msg = `
            The booking has been <b>Declined</b>.<br>
            <span style="color:#e63946;"><b>Reason:</b></span>
            <i>${declineReason}</i>
          `;
        } else if (statusLower === "approved") {
          msg = "The booking has been <b>Approved</b> successfully.";
        } else if (statusLower === "completed") {
          msg = "The booking has been marked as <b>Completed</b>.";
        } else {
          msg = `Booking has been successfully ${nice.toLowerCase()}.`;
        }

        showSuccessModal(nice, msg);
      } else {
        showSuccessModal("Success", `Status updated to ${nice}.`);
      }
    } else {
      const errMsg = await res.text();
      showNotification({
        variant: "error",
        title: "Update Failed",
        message: "Failed to update status: " + errMsg,
      });
    }
  } catch (err) {
    console.error("Error updating status:", err);
    showNotification({
      variant: "error",
      title: "Update Failed",
      message: "Error updating status.",
    });
  }
}

/* -------------------------------
  STATUS CHANGE HANDLER
--------------------------------*/
function handleStatusChange(selectEl, bookingId) {
  const newStatus = (selectEl.value || "").toLowerCase();
  if (!newStatus) return;

  const booking = allBookings.find((b) => b.id === bookingId);
  const resetSelect = () => {
    selectEl.selectedIndex = 0;
  };

  if (newStatus === "approved") {
    confirmAction({
      variant: "approve",
      message: `Are you sure you want to <b>approve</b> booking (#${bookingId})? <br>Once approved, you may proceed to set <b>Expected Delivery Date</b>.`,
      onConfirm: () => openExpectedDeliveryModal(bookingId, true),
      onCancel: resetSelect,
    });
    return;
  }

  if (newStatus === "declined") {
    openDeclineModal(bookingId);
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
    // ✅ Instead of calling updateStatus directly,
    //    open the Decline Reason modal
    openDeclineModal(bookingId);
    return;
  }
}

/* -------------------------------
  UI INIT
--------------------------------*/
function alertApproveFirst() {
  confirmAction({
    variant: "setdate",
    message:
      "Approve the booking first before setting the <b>Expected Delivery</b> date.",
    onConfirm: () => {},
    overrides: {
      title: "Set Expected Date",
      confirmText: "OK",
      iconClass: "far fa-calendar-check",
    },
    onCancel: () => {},
  });
}

/* -------------------------------
  Success Modal
--------------------------------*/
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
            <button type="button" class="btn btn-success px-4 fw-semibold" data-bs-dismiss="modal">
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
  document.getElementById("successModalMessage").innerHTML = message;

  const modalEl = document.getElementById("successModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      closeAllModals();
      fetchBookings(); // refresh table instead of full reload
    },
    { once: true }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  // Initial loads
  fetchBookings();
  fetchNotifications();

  // Auto-refresh
  setInterval(fetchBookings, REFRESH_DELAY_MS);
  setInterval(fetchNotifications, 30000);

  // Search
  const searchInput = document.getElementById("bookingSearch");
  if (searchInput) {
    searchInput.addEventListener("input", applyCurrentFilterAndSearch);
  }

  // Clickable filter cards
  document.querySelectorAll(".filter-card").forEach((card) => {
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

  // Filter dropdown
  const filterBtn = document.getElementById("bookingFilterBtn");
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu show";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    // In your DOMContentLoaded event listener
    dropdown.innerHTML = `
  <a class="dropdown-item" data-value="all" href="#">All</a>
  <a class="dropdown-item" data-value="pending" href="#">Pending</a>
  <a class="dropdown-item" data-value="approved" href="#">Approved</a>
  <a class="dropdown-item" data-value="declined" href="#">Declined</a>
  <a class="dropdown-item" data-value="cancelled by client" href="#">Cancelled by Client</a>
`;
    document.body.appendChild(dropdown);

    filterBtn.dataset.value = "all";

    filterBtn.addEventListener("click", () => {
      const rect = filterBtn.getBoundingClientRect();
      dropdown.style.top = rect.bottom + window.scrollY + "px";
      dropdown.style.left = rect.left + window.scrollX + "px";
      dropdown.style.display =
        dropdown.style.display === "none" ? "block" : "none";
    });

    dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
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
  e.target.removeAttribute("inert"); // Remove inert when modal opens
});

document.addEventListener("hide.bs.modal", (e) => {
  e.target.setAttribute("inert", ""); // Apply inert when modal closes
  document.body.focus(); // send focus back safely
});

/* -------------------------------
  Modern Confirm Modal (TSL Theme)
--------------------------------*/
function ensureConfirmModal() {
  if (document.getElementById("confirmModal")) return;
  const modalHTML = `
    <div class="modal fade" id="confirmModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:500px;">
        <div class="modal-content confirm-modal">
          <div class="confirm-modal-header">
            <h5 id="confirmModalTitle">Confirm Action</h5>
          </div>
          <div class="confirm-modal-body">
            <div class="confirm-modal-icon">
              <i id="confirmModalIcon" class="fas fa-box"></i>
            </div>
            <p id="confirmModalMessage">Are you sure you want to proceed?</p>
          </div>
          <div class="confirm-modal-footer">
            <button class="btn-cancel" data-bs-dismiss="modal">Cancel</button>
            <button class="btn-confirm" id="confirmModalYesBtn">Yes</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

const ConfirmTheme = {
  approve: {
    title: "Confirm Approve",
    confirmText: "Approve",
    icon: "fas fa-truck-loading",
    accent: "#0077b6",
  },
  decline: {
    title: "Confirm Decline",
    confirmText: "Decline",
    icon: "fas fa-times-circle",
    accent: "#e63946",
  },
  complete: {
    title: "Confirm Complete",
    confirmText: "Complete",
    icon: "fas fa-check-double",
    accent: "#2fbf71",
  },
  setdate: {
    title: "Set Expected Date",
    confirmText: "Set Date",
    icon: "far fa-calendar-check",
    accent: "#60adf4",
  },
};

function showConfirm(message, onConfirm, opts = {}) {
  ensureConfirmModal();

  const modalEl = document.getElementById("confirmModal");
  const headerEl = modalEl.querySelector(".confirm-modal-header");
  const iconEl = modalEl.querySelector("#confirmModalIcon");
  const titleEl = modalEl.querySelector("#confirmModalTitle");
  const msgEl = modalEl.querySelector("#confirmModalMessage");
  const yesBtn = modalEl.querySelector("#confirmModalYesBtn");

  const { title, confirmText, icon, accent, onCancel } = opts;

  // Apply styles and text
  titleEl.textContent = title;
  msgEl.innerHTML = message;
  iconEl.className = icon;
  headerEl.style.background = `linear-gradient(to right, ${accent}, ${shadeColor(
    accent,
    -20
  )})`;
  iconEl.style.color = accent;
  yesBtn.textContent = confirmText;
  yesBtn.style.background = accent;
  yesBtn.style.borderColor = accent;

  let confirmed = false;
  const bsModal = new bootstrap.Modal(modalEl);

  modalEl.addEventListener("hidden.bs.modal", function handler() {
    modalEl.removeEventListener("hidden.bs.modal", handler);
    if (!confirmed && typeof onCancel === "function") onCancel();
  });

  yesBtn.onclick = () => {
    confirmed = true;
    bsModal.hide();
    if (typeof onConfirm === "function") onConfirm();
  };

  bsModal.show();
}

function confirmAction({
  variant,
  message,
  onConfirm,
  onCancel,
  overrides = {},
}) {
  const theme = {
    ...(ConfirmTheme[variant] || ConfirmTheme.approve),
    ...overrides,
  };
  showConfirm(message, onConfirm, {
    title: theme.title,
    confirmText: theme.confirmText,
    icon: theme.icon,
    accent: theme.accent,
    onCancel,
  });
}

// Utility to darken or lighten hex colors slightly
function shadeColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
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

/* -------------------------------
  Modal Cleanup Fix
--------------------------------*/
function closeAllModals() {
  document.querySelectorAll(".modal.show").forEach((m) => {
    let instance = bootstrap.Modal.getInstance(m);

    // try to parse Bootstrap instance if not registered
    if (!instance) {
      try {
        instance = new bootstrap.Modal(m);
      } catch (err) {
        return; // skip this modal, it's not a real bootstrap modal
      }
    }

    instance.hide();
  });
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("padding-right");
  const backdrops = document.querySelectorAll(".modal-backdrop");
  backdrops.forEach((b) => b.remove());
}

/* ======================================================
   FILTER DATE DROPDOWN + CUSTOM RANGE MODAL
====================================================== */

let currentDateFilter = { range: null, from: null, to: null };

document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterDateBtn");
  if (!filterBtn) return;

  // Create dropdown dynamically
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  // Open dropdown on button click
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  // Handle dropdown item clicks
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      dropdown.style.display = "none";
      const selected = item.dataset.filter;

      const now = new Date();
      let start, end;

      if (selected === "this_month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        currentDateFilter = { range: "thisMonth", from: start, to: end };
        filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> This Month`;
        applyCurrentFilterAndSearch();
      } else if (selected === "last_month") {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        currentDateFilter = { range: "lastMonth", from: start, to: end };
        filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> Last Month`;
        applyCurrentFilterAndSearch();
      } else if (selected === "this_year") {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        currentDateFilter = { range: "thisYear", from: start, to: end };
        filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> This Year`;
        applyCurrentFilterAndSearch();
      } else if (selected === "custom") {
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();

        const fromEl = document.getElementById("customFromDate");
        const toEl = document.getElementById("customToDate");

        // Reset values
        fromEl.value = "";
        toEl.value = "";

        // Prevent typing but allow calendar
        fromEl.addEventListener("keypress", (e) => e.preventDefault());
        toEl.addEventListener("keypress", (e) => e.preventDefault());

        // Always open calendar when clicking input
        fromEl.addEventListener(
          "click",
          () => fromEl.showPicker && fromEl.showPicker()
        );
        toEl.addEventListener(
          "click",
          () => toEl.showPicker && toEl.showPicker()
        );

        // Set max = today
        const today = new Date().toISOString().split("T")[0];
        fromEl.max = today;
        toEl.max = today;

        // Replace old Apply handler
        const applyBtn = document.getElementById("applyDateRangeBtn");
        const newApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApply, applyBtn);

        newApply.addEventListener("click", () => {
          const from = fromEl.value;
          const to = toEl.value;

          if (!from || !to) {
            alert("Please select both From and To dates.");
            return;
          }

          if (new Date(from) > new Date(to)) {
            alert("Start date cannot be after end date.");
            return;
          }

          // Save filter
          currentDateFilter = { range: "custom", from, to };

          // Update button UI
          filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${from} → ${to}`;

          bootstrap.Modal.getInstance(
            document.getElementById("dateRangeModal")
          ).hide();

          applyCurrentFilterAndSearch();
        });
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
});

const originalRenderBookings = renderBookings;

renderBookings = function () {
  let filtered = [...allBookings];

  // status filter
  const filterStatusBtn = document.getElementById("bookingFilterBtn");
  if (
    filterStatusBtn &&
    filterStatusBtn.dataset.value &&
    filterStatusBtn.dataset.value.toLowerCase() !== "all"
  ) {
    const currentFilter = filterStatusBtn.dataset.value.toLowerCase();
    filtered = filtered.filter(
      (b) => (b.status || "").toLowerCase() === currentFilter
    );
  }

  // date filter
  if (currentDateFilter.from && currentDateFilter.to) {
    const start = new Date(currentDateFilter.from);
    const end = new Date(currentDateFilter.to);
    end.setHours(23, 59, 59);

    filtered = filtered.filter((b) => {
      const created = new Date(b.created_at);
      return created >= start && created <= end;
    });
  }

  // search
  const searchInput = document.getElementById("bookingSearch");
  if (searchInput && searchInput.value.trim() !== "") {
    const query = searchInput.value.toLowerCase().trim();
    filtered = filtered.filter((b) =>
      JSON.stringify(b).toLowerCase().includes(query)
    );
  }

  // IMPORTANT FIX
  allBookings = filtered;

  window._filteredData = filtered;
  originalRenderBookings();
};

function approveBooking(id) {
  confirmAction({
    variant: "approve",
    message: `Approve booking #${id}? You will then set Expected Delivery Date.`,
    onConfirm: () => openExpectedDeliveryModal(id, true),
  });
}

function declineBooking(id) {
  openDeclineModal(id);
}
