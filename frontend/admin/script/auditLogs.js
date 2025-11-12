// ==============================
// Audit Logs JS (Search + Filter + Pagination + Export + Notifications)
// ==============================

/* -------------------------------
   Notifications
--------------------------------*/
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
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

const NotificationTheme = {
  success: { accent: "#2fbf71", icon: "fas fa-check-circle", title: "Success" },
  warning: { accent: "#ffc107", icon: "fas fa-exclamation-triangle", title: "Warning" },
  error:   { accent: "#e63946", icon: "fas fa-times-circle", title: "Error" },
  info:    { accent: "#0d6efd", icon: "fas fa-info-circle", title: "Info" },
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
  titleEl.textContent = title || theme.title;
  msgEl.innerHTML = message || "";

  const modal = new bootstrap.Modal(document.getElementById("notificationModal"));
  modal.show();

  setTimeout(() => {
    const inst = bootstrap.Modal.getInstance(document.getElementById("notificationModal"));
    if (inst) inst.hide();
  }, 1800);
}

async function fetchNotifications() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications", { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    const notifCountEl = document.getElementById("notifCount");
    if (!notifCountEl) return;

    // ✅ count only unread
    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0";  // optional, can be hidden
      notifCountEl.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* -------------------------------
   Audit Logs Main
--------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("logTableBody");
  const exportBtn = document.getElementById("exportBtn");
  const searchInput = document.getElementById("searchInput");
  const actionFilter = document.getElementById("actionFilter");
  const roleFilter = document.getElementById("roleFilter");
  const logCount = document.getElementById("logCount");
  const paginationInfo = document.getElementById("paginationInfo");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  let logsData = [];
  let filteredData = [];
  let currentPage = 1;
  const rowsPerPage = 10;

  // -------------------- Fetch Logs -------------------- //
  try {
    const response = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/audit-logs");
    if (!response.ok) throw new Error("Failed to fetch logs.");

    logsData = await response.json();
    filteredData = logsData;
    renderTable();
    updatePagination();
    updateLogCount(filteredData.length);
  } catch (error) {
    console.error("Error loading audit logs:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load logs.</td></tr>`;
  }

  // -------------------- Render Table -------------------- //
  function renderTable() {
    tbody.innerHTML = "";

    if (!filteredData.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No audit logs found.</td></tr>`;
      paginationInfo.textContent = "Showing 0 results";
      return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredData.slice(start, end);

    pageData.forEach(log => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${log.date || "—"}</td>
        <td>${log.time || "—"}</td>
        <td>${log.user || "—"}</td>
        <td>${log.ip_address || "—"}</td>
        <td>${log.action || "—"}</td>
        <td>${log.role || "—"}</td>
        <td>${log.details || "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    const showingFrom = start + 1;
    const showingTo = Math.min(end, filteredData.length);
    paginationInfo.textContent = `Showing ${showingFrom} to ${showingTo} of ${filteredData.length} results`;
  }

  // -------------------- Update Pagination -------------------- //
  function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;

    const paginationNumbers = document.getElementById("paginationNumbers");
    paginationNumbers.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className = "btn btn-sm " + (i === currentPage ? "btn-primary" : "btn-light");
      btn.addEventListener("click", () => {
        currentPage = i;
        renderTable();
        updatePagination();
      });
      paginationNumbers.appendChild(btn);
    }
  }

  // -------------------- Update Log Count -------------------- //
  function updateLogCount(count) {
    if (logCount) logCount.textContent = `${count} total logs`;
  }

  // -------------------- Search + Filter -------------------- //
  function applyFilters() {
    const searchValue = searchInput.value.toLowerCase();
    const actionValue = actionFilter.value.toLowerCase();
    const roleValue = roleFilter.value.toLowerCase();

    filteredData = logsData.filter(log => {
      const logString = [
        log.date,
        log.time,
        log.user,
        log.ip_address,
        log.action,
        log.role,
        log.details
      ]
        .map(v => v ? v.toString().toLowerCase() : "")
        .join(" ");

      const matchesSearch = logString.includes(searchValue);
      const matchesAction =
        actionValue === "all" || (log.action || "").toLowerCase() === actionValue;
      const matchesRole =
        roleValue === "all" || (log.role || "").toLowerCase() === roleValue;

      return matchesSearch && matchesAction && matchesRole;
    });

    currentPage = 1;
    renderTable();
    updatePagination();
    updateLogCount(filteredData.length);
  }

  searchInput.addEventListener("input", applyFilters);
  actionFilter.addEventListener("change", applyFilters);
  roleFilter.addEventListener("change", applyFilters);

  // -------------------- Pagination Buttons -------------------- //
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
      updatePagination();
    }
  });

  nextBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
      updatePagination();
    }
  });

  // -------------------- Excel Export -------------------- //
  exportBtn.addEventListener("click", () => {
    if (!logsData.length) return alert("No logs to export.");

    const wsData = [
      ["Date", "Time", "User", "IP Address", "Action", "Role", "Details"],
      ...logsData.map(log => [
        log.date || "",
        log.time || "",
        log.user || "",
        log.ip_address || "",
        log.action || "",
        log.role || "",
        log.details || ""
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");

    XLSX.writeFile(wb, `Audit_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });

  // 🔔 Notifications
  fetchNotifications();
  setInterval(fetchNotifications, 30000);
});
