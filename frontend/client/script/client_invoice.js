document.addEventListener("DOMContentLoaded", () => {
  updateCurrentDate();
  loadUsername();
  setupSearchAndFilter();
  loadInvoices();
  setupHamburgerMenu();
  setupProfileDropdown();
  setupNotificationPanel();
  setupFloatingNotification();
});


document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
  loadNotificationCount();
  setInterval(loadNotificationCount, 30000); // refresh every 30s
});


// ================ Refresh Button ================
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", (e) => {
      e.preventDefault();
      location.reload();
    });
  }
});

// ================ Current Date ================
function updateCurrentDate() {
  const currentDateElement = document.getElementById("current-date");
  if (!currentDateElement) return;
  const now = new Date();
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  currentDateElement.textContent = now.toLocaleDateString("en-US", options);
}

// ================ Load Client Username ================
async function loadUsername() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/profile", {
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
      console.warn(`Profile fetch failed with status: ${res.status}`);
      return;
    }

    const data = await res.json();
    const usernameElem = document.getElementById("username");
    if (usernameElem) {
      usernameElem.textContent = data.name || data.company_name || "Client";
    }
  } catch (err) {
    console.error("Error loading username:", err);
  }
}

// ================ Global Variables for Pagination ================
let allInvoices = [];
let invoiceCurrentPage = 1;
const invoiceRowsPerPage = 10;
let currentFilter = "all";
let currentSearch = "";

// ================ Setup Search and Filter ================
function setupSearchAndFilter() {
  const searchInput = document.getElementById("invoiceSearch");
  const filterBtn = document.getElementById("invoiceFilterBtn");

  // 🔍 Search listener
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value.toLowerCase();
      loadInvoices(currentFilter, currentSearch);
    });
  }

  // ⏬ Filter dropdown
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu filter-dropdown";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <a class="dropdown-item" data-value="all" href="#">All</a>
      <a class="dropdown-item" data-value="paid" href="#">Paid</a>
      <a class="dropdown-item" data-value="unpaid" href="#">Unpaid</a>
      <a class="dropdown-item" data-value="overdue" href="#">Overdue</a>
    `;
    document.body.appendChild(dropdown);

    filterBtn.addEventListener("click", () => {
      const rect = filterBtn.getBoundingClientRect();
      dropdown.style.top = rect.bottom + window.scrollY + "px";
      dropdown.style.left = rect.left + window.scrollX + "px";
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });

    dropdown.querySelectorAll(".dropdown-item").forEach(item => {
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
}

// ================ Load Invoices (Filter + Search + Pagination) ================
async function loadInvoices(statusFilter = "all", search = "") {
  const tbody = document.getElementById("invoiceTableBody");

  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/invoices", {
      credentials: "include"
    });

    if (!res.ok) throw new Error("Failed to fetch invoices");

    let invoices = await res.json();

    // Apply filter
    if (statusFilter !== "all") {
      invoices = invoices.filter(inv => {
        const status = inv.invoice_status?.toLowerCase();
        if (statusFilter === "paid") return status === "paid";
        if (statusFilter === "unpaid") return status === "unpaid" || status === "pending";
        if (statusFilter === "overdue") return status === "overdue";
        return true;
      });
    }

    // Apply search
    if (search) {
      invoices = invoices.filter(inv =>
        (inv.tracking_number?.toLowerCase().includes(search)) ||
        (inv.invoice_number?.toLowerCase().includes(search))
      );
    }

    // Store globally for pagination
    allInvoices = invoices.filter(inv => inv.invoice_id !== null);
    invoiceCurrentPage = 1;

    updateSummaryCards(allInvoices);
    renderInvoices();
  } catch (err) {
    console.error("Error loading invoices:", err);
    showFetchError();
  } finally {
    if (tbody && tbody.children.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No invoices found.</td></tr>`;
    }
  }
}

// ================ Render Invoices with Pagination ================
function renderInvoices() {
  const tbody = document.getElementById("invoiceTableBody");
  tbody.innerHTML = "";

  if (!allInvoices || allInvoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No invoices found</td></tr>`;
    document.getElementById("Pagination").innerHTML = "";
    return;
  }

  const start = (invoiceCurrentPage - 1) * invoiceRowsPerPage;
  const end = start + invoiceRowsPerPage;
  const pageData = allInvoices.slice(start, end);

  tbody.innerHTML = pageData.map(inv => `
    <tr>
      <td>#${inv.invoice_number || "—"}</td>
      <td>${inv.tracking_number || "—"}</td>
      <td>${formatDate(inv.date_issued)}</td>
      <td>${formatDate(inv.due_date)}</td>
      <td>₱${(inv.amount_due || 0).toLocaleString()}</td>
      <td>
        <span class="badge ${getStatusBadge(inv.invoice_status)}">
          ${inv.invoice_status || "—"}
        </span>
      </td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-secondary download-btn" data-invoice-number='${inv.invoice_number}'>
          <i class="fas fa-download"></i>
        </button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener("click", () => downloadInvoicePDF(btn.dataset.invoiceNumber));
  });

  const totalPages = Math.ceil(allInvoices.length / invoiceRowsPerPage);
  renderInvoicePagination(totalPages);
}

// ================ Render Pagination Controls ================
function renderInvoicePagination(totalPages) {
  const pagination = document.getElementById("Pagination");
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
      invoiceCurrentPage === 1 ? "disabled" : "",
      () => {
        if (invoiceCurrentPage > 1) {
          invoiceCurrentPage--;
          renderInvoices();
        }
      }
    )
  );

  // Numbers
  for (let i = 1; i <= totalPages; i++) {
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

  // Next
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

// ================ Update Summary Cards ================
function updateSummaryCards(invoices) {
  const total = invoices.length;
  const paid = invoices.filter(i => i.invoice_status?.toLowerCase() === "paid").length;
  const pending = invoices.filter(i =>
    i.invoice_status?.toLowerCase() === "unpaid" ||
    i.invoice_status?.toLowerCase() === "pending"
  ).length;
  const overdue = invoices.filter(i => i.invoice_status?.toLowerCase() === "overdue").length;

  document.getElementById("total-invoices").textContent = total;
  document.getElementById("paid-invoices").textContent = paid;
  document.getElementById("pending-invoices").textContent = pending;
  document.getElementById("overdue-invoices").textContent = overdue;
}

// ================ Format Date ================
function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

// ================ Status Badge ================
function getStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case "paid": return "status-badge status-paid";
    case "pending":
    case "unpaid": return "status-badge status-unpaid";
    case "overdue": return "status-badge status-overdue";
    default: return "status-badge status-default";
  }
}


// ================ Download Invoice PDF ================
function downloadInvoicePDF(invoiceNumber) {
  try {
    const pdfUrl = `https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/invoice/${invoiceNumber}/pdf`;
    const fileName = `Invoice_${invoiceNumber}.pdf`;

    const link = document.createElement("a");
    link.href = pdfUrl;
    link.target = "_blank";
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("Error opening PDF:", err);
    alert("Error opening PDF. Please try again.");
  }
}

// ================ Hamburger Menu ================
function setupHamburgerMenu() {
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  const nav = document.querySelector("nav");
  if (!hamburgerMenu || !nav) return;

  hamburgerMenu.addEventListener("click", () => nav.classList.toggle("active"));
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !hamburgerMenu.contains(e.target)) {
      nav.classList.remove("active");
    }
  });
}

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

// ================ Notification Panel ================
function setupNotificationPanel() {
  const notifLink = document.getElementById("notificationsLink");
  const panel = document.getElementById("notificationsFloat");
  const closeBtn = document.getElementById("closeNotif");

  if (notifLink && panel) {
    notifLink.addEventListener("click", (e) => {
      e.preventDefault();
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    });
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => {
      panel.style.display = "none";
    });
  }

  document.addEventListener("click", (e) => {
    if (panel && notifLink && !panel.contains(e.target) && !notifLink.contains(e.target)) {
      panel.style.display = "none";
    }
  });
}

// ================ Floating Notification Container ================
function setupFloatingNotification() {
  const notifBtn = document.getElementById("notificationsLink");
  const notifContainer = document.getElementById("floatingNotificationContainer");
  if (!notifBtn || !notifContainer) return;

  notifBtn.addEventListener("click", (e) => {
    e.preventDefault();
    notifContainer.style.display =
      notifContainer.style.display === "none" || !notifContainer.style.display
        ? "flex"
        : "none";
  });
}

// ================ Show Fetch Error ================
function showFetchError() {
  const tbody = document.getElementById("invoiceTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load invoices. Please try again later.</td></tr>`;
  }
}

// ================ Export Invoices to CSV ================
document.addEventListener("DOMContentLoaded", () => {
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportInvoicesToCSV);
  }
});

function exportInvoicesToCSV() {
  if (!allInvoices || allInvoices.length === 0) {
    alert("No invoices available to export.");
    return;
  }

  const headers = ["Invoice ID", "Booking Ref", "Date Issued", "Due Date", "Amount", "Status"];
  const rows = allInvoices.map(inv => [
    inv.invoice_number || "—",
    inv.tracking_number || "—",
    formatDate(inv.date_issued),
    formatDate(inv.due_date),
    inv.amount_due || 0,
    inv.invoice_status || "—"
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${v}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "invoices_export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
