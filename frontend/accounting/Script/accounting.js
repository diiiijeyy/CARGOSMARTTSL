let allInvoices = [];
let allInvoicesMaster = [];
let invoiceCurrentPage = 1;
const invoiceRowsPerPage = 10;

/* =============================
    Notifications
  ============================= */
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

  const modalEl = document.getElementById("notificationModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

/* =============================
    Fetch Notifications
  ============================= */
async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications",
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
      notifCountEl.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* =============================
    DOM Ready
  ============================= */
document.addEventListener("DOMContentLoaded", () => {
  let currentFilter = "all";
  let currentSearch = "";

  const filterBtn = document.getElementById("invoiceFilterBtn");
  const searchInput = document.getElementById("invoiceSearch");

  /* =============================
    Generate Invoice Form (with Tax)
  ============================= */
  const amountDueInput = document.getElementById("amountDue");
  const taxRateInput = document.getElementById("taxRate");
  const totalAmountInput = document.getElementById("totalAmount");

  function updateTotalAmount() {
    const amount = parseFloat(amountDueInput.value) || 0;
    const tax = parseFloat(taxRateInput.value) || 0;
    const taxAmount = (amount * tax) / 100;
    const total = amount + taxAmount;
    totalAmountInput.value = total.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  amountDueInput.addEventListener("input", updateTotalAmount);
  taxRateInput.addEventListener("input", updateTotalAmount);

  document
    .getElementById("generateForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const shipmentId = document.getElementById("shipmentId").value;
      const amountDue = parseFloat(amountDueInput.value);
      const taxRate = parseFloat(taxRateInput.value) || 0;

      if (!amountDue || amountDue <= 0) {
        showNotification(
          "Invalid Input",
          "Please enter a valid amount due.",
          "warning"
        );
        return;
      }

      if (taxRate < 0 || taxRate > 100) {
        showNotification(
          "Invalid Tax",
          "Tax rate must be between 0 and 100%.",
          "warning"
        );
        return;
      }

      const modalEl = document.getElementById("generateModal");
      const modal = bootstrap.Modal.getInstance(modalEl);

      try {
        const res = await fetch(
          `https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices/generate/${shipmentId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount_due: amountDue, tax_rate: taxRate }),
            credentials: "include",
          }
        );

        if (res.ok) {
          if (modal) modal.hide();

          setTimeout(() => {
            document
              .querySelectorAll(".modal-backdrop")
              .forEach((b) => b.remove());
            document.body.classList.remove("modal-open");
            document.body.style.overflow = "";

            showSuccessModal(
              "Invoice Generated",
              "Invoice successfully created with tax included."
            );

            document.getElementById("generateForm").reset();
            totalAmountInput.value = "";

            const successModalEl = document.getElementById("successModal");
            successModalEl.addEventListener(
              "hidden.bs.modal",
              () => {
                loadInvoices();
              },
              { once: true }
            );
          }, 250);
        } else {
          const err = await res.json();
          showNotification(
            "Error",
            err.error || "Failed to generate invoice",
            "error"
          );
        }
      } catch (err) {
        console.error(err);
        showNotification(
          "Server Error",
          "Error while generating invoice",
          "error"
        );
      }
    });

  // Tooltips
  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll("[title]")
  );
  tooltipTriggerList.map((el) => new bootstrap.Tooltip(el));

  // Dropdown Filter
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu show";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
        <a class="dropdown-item" data-value="all" href="#">All</a>
        <a class="dropdown-item" data-value="paid" href="#">Paid</a>
        <a class="dropdown-item" data-value="unpaid" href="#">Unpaid</a>
        <a class="dropdown-item" data-value="not_generated" href="#">Not Generated</a>
      `;
    document.body.appendChild(dropdown);

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
        currentFilter = item.dataset.value;
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        dropdown.style.display = "none";
        loadInvoices(currentFilter, currentSearch);
      });
    });

    document.addEventListener("click", (e) => {
      if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }

  // Search Bar
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase();
      loadInvoices(currentFilter, currentSearch);
    });
  }

  // Initial Load
  loadInvoices(currentFilter, currentSearch);
  fetchNotifications();
  setInterval(fetchNotifications, 30000);
});

/* =============================
    Confirm Modal (Modern Design: Undo & Paid)
  ============================= */
function showConfirm(message, callback, color = "warning") {
  const header = document.getElementById("confirmModalHeader");
  const title = document.getElementById("confirmModalTitle");
  const icon = document.getElementById("confirmModalIcon");
  const body = document.getElementById("confirmModalBody");
  const okBtn = document.getElementById("confirmOkBtn");

  // Reset styles
  header.style.background = "";
  icon.className = "action-modal-icon fas";
  okBtn.className = "action-btn-confirm";
  okBtn.innerHTML = `<i class="fas fa-check me-2"></i>Confirm`;

  // Theme switch
  if (color === "danger") {
    // 🔄 Undo Invoice
    header.style.background = "linear-gradient(to right, #ff6b6b, #ff8787)";
    icon.classList.add("fa-undo-alt");
    icon.style.color = "#ff6b6b";
    okBtn.classList.add("undo");
    okBtn.innerHTML = `<i class="fas fa-undo-alt me-2"></i>Undo`;
  } else if (color === "success") {
    // ✅ Mark as Paid
    header.style.background = "linear-gradient(to right, #2fbf71, #3fd47a)";
    icon.classList.add("fa-check-circle");
    icon.style.color = "#2fbf71";
    okBtn.classList.add("paid");
    okBtn.innerHTML = `<i class="fas fa-check-circle me-2"></i>Mark as Paid`;
  } else {
    // ⚠️ Default Confirm
    header.style.background = "linear-gradient(to right, #f6c23e, #ffdd57)";
    icon.classList.add("fa-exclamation-circle");
    icon.style.color = "#f6c23e";
    okBtn.classList.add("confirm");
    okBtn.innerHTML = `<i class="fas fa-check me-2"></i>Confirm`;
  }

  title.textContent = "Confirm Action";
  body.textContent = message;

  const modal = new bootstrap.Modal(document.getElementById("confirmModal"));
  modal.show();

  // Confirm handler
  const handler = () => {
    callback();
    okBtn.removeEventListener("click", handler);
    modal.hide();
  };
  okBtn.addEventListener("click", handler);
}

/* =============================
    Success Modal
  ============================= */
function showSuccessModal(
  title = "Success",
  message = "Action completed successfully!"
) {
  const titleEl = document.getElementById("successModalTitle");
  const msgEl = document.getElementById("successModalMessage");

  titleEl.textContent = title;
  msgEl.textContent = message;

  const modalEl = document.getElementById("successModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  // Optional: Auto-close after 2.5s
  setTimeout(() => {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
  }, 2500);
}

/* =============================
    Load Invoices
  ============================= */
async function loadInvoices(statusFilter = "all", search = "") {
  try {
    const url =
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices";
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch invoices");
    const invoices = await res.json();

    allInvoicesMaster = invoices;
    allInvoices = invoices;

    applyCurrentInvoiceFilter();
  } catch (err) {
    console.error(err);
    showNotification("Error", "Failed to load invoices", "error");
  }
}

/* =============================
    Render Invoices
  ============================= */
function renderInvoices() {
  const tbody = document.getElementById("invoiceTable");
  tbody.innerHTML = "";

  if (!allInvoices || allInvoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No invoices found</td></tr>`;
    document.getElementById("Pagination").innerHTML = "";
    return;
  }

  const start = (invoiceCurrentPage - 1) * invoiceRowsPerPage;
  const end = start + invoiceRowsPerPage;
  const pageData = allInvoices.slice(start, end);

  tbody.innerHTML = pageData
    .map(
      (inv) => `
      <tr>
        <td>${inv.invoice_number || "-"}</td>
        <td>${inv.tracking_number || "-"}</td>
        <td>${inv.client_name}</td>
        <td>PHP${inv.amount_due || 0}</td>
        <td>${
          inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "-"
        }</td>
        <td>
          <span class="badge bg-${
            inv.invoice_status && inv.invoice_status.toLowerCase() === "paid"
              ? "success"
              : inv.invoice_status &&
                inv.invoice_status.toLowerCase() === "unpaid"
              ? "warning"
              : "secondary"
          }">
            ${inv.invoice_status || "Not Generated"}
          </span>
        </td>
        <td>
          ${
            !inv.invoice_id
              ? `
            <div class="d-flex justify-content-center">
              <button class="btn btn-sm btn-primary d-flex align-items-center gap-1"
                      onclick="openGenerate(${inv.shipment_id})"
                      title="Generate New Invoice">
                <i class="fas fa-file-invoice"></i>
                <span>Generate</span>
              </button>
            </div>
          `
              : `
            <div class="d-flex justify-content-center align-items-center gap-2 flex-nowrap">
              <a href="https://caiden-recondite-psychometrically.ngrok-free.dev${
                inv.pdf_url || `/invoices/${inv.invoice_number}.pdf`
              }" 
                target="_blank" class="btn btn-sm btn-primary" title="View PDF Invoice">
                <i class="fas fa-eye text-white"></i>
              </a>
              ${
                inv.invoice_status === "unpaid"
                  ? `
                <button class="btn btn-sm btn-success"
                        onclick="markAsPaid(${inv.invoice_id})"
                        title="Mark as Paid">
                  <i class="fas fa-check-circle text-white"></i>
                </button>
              `
                  : ""
              }
              <button class="btn btn-sm btn-danger"
                      onclick="undoInvoice(${inv.invoice_id})"
                      title="Undo Invoice">
                <i class="fas fa-undo-alt text-white"></i>
              </button>
            </div>
          `
          }
        </td>
      </tr>
    `
    )
    .join("");

  const totalPages = Math.ceil(allInvoices.length / invoiceRowsPerPage);
  renderInvoicePagination(totalPages);
}

/* =============================
    Pagination
  ============================= */
function renderInvoicePagination(totalPages) {
  const pagination = document.getElementById("Pagination");
  if (!pagination) return;
  pagination.innerHTML = "";

  if (totalPages <= 1) return;

  // Helper to make each <li>
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

  // 🔹 Only 3 page numbers visible at a time
  const windowSize = 3;
  const windowStart =
    Math.floor((invoiceCurrentPage - 1) / windowSize) * windowSize + 1;
  const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

  // ◀️ Prev Button
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      invoiceCurrentPage === 1 ? "disabled" : "",
      () => {
        if (invoiceCurrentPage > 1) {
          invoiceCurrentPage--;
          renderInvoices();
        }
      }
    )
  );

  // 🔢 Page Numbers (only current window)
  for (let i = windowStart; i <= windowEnd; i++) {
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === invoiceCurrentPage ? "active" : "",
        () => {
          invoiceCurrentPage = i;
          renderInvoices();
        }
      )
    );
  }

  // ▶️ Next Button
  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      invoiceCurrentPage === totalPages ? "disabled" : "",
      () => {
        if (invoiceCurrentPage < totalPages) {
          invoiceCurrentPage++;
          renderInvoices();
        }
      }
    )
  );
}

/* =============================
    Generate Invoice Modal
  ============================= */
async function openGenerate(shipmentId) {
  document.getElementById("shipmentId").value = shipmentId;
  const infoDiv = document.getElementById("shipmentInfo");

  try {
    const res = await fetch(
      `https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/shipments/${shipmentId}`,
      { credentials: "include" }
    );
    if (!res.ok) throw new Error("Failed to fetch shipment");
    const shipment = await res.json();

    infoDiv.innerHTML = `
        <div class="card mb-3">
          <div class="card-header bg-primary text-white">Shipment Information</div>
          <div class="card-body">
            <div class="row mb-2">
              <div class="col-6"><strong>Tracking #:</strong> ${
                shipment.tracking_number
              }</div>
              <div class="col-6"><strong>Client:</strong> ${
                shipment.company_name || shipment.client_id
              }</div>
            </div>
            <div class="row mb-2">
              <div class="col-6"><strong>Origin:</strong> ${
                shipment.port_origin
              }</div>
              <div class="col-6"><strong>Destination:</strong> ${
                shipment.port_delivery
              }</div>
            </div>
            <div class="row mb-2">
              <div class="col-6"><strong>Service Type:</strong> ${
                shipment.service_type
              }</div>
              <div class="col-6"><strong>Delivery Mode:</strong> ${
                shipment.delivery_mode || "-"
              }</div>
            </div>
            <div class="row mb-2">
              <div class="col-6"><strong>Status:</strong> ${
                shipment.status
              }</div>
              <div class="col-6"><strong>Created At:</strong> ${
                shipment.created_at
                  ? new Date(shipment.created_at).toLocaleDateString()
                  : "-"
              }</div>
            </div>
          </div>
        </div>
      `;
  } catch (err) {
    infoDiv.innerHTML = `<div class="alert alert-danger">Failed to load shipment info</div>`;
    console.error(err);
  }

  new bootstrap.Modal(document.getElementById("generateModal")).show();
}

/* =============================
    Mark as Paid (Fixed Version)
  ============================= */
async function markAsPaid(invoiceId) {
  showConfirm(
    "Mark this invoice as paid?",
    async () => {
      try {
        const res = await fetch(
          `https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices/${invoiceId}/pay`,
          {
            method: "PUT",
            credentials: "include",
          }
        );

        if (res.ok) {
          showSuccessModal(
            "Paid Successfully",
            "The invoice has been marked as paid."
          );

          const successModalEl = document.getElementById("successModal");
          successModalEl.addEventListener(
            "hidden.bs.modal",
            () => {
              document
                .querySelectorAll(".modal-backdrop")
                .forEach((b) => b.remove());
              document.body.classList.remove("modal-open");
              document.body.style.overflow = "";

              // 🔄 Reload invoice list after modal closes
              loadInvoices();
            },
            { once: true }
          );
        } else {
          const err = await res.json();
          showNotification(
            "Error",
            err.error || "Failed to mark as paid",
            "error"
          );
        }
      } catch (err) {
        console.error(err);
        showNotification("Error", "Failed to mark as paid", "error");
      }
    },
    "success"
  );
}

/* =============================
    Undo Invoice
  ============================= */
async function undoInvoice(invoiceId) {
  showConfirm(
    "Are you sure you want to undo this invoice?",
    async () => {
      try {
        const res = await fetch(
          `https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices/${invoiceId}/undo`,
          {
            method: "DELETE",
            credentials: "include",
          }
        );

        if (res.ok) {
          // 🟢 Success modal instead of notification
          showSuccessModal(
            "Undo Successful",
            "The invoice has been successfully reverted."
          );

          // Reload after closing success modal
          document.getElementById("successModal").addEventListener(
            "hidden.bs.modal",
            () => {
              loadInvoices();
            },
            { once: true }
          );
        } else {
          const err = await res.json();
          showNotification(
            "Error",
            err.error || "Failed to undo invoice",
            "error"
          );
        }
      } catch (err) {
        console.error(err);
        showNotification("Error", "Failed to undo invoice", "error");
      }
    },
    "danger"
  );
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
        applyCurrentInvoiceFilter();
      } else if (selected === "last_month") {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        currentDateFilter = { range: "lastMonth", from: start, to: end };
        filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> Last Month`;
        applyCurrentInvoiceFilter();
      } else if (selected === "this_year") {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        currentDateFilter = { range: "thisYear", from: start, to: end };
        filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> This Year`;
        applyCurrentInvoiceFilter();
      } else if (selected === "custom") {
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();

        document.getElementById("dateRangeInput").value = "";

        const applyBtn = document.getElementById("applyDateRangeBtn");
        const newApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApply, applyBtn);

        newApply.addEventListener("click", () => {
          const value = document.getElementById("dateRangeInput").value.trim();
          if (!value.includes("to")) {
            alert("Please use format YYYY-MM-DD to YYYY-MM-DD");
            return;
          }
          const [from, to] = value.split("to").map((v) => v.trim());
          if (!from || !to) {
            alert("Please provide both start and end dates.");
            return;
          }

          currentDateFilter = { range: "custom", from, to };
          bootstrap.Modal.getInstance(
            document.getElementById("dateRangeModal")
          ).hide();

          filterBtn.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${from} → ${to}`;
          applyCurrentInvoiceFilter();
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

/* ======================================================
   APPLY DATE FILTER + SEARCH + STATUS
====================================================== */
function applyCurrentInvoiceFilter() {
  let filtered = [...allInvoicesMaster]; // always start from full data

  // Apply status filter
  const filterBtn = document.getElementById("invoiceFilterBtn");
  if (
    filterBtn &&
    filterBtn.textContent &&
    !filterBtn.textContent.toLowerCase().includes("all")
  ) {
    const selected = filterBtn.textContent.toLowerCase().trim();

    // Normalize comparison
    filtered = filtered.filter((i) => {
      const status = (i.invoice_status || "").toLowerCase().trim();

      if (selected.includes("paid") && !selected.includes("unpaid")) {
        // ✅ Paid only
        return status === "paid";
      } else if (selected.includes("unpaid")) {
        // ✅ Unpaid only
        return status === "unpaid";
      } else if (selected.includes("not generated")) {
        // ✅ Not generated only
        return !i.invoice_id;
      }
      return true;
    });
  }

  // Apply date range filter
  if (currentDateFilter.from && currentDateFilter.to) {
    const start = new Date(currentDateFilter.from);
    const end = new Date(currentDateFilter.to);
    end.setHours(23, 59, 59);
    filtered = filtered.filter((i) => {
      if (!i.due_date) return false;
      const d = new Date(i.due_date);
      return d >= start && d <= end;
    });
  }

  // Apply search filter
  const search = document
    .getElementById("invoiceSearch")
    .value.toLowerCase()
    .trim();
  if (search) {
    filtered = filtered.filter(
      (i) =>
        i.client_name?.toLowerCase().includes(search) ||
        i.invoice_number?.toLowerCase().includes(search) ||
        i.tracking_number?.toLowerCase().includes(search)
    );
  }

  allInvoices = filtered;
  invoiceCurrentPage = 1;
  renderInvoices();
}
