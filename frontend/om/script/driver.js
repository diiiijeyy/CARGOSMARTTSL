let driverFilter = "all"; // all | available | busy | archived
let driverSearch = ""; // search bar text

/* =============================
     GLOBAL DRIVER CACHE
============================== */
let cachedDrivers = [];

/* =============================
     FETCH AND RENDER DRIVERS
============================== */

async function loadDrivers() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/drivers",
      { credentials: "include" }
    );

    if (!res.ok) {
      console.error("Failed to load drivers:", res.status);
      return;
    }

    const drivers = await res.json();
    cachedDrivers = drivers; // store drivers in memory
    renderDrivers(drivers);
  } catch (err) {
    console.error("Error loading drivers:", err);
  }
}

function renderDrivers(drivers) {
  const tbody = document.getElementById("driverTableBody");
  tbody.innerHTML = "";

  // ---------------------------
  // UNIVERSAL SEARCH FILTER
  // ---------------------------
  let filtered = drivers.filter((d) => {
    const search = driverSearch.toLowerCase();

    // Computed status text for searching
    let statusText = "";
    if (d.account_status === "archived") {
      statusText = "archived";
    } else if (d.current_tracking_number) {
      statusText = "busy";
    } else {
      statusText = "available";
    }

    return (
      d.full_name.toLowerCase().includes(search) ||
      d.email.toLowerCase().includes(search) ||
      (d.phone && d.phone.toLowerCase().includes(search)) ||
      statusText.includes(search) ||
      (d.current_tracking_number &&
        d.current_tracking_number.toLowerCase().includes(search))
    );
  });

  // ---------------------------
  // STATUS FILTER
  // ---------------------------
  filtered = filtered.filter((d) => {
    if (driverFilter === "all") return true;

    if (driverFilter === "available") {
      return d.account_status === "active" && !d.current_tracking_number;
    }

    if (driverFilter === "busy") {
      return d.account_status === "active" && d.current_tracking_number;
    }

    if (driverFilter === "archived") {
      return d.account_status === "archived";
    }

    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" class="text-center text-muted">No drivers found.</td></tr>
    `;
    return;
  }

  filtered.forEach((d) => {
    // STATUS LABELS
    let statusLabel = "";

    if (d.account_status === "archived") {
      statusLabel = `<span class="badge-archived">Archived</span>`;
    } else {
      if (d.current_tracking_number) {
        statusLabel = `<span class="badge-busy">Busy</span>`;
      } else {
        statusLabel = `<span class="badge-available">Available</span>`;
      }
    }

    let actionBtn = "";

    // If archived → always show Unarchive
    if (d.account_status === "archived") {
      actionBtn = `<button class="btn-unarchive toggle-archive-btn" data-id="${d.id}">Unarchive</button>`;
    }
    // If active → only show Archive when not busy
    else {
      if (!d.current_tracking_number) {
        actionBtn = `<button class="btn-archive toggle-archive-btn" data-id="${d.id}">Archive</button>`;
      } else {
        actionBtn = `-`; // or leave empty string ""
      }
    }

    tbody.innerHTML += `
      <tr>
        <td>${d.full_name}</td>
        <td>${d.email}</td>
        <td>${d.phone || "-"}</td>
        <td>${statusLabel}</td>
        <td>${d.current_tracking_number || "-"}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });

  attachDriverArchiveHandlers();
}

/* Attach click events */
function attachDriverArchiveHandlers() {
  document.querySelectorAll(".toggle-archive-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleArchiveDriver(btn.dataset.id);
    });
  });
}

/* =================== Success Modal =================== */
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
            <button type="button" class="btn btn-success rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">
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
  document.getElementById("successModalMessage").innerText = message;

  const modalEl = document.getElementById("successModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      location.reload();
    },
    { once: true }
  );
}

/* =============================
     ARCHIVE / UNARCHIVE DRIVER
============================== */
async function toggleArchiveDriver(driverId) {
  const idx = cachedDrivers.findIndex((d) => d.id == driverId);
  if (idx === -1) {
    showErrorModal("Error", "Driver not found.");
    return;
  }

  const currentDriver = cachedDrivers[idx];
  const isArchived = currentDriver.account_status === "archived";
  const action = isArchived ? "unarchive" : "archive";

  showArchiveModal(
    "Confirm " + (isArchived ? "Unarchive" : "Archive"),
    `Are you sure you want to ${action} this driver?`,
    async () => {
      try {
        const res = await fetch(
          `https://cargosmarttsl-5.onrender.com/api/admin/drivers/${driverId}/${action}`,
          {
            method: "PUT",
            credentials: "include",
          }
        );

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const result = await res.json();

        // DIRECT UPDATE ← fixed
        cachedDrivers[idx].account_status = isArchived ? "active" : "archived";

        // Refresh UI
        loadDrivers();

        showSuccessModal(
          isArchived ? "Driver Restored" : "Driver Archived",
          result.message
        );
      } catch (error) {
        console.error(`Error trying to ${action} driver:`, error);
        showErrorModal(
          "Error",
          `Failed to ${action} driver. Please try again.`
        );
      }
    },
    isArchived
  );
}

/* =============================
         NOTIFICATIONS
============================== */

async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/notifications",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const notifications = await res.json();
    const notifCountEl = document.getElementById("notifCount");
    const unread = notifications.filter((n) => !n.is_read).length;

    notifCountEl.textContent = unread > 0 ? unread : "";
    notifCountEl.style.display = unread > 0 ? "inline-block" : "none";
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* =============================
          INIT PAGE
============================== */
document.addEventListener("DOMContentLoaded", () => {
  loadDrivers();
  fetchNotifications();
  setInterval(fetchNotifications, 30000);

  /* SEARCH INPUT */
  const searchInput = document.getElementById("driverSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      driverSearch = e.target.value;
      renderDrivers(cachedDrivers);
    });
  }

  /* FILTER BUTTON */
  const filterBtn = document.querySelector(".btn-outline-secondary.btn-sm");
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu show";
    dropdown.id = "driverFilterDropdown";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    dropdown.style.minWidth = "150px";

    dropdown.innerHTML = `
      <a class="dropdown-item" data-value="all" href="#">All</a>
      <a class="dropdown-item" data-value="available" href="#">Available</a>
      <a class="dropdown-item" data-value="busy" href="#">Busy</a>
      <a class="dropdown-item" data-value="archived" href="#">Archived</a>
    `;

    document.body.appendChild(dropdown);

    /* SHOW / HIDE DROPDOWN */
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const rect = filterBtn.getBoundingClientRect();
      dropdown.style.top = rect.bottom + window.scrollY + "px";
      dropdown.style.left = rect.left + window.scrollX + "px";

      dropdown.style.display =
        dropdown.style.display === "none" ? "block" : "none";
    });

    /* ITEM CLICK */
    dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        driverFilter = item.dataset.value;

        // OPTIONAL: Update button label like clients
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;

        dropdown.style.display = "none";
        renderDrivers(cachedDrivers);
      });
    });

    // CLOSE DROPDOWN WHEN CLICKING OUTSIDE
    document.addEventListener("click", (e) => {
      if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }
});

/* =================== Archived Confirmation Modal =================== */
function ensureArchiveModal() {
  if (document.getElementById("archiveModal")) return;

  const modalHTML = `
    <div class="modal fade" id="archiveModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content archive-modal">
          <div class="modal-header archive-modal-header" id="archiveModalHeader">
            <h5 class="modal-title" id="archiveModalTitle">Confirm Archive</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body text-center">
            <i class="fas fa-box-archive archive-modal-icon" id="archiveModalIcon"></i>
            <p class="mb-0" id="archiveModalMessage"></p>
          </div>
          <div class="modal-footer justify-content-end">
            <button type="button" class="archive-btn-cancel" data-bs-dismiss="modal">
              <i class="fas fa-times me-2"></i>Cancel
            </button>
            <button type="button" class="archive-btn-confirm" id="archiveConfirmBtn">
              <i class="fas fa-box me-2"></i>Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showArchiveModal(title, message, onConfirm, isUnarchive = false) {
  ensureArchiveModal();

  const modalEl = document.getElementById("archiveModal");
  const modalTitle = document.getElementById("archiveModalTitle");
  const modalMessage = document.getElementById("archiveModalMessage");
  const confirmBtn = document.getElementById("archiveConfirmBtn");
  const header = document.getElementById("archiveModalHeader");
  const icon = document.getElementById("archiveModalIcon");

  modalTitle.innerText = title;
  modalMessage.innerHTML = message;

  header.style.background = "";
  confirmBtn.className = "archive-btn-confirm";
  icon.style.color = "";

  if (isUnarchive) {
    header.style.background = "#f6c23e";
    confirmBtn.classList.add("unarchive");
    confirmBtn.innerHTML = `<i class="fas fa-rotate-left me-2"></i>Unarchive`;
    icon.className = "fas fa-rotate-left archive-modal-icon";
    icon.style.color = "#f6c23e";
  } else {
    header.style.background = "#dc3545";
    confirmBtn.classList.add("archive");
    confirmBtn.innerHTML = `<i class="fas fa-box-archive me-2"></i>Archive`;
    icon.className = "fas fa-box-archive archive-modal-icon";
    icon.style.color = "#dc3545";
  }

  const modal = new bootstrap.Modal(modalEl);

  confirmBtn.onclick = () => {
    onConfirm();
    modal.hide();
  };

  modal.show();
}

/* =================== ERROR MODAL =================== */
function showErrorModal(title, message) {
  alert(`${title}\n\n${message}`);
}

function createFilterDropdown() {
  if (document.getElementById("driverFilterDropdown")) return;

  const dropdown = document.createElement("div");
  dropdown.id = "driverFilterDropdown";
  dropdown.style.position = "absolute";
  dropdown.style.top = "45px";
  dropdown.style.right = "0";
  dropdown.style.minWidth = "150px";
  dropdown.style.background = "#fff";
  dropdown.style.border = "1px solid #ddd";
  dropdown.style.borderRadius = "6px";
  dropdown.style.boxShadow = "0 4px 10px rgba(0,0,0,0.1)";
  dropdown.style.zIndex = "999";
  dropdown.style.display = "none";

  dropdown.innerHTML = `
    <div class="driver-filter-item p-2 border-bottom text-dark" data-filter="all">All</div>
    <div class="driver-filter-item p-2 border-bottom text-dark" data-filter="available">Available</div>
    <div class="driver-filter-item p-2 border-bottom text-dark" data-filter="busy">Busy</div>
    <div class="driver-filter-item p-2 text-dark" data-filter="archived">Archived</div>
  `;

  document.body.appendChild(dropdown);
}
