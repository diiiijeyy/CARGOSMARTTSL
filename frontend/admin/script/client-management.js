let cachedClients = [];
let currentFilter = "all";
let currentSearch = "";
let currentPage = 1;
const rowsPerPage = 10;

/* =================== Notifications =================== */
const notifCountEl = document.getElementById("notifCount");

async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

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

setInterval(fetchNotifications, 30000);

/* =================== Archived Flag Checker =================== */
function isArchived(val) {
  return val === true || val === 1 || val === "1" || val === "true";
}

/* =================== Load Clients =================== */
async function loadClients() {
  const tableBody = document.getElementById("clientTableBody");
  if (!tableBody) {
    console.error("clientTableBody element not found in HTML!");
    return;
  }

  tableBody.innerHTML = "";

  try {
    const response = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/clients?includeArchived=true"
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    cachedClients = await response.json();
    currentPage = 1; // reset to first page
    renderClients();
  } catch (error) {
    console.error("Error loading clients:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-danger">
          Error loading clients: ${error.message}
        </td>
      </tr>
    `;
  }
}

/* =================== Render Clients With Search Filter =================== */
function renderClients() {
  const tableBody = document.getElementById("clientTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  let filtered = [...cachedClients];

  if (currentFilter === "active") {
    filtered = filtered.filter((c) => !isArchived(c.archived));
  } else if (currentFilter === "archived") {
    filtered = filtered.filter((c) => isArchived(c.archived));
  }

  if (currentSearch.trim() !== "") {
    const term = currentSearch.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        (c.company_name || "").toLowerCase().includes(term) ||
        (c.contact_person || "").toLowerCase().includes(term) ||
        (c.email || "").toLowerCase().includes(term)
    );
  }

  filtered.sort((a, b) => {
    const aa = isArchived(a.archived) ? 1 : 0;
    const bb = isArchived(b.archived) ? 1 : 0;

    if (aa !== bb) return aa - bb;

    const shipmentsA = Number(a.total_shipments) || 0;
    const shipmentsB = Number(b.total_shipments) || 0;
    return shipmentsB - shipmentsA;
  });

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const paginated = filtered.slice(start, end);

  if (paginated.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No matching clients</td></tr>`;
  } else {
    paginated.forEach((client) => {
      const archivedFlag = isArchived(client.archived);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${client.company_name}</td>
        <td>${client.contact_person || "-"}</td>
        <td>${client.email}</td>
        <td>
        <span class="${archivedFlag ? "badge-archived" : "badge-active"}">
        ${archivedFlag ? "Archived" : "Active"}
        </span>

        </td>
        <td>${client.total_shipments || 0}</td>
        <td class="text-center">
        <div class="d-flex justify-content-center flex-wrap gap-2">
        <button class="btn btn-action view" onclick="viewClient(${
          client.id
        })">View</button>
        <button class="btn btn-action edit" onclick="editClient(${
          client.id
        })">Edit</button>
        <button class="btn btn-action ${
          archivedFlag ? "unarchive" : "archive"
        }" 
      onclick="toggleArchiveClient(${client.id})">
      ${archivedFlag ? "Unarchive" : "Archive"}
    </button>
  </div>
</td>

      `;
      tableBody.appendChild(row);
    });
  }

  renderPagination(totalPages);
}

/* =================== Render Pagination Controls =================== */
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

  const windowSize = 3;
  const windowStart =
    Math.floor((currentPage - 1) / windowSize) * windowSize + 1;
  const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentPage === 1 ? "disabled" : "",
      () => {
        if (currentPage > 1) {
          currentPage--;
          renderClients();
        }
      }
    )
  );

  for (let i = windowStart; i <= windowEnd; i++) {
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === currentPage ? "active" : "",
        () => {
          currentPage = i;
          renderClients();
        }
      )
    );
  }

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      currentPage === totalPages ? "disabled" : "",
      () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderClients();
        }
      }
    )
  );
}

/* =================== Archived Confirmation Modal =================== */
function ensureArchiveModal() {
  if (document.getElementById("archiveModal")) return;

  const modalHTML = `
    <div class="modal fade" id="archiveModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content archive-modal">
          <div class="modal-header archive-modal-header" id="archiveModalHeader">
            <h5 class="modal-title" id="archiveModalTitle">Confirm Archive</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center">
            <i class="fas fa-box-archive archive-modal-icon" id="archiveModalIcon"></i>
            <p class="mb-0" id="archiveModalMessage">
              Are you sure you want to archive this client?<br>
              You can restore it later from the archive list.
            </p>
          </div>
          <div class="modal-footer">
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

/* =================== Toggle Unarchived / Archive =================== */
async function toggleArchiveClient(clientId) {
  const idx = cachedClients.findIndex((c) => c.id === clientId);
  if (idx === -1) {
    showErrorModal("Error", "Client not found.");
    return;
  }

  const current = cachedClients[idx];
  const archivedNow = isArchived(current.archived);
  const action = archivedNow ? "unarchive" : "archive";

  showArchiveModal(
    "Confirm " + (archivedNow ? "Unarchive" : "Archive"),
    `Are you sure you want to ${action} this client?`,
    async () => {
      try {
        const response = await fetch(
          `https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/clients/${clientId}/${action}`,
          { method: "PATCH" }
        );
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        cachedClients[idx] = { ...current, archived: !archivedNow };
        await loadClients();

        showSuccessModal(
          archivedNow ? "Client Restored" : "Client Archived",
          result.message
        );
      } catch (error) {
        console.error(`Error trying to ${action} client:`, error);
        showErrorModal(
          "Error",
          `Failed to ${action} client. Please try again.`
        );
        loadClients();
      }
    },
    archivedNow
  );
}

/* =================== Notifications Modal =================== */
function ensureNotificationModal() {
  if (document.getElementById("notificationModal")) return;

  const modalHTML = `
    <div class="modal fade" id="notificationModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:600px; width:90%;">
        <div class="modal-content border-0 shadow-sm">
          <div class="modal-body d-flex align-items-center bg-primary text-white p-3 rounded">
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

function showNotification(title, message) {
  ensureNotificationModal();

  document.getElementById("notificationTitle").innerText = title;
  document.getElementById("notificationMessage").innerHTML = message;

  const modal = new bootstrap.Modal(
    document.getElementById("notificationModal")
  );
  modal.show();
}

/* =================== View Client Modal =================== */
async function viewClient(clientId) {
  const client = cachedClients.find((c) => c.id === clientId);
  if (!client) {
    showErrorModal("Error", "Client not found.");
    return;
  }

  const archivedFlag = isArchived(client.archived);
  document.getElementById("clientProfile").innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <h5 class="fw-bold text-primary mb-3">${client.company_name}</h5>
        <p><strong>Contact Person:</strong> ${client.contact_person || "-"}</p>
        <p><strong>Email:</strong> ${client.email}</p>
        <p><strong>Contact Number:</strong> ${client.contact_number || "-"}</p>
        <p><strong>Address:</strong> ${client.address || "-"}</p>
        <p><strong>Status:</strong> 
          <span class="client-status-badge ${
            archivedFlag ? "archived" : "active"
          }">
            <i class="fas ${
              archivedFlag ? "fa-box-archive" : "fa-circle-check"
            } me-2"></i>
            ${archivedFlag ? "Archived" : "Active"}
          </span>
        </p>
      </div>
    </div>
  `;

  const shipmentsBody = document.getElementById("clientShipments");
  shipmentsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>`;

  try {
    const res = await fetch(
      `https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/clients/${clientId}/shipments`
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const shipments = await res.json();
    currentShipments = shipments || [];
    currentShipmentPage = 1;

    renderShipmentTable(currentShipments);
  } catch (err) {
    console.error("Error loading shipments:", err);
    shipmentsBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load shipments</td></tr>`;
  }

  new bootstrap.Modal(document.getElementById("viewClientModal")).show();
}

/* =================== Shipment Pagination =================== */
let currentShipmentPage = 1;
const shipmentsPerPage = 5;
let currentShipments = [];

function renderShipmentTable(shipments) {
  const shipmentsBody = document.getElementById("clientShipments");
  const paginationEl = document.getElementById("shipmentPagination");
  if (!shipmentsBody || !paginationEl) return;

  shipmentsBody.innerHTML = "";

  const totalPages = Math.ceil(shipments.length / shipmentsPerPage);
  if (currentShipmentPage > totalPages) currentShipmentPage = totalPages || 1;

  const start = (currentShipmentPage - 1) * shipmentsPerPage;
  const end = start + shipmentsPerPage;
  const pageItems = shipments.slice(start, end);

  if (pageItems.length === 0) {
    shipmentsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No shipments found</td></tr>`;
  } else {
    shipmentsBody.innerHTML = pageItems
      .map((s) => {
        const status = (s.status || "").toLowerCase();
        let badgeClass = "";
        switch (status) {
          case "approved":
            badgeClass = "badge-approved";
            break;
          case "shipping":
            badgeClass = "badge-shipping";
            break;
          case "in transit":
          case "intransit":
            badgeClass = "badge-intransit";
            break;
          case "completed":
          case "delivered":
            badgeClass = "badge-completed";
            break;
          case "pending":
            badgeClass = "badge-pending";
            break;
          case "declined":
          case "cancelled":
          case "returned":
            badgeClass = "badge-declined";
            break;
          case "processed":
            badgeClass = "badge-processed";
            break;
          default:
            badgeClass = "badge bg-secondary";
        }

        return `
        <tr>
          <td>${s.tracking_number || "-"}</td>
          <td>${s.service_type || "-"}</td>
          <td><span class="badge ${badgeClass}">${s.status}</span></td>
          <td>${new Date(s.created_at).toLocaleDateString()}</td>
        </tr>
      `;
      })
      .join("");
  }

  renderShipmentPagination(totalPages);
}

function renderShipmentPagination(totalPages) {
  const paginationEl = document.getElementById("shipmentPagination");
  paginationEl.innerHTML = "";

  if (totalPages <= 1) {
    paginationEl.style.display = "none";
    return;
  } else {
    paginationEl.style.display = "flex";
  }

  const makePage = (html, className = "", onClick = null) => {
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

  paginationEl.appendChild(
    makePage(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentShipmentPage === 1 ? "disabled" : "",
      () => {
        if (currentShipmentPage > 1) {
          currentShipmentPage--;
          renderShipmentTable(currentShipments);
        }
      }
    )
  );

  const windowSize = 3;
  const windowStart =
    Math.floor((currentShipmentPage - 1) / windowSize) * windowSize + 1;
  const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

  for (let i = windowStart; i <= windowEnd; i++) {
    paginationEl.appendChild(
      makePage(
        `<a class="page-link custom-page" href="#">${i}</a>`,
        i === currentShipmentPage ? "active" : "",
        () => {
          currentShipmentPage = i;
          renderShipmentTable(currentShipments);
        }
      )
    );
  }

  paginationEl.appendChild(
    makePage(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      currentShipmentPage === totalPages ? "disabled" : "",
      () => {
        if (currentShipmentPage < totalPages) {
          currentShipmentPage++;
          renderShipmentTable(currentShipments);
        }
      }
    )
  );
}

/* =================== Edit Client Info =================== */
function editClient(clientId) {
  const client = cachedClients.find((c) => c.id === clientId);
  if (!client) {
    showNotification("Error", "Client not found.");
    return;
  }

  document.getElementById("editClientId").value = client.id;
  document.getElementById("editCompanyName").value = client.company_name;
  document.getElementById("editContactPerson").value =
    client.contact_person || "";
  document.getElementById("editEmail").value = client.email;
  document.getElementById("editContactNumber").value =
    client.contact_number || "";
  document.getElementById("editAddress").value = client.address || "";

  new bootstrap.Modal(document.getElementById("editClientModal")).show();
}

/* =================== Saved Edit Client =================== */
document
  .getElementById("editClientForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("editClientId").value;
    const emailInput = document.getElementById("editEmail");
    const email = emailInput.value.trim().toLowerCase();

    const updated = {
      company_name: document.getElementById("editCompanyName").value.trim(),
      contact_person: document.getElementById("editContactPerson").value.trim(),
      email,
      contact_number: document.getElementById("editContactNumber").value.trim(),
      address: document.getElementById("editAddress").value.trim(),
    };

    try {
      const res = await fetch(
        `https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/clients/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }
      );

      const raw = await res.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {}

      const msg = String(data.message || raw || "").toLowerCase();
      const isDuplicateServer =
        res.status === 409 ||
        res.status === 400 ||
        msg.includes("duplicate") ||
        msg.includes("email already exists") ||
        msg.includes("email exists") ||
        msg.includes("already in use");

      const isDuplicateLocal = cachedClients.some(
        (c) => c.id != id && (c.email || "").toLowerCase() === email
      );

      if (!res.ok && (isDuplicateServer || isDuplicateLocal)) {
        showWarningModal(
          "Duplicate Email",
          "This email address is already registered to another client. Please use a different one."
        );

        emailInput.classList.add("is-invalid");
        emailInput.focus();
        setTimeout(() => emailInput.classList.remove("is-invalid"), 1500);
        return;
      }

      if (!res.ok) throw new Error(data.message || "Could not update client.");

      const updatedClient = data;
      const idx = cachedClients.findIndex((c) => c.id == id);
      if (idx !== -1)
        cachedClients[idx] = { ...cachedClients[idx], ...updatedClient };
      renderClients();

      bootstrap.Modal.getInstance(
        document.getElementById("editClientModal")
      ).hide();
      showSuccessModal("Updated", "Client information updated successfully!");
    } catch (err) {
      console.error("Error updating client:", err);
      showErrorModal("Error", err.message || "Could not update client.");
    }
  });

/* =================== Add New Client =================== */
document.addEventListener("DOMContentLoaded", () => {
  const addClientForm = document.getElementById("addClientForm");
  if (!addClientForm) return;

  addClientForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("password").value.trim();
    const confirmPassword = document
      .getElementById("confirmPassword")
      .value.trim();
    const error = document.getElementById("passwordError");
    const emailInput = document.getElementById("email");
    const emailRaw = emailInput.value.trim();
    const email = emailRaw.toLowerCase();

    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    if (!passwordPattern.test(password)) {
      error.textContent =
        "Password must be at least 8 characters, include uppercase, lowercase, number, and special character.";
      error.style.display = "block";
      return;
    }

    if (password !== confirmPassword) {
      error.textContent = "Passwords do not match.";
      error.style.display = "block";
      return;
    } else {
      error.style.display = "none";
    }

    const localDup = cachedClients.some(
      (c) => (c.email || "").toLowerCase() === email
    );
    if (localDup) {
      showWarningModal(
        "Duplicate Email",
        "This email address is already registered. Please use a different one."
      );
      emailInput.classList.add("is-invalid");
      setTimeout(() => emailInput.classList.remove("is-invalid"), 1200);
      return;
    }

    const newClient = {
      company_name: document.getElementById("companyName").value.trim(),
      contact_person: document.getElementById("contactPerson").value.trim(),
      email: emailRaw,
      contact_number: document.getElementById("contactNumber").value.trim(),
      address: document.getElementById("address").value.trim(),
      password: password,

      verified: true,
      archived: false,
      created_by_admin: true,
    };

    try {
      const response = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/clients",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newClient),
        }
      );

      if (!response.ok) {
        const raw = await response.text();
        let data = {};
        try {
          data = JSON.parse(raw);
        } catch {}

        const msg = String(data.message || raw || "").toLowerCase();
        const looksDuplicate =
          response.status === 409 ||
          response.status === 400 ||
          /email.*exists|already.*use|already.*registered|duplicate/.test(msg);

        if (looksDuplicate) {
          showErrorModal(
            "Duplicate Email",
            "This email address is already registered. Please use a different one."
          );
          emailInput.classList.add("is-invalid");
          setTimeout(() => emailInput.classList.remove("is-invalid"), 1200);
          return;
        }

        showErrorModal("Error", data.message || "Failed to add client.");
        console.warn("Add client error payload:", {
          status: response.status,
          raw,
        });
        return;
      }

      const created = await response.json();
      cachedClients.push(created);
      await loadClients();

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("addClientModal")
      );
      if (modal) modal.hide();
      addClientForm.reset();

      showSuccessModal(
        "Client Added",
        "New client has been added and auto-verified!"
      );
    } catch (error) {
      console.error("Error adding client:", error);
      showErrorModal("Error", "An error occurred while adding the client.");
    }
  });
});

/* =================== Init on Page Load =================== */
document.addEventListener("DOMContentLoaded", () => {
  loadClients();
  fetchNotifications();

  const searchInput = document.getElementById("clientSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentSearch = e.target.value;
      renderClients();
    });
  }

  const filterBtn = document.querySelector(".btn-outline-secondary.btn-sm");
  if (filterBtn) {
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown-menu show";
    dropdown.style.position = "absolute";
    dropdown.style.display = "none";
    dropdown.innerHTML = `
      <a class="dropdown-item" data-value="all" href="#">All</a>
      <a class="dropdown-item" data-value="active" href="#">Active</a>
      <a class="dropdown-item" data-value="archived" href="#">Archived</a>
    `;
    document.body.appendChild(dropdown);

    filterBtn.addEventListener("click", (e) => {
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
        renderClients();
      });
    });

    document.addEventListener("click", (e) => {
      if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
  }
});

/* =================== Modal Accessibility =================== */
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("hide.bs.modal", (event) => {
    if (
      document.activeElement &&
      event.target.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  });

  document.addEventListener("hidden.bs.modal", (event) => {
    const trigger = document.querySelector(
      `[data-bs-target="#${event.target.id}"]`
    );
    if (trigger) trigger.focus();
  });
});

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

/* =================== Warning Modal =================== */
function ensureWarningModal() {
  if (document.getElementById("warningModal")) return;

  const modalHTML = `
    <div class="modal fade" id="warningModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content warning-modal border-0 shadow-lg">
          <div class="modal-header warning-modal-header text-white">
            <h5 class="modal-title fw-bold" id="warningModalTitle">Warning</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center py-4">
            <div class="warning-modal-icon mb-3">
              <i class="fas fa-exclamation-triangle"></i>
            </div>
            <p class="mb-0" id="warningModalMessage">This is a warning message.</p>
          </div>
          <div class="modal-footer justify-content-center border-0">
            <button type="button" class="btn btn-warning rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">
              <i class="fas fa-check me-2"></i>OK
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showWarningModal(title, message) {
  ensureWarningModal();
  document.getElementById("warningModalTitle").innerText = title;
  document.getElementById("warningModalMessage").innerText = message;

  const modal = new bootstrap.Modal(document.getElementById("warningModal"));
  modal.show();
}

/* =================== Error Modal =================== */
function ensureErrorModal() {
  if (document.getElementById("errorModal")) return;

  const modalHTML = `
    <div class="modal fade" id="errorModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content error-modal border-0 shadow-lg">
          <div class="modal-header error-modal-header text-white">
            <h5 class="modal-title fw-bold" id="errorModalTitle">Error</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body text-center py-4">
            <i class="fas fa-times-circle error-modal-icon mb-3"></i>
            <p class="mb-0" id="errorModalMessage">Something went wrong!</p>
          </div>
          <div class="modal-footer justify-content-center border-0">
            <button type="button" class="btn btn-danger rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">
              <i class="fas fa-times me-2"></i>Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function showErrorModal(title, message) {
  ensureErrorModal();
  document.getElementById("errorModalTitle").innerText = title;
  document.getElementById("errorModalMessage").innerText = message;

  const modal = new bootstrap.Modal(document.getElementById("errorModal"));
  modal.show();
}
