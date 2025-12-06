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
  }, 1800);
}

async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/admin/notifications",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    const notifCountEl = document.getElementById("notifCount");
    if (!notifCountEl) return;

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    notifCountEl.textContent = unreadCount > 0 ? unreadCount : "0";
    notifCountEl.style.display = unreadCount > 0 ? "inline-block" : "none";
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* -------------------------------
   AUDIT LOGS MAIN
--------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.getElementById("logTableBody");
  const exportBtn = document.getElementById("exportBtn");
  const searchInput = document.getElementById("searchInput");
  const actionFilter = document.getElementById("actionFilter"); // <select> in popover
  const logCount = document.getElementById("logCount");
  const paginationInfo = document.getElementById("paginationInfo");
  const pagination = document.getElementById("pagination");

  let logsData = [];
  let filteredData = [];
  let currentPage = 1;
  const rowsPerPage = 10;

  // Flexible matching for inconsistent action text
  const ACTION_MAP = {
    booking_created: [
      "booking created",
      "created booking",
      "create booking",
      "new booking",
      "add booking",
    ],

    booking_view: [
      "view booking",
      "viewed booking",
      "booking view",
      "opened booking",
    ],

    dashboard_view: [
      "view dashboard",
      "dashboard viewed",
      "viewed dashboard",
      "opened dashboard",
      "dashboard access",
    ],

    profile_view: [
      "view profile",
      "profile viewed",
      "viewed profile",
      "opened profile",
      "profile view",
    ],
  };

  // Fetch Logs
  try {
    const response = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/audit-logs"
    );
    if (!response.ok) throw new Error("Failed to fetch logs.");

    logsData = await response.json();
    filteredData = logsData;

    renderTable();
    renderPagination();
    updateLogCount(filteredData.length);
  } catch (error) {
    console.error("Error loading audit logs:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load logs.</td></tr>`;
  }

  function renderTable() {
    tbody.innerHTML = "";

    if (!filteredData.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No audit logs found.</td></tr>`;
      paginationInfo.textContent = "Showing 0 results";
      pagination.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredData.slice(start, end);

    pageData.forEach((log) => {
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

    paginationInfo.textContent = `Showing ${start + 1} to ${Math.min(
      end,
      filteredData.length
    )} of ${filteredData.length} results`;
  }

  function renderPagination() {
    pagination.innerHTML = "";

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
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

    // Window size = 3 pages (1 2 3, then 4 5 6, etc.)
    const windowSize = 3;

    const windowStart =
      Math.floor((currentPage - 1) / windowSize) * windowSize + 1;
    const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

    // PREVIOUS
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
        currentPage === 1 ? "disabled" : "",
        () => {
          if (currentPage > 1) {
            currentPage--;
            renderTable();
            renderPagination();
          }
        }
      )
    );

    // PAGE NUMBERS in current window
    for (let i = windowStart; i <= windowEnd; i++) {
      pagination.appendChild(
        makeLi(
          `<a class="page-link custom-page" href="#">${i}</a>`,
          i === currentPage ? "active" : "",
          () => {
            currentPage = i;
            renderTable();
            renderPagination();
          }
        )
      );
    }

    // NEXT
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
        currentPage === totalPages ? "disabled" : "",
        () => {
          if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            renderPagination();
          }
        }
      )
    );
  }

  function applyFilters() {
    const searchValue = searchInput.value.toLowerCase();
    const actionFilterValue = actionFilter
      ? actionFilter.value.toLowerCase()
      : "all";

    filteredData = logsData.filter((log) => {
      // Build one complete searchable string
      const searchable = [
        log.date,
        log.time,
        log.user,
        log.ip_address,
        log.action,
        log.details,
        log.role,
      ]
        .map((v) => (v ? v.toString().toLowerCase() : "")) // convert safely
        .join(" ");

      const matchesSearch = searchable.includes(searchValue);

      // ACTION FILTER
      let matchesAction = true;
      if (actionFilterValue !== "all") {
        const allowedList = ACTION_MAP[actionFilterValue] || [];
        const actionLower = (log.action || "").toLowerCase();

        matchesAction = allowedList.some((pattern) =>
          actionLower.includes(pattern)
        );
      }

      return matchesSearch && matchesAction;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
    updateLogCount(filteredData.length);
  }

  // Events
  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }
  if (actionFilter) {
    actionFilter.addEventListener("change", applyFilters);
  }

  function updateLogCount(count) {
    if (logCount) logCount.textContent = `${count} total logs`;
  }

  // Export
  exportBtn.addEventListener("click", () => {
    if (!logsData.length) return alert("No logs to export.");

    const wsData = [
      ["Date", "Time", "User", "IP Address", "Action", "Role", "Details"],
      ...logsData.map((log) => [
        log.date || "",
        log.time || "",
        log.user || "",
        log.ip_address || "",
        log.action || "",
        log.role || "",
        log.details || "",
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");

    XLSX.writeFile(
      wb,
      `Audit_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  });

  // Notifications
  fetchNotifications();
  setInterval(fetchNotifications, 30000);
});
