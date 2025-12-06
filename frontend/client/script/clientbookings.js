/* =================== CLIENT BOOKINGS =================== */
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "https://cargosmarttsl-1.onrender.com";

  const tableBody = document.querySelector('[data-table="recentBookings"]');
  const pagination = document.getElementById("pagination");
  const searchInput = document.getElementById("bookingSearch");

  /* =================== LOAD PROFILE =================== */
  async function loadProfile() {
    try {
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: "GET",
        credentials: "include",
      });
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
      const res = await fetch(`${API_BASE}/api/client/notifications`, {
        credentials: "include",
      });
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
      console.error("Error fetching notification count:", err);
    }
  }

  loadProfile();
  loadNotificationCount();
  setInterval(loadNotificationCount, 30000);

  /* =================== BOOKINGS TABLE =================== */
  if (!tableBody) return;

  let allBookings = [];
  let filteredBookings = [];
  let currentPage = 1;
  const rowsPerPage = 10;

  loadClientBookings();

  async function loadClientBookings() {
    try {
      const res = await fetch(`${API_BASE}/api/client/dashboard`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      const allowedStatuses = [
        "pending",
        "approved",
        "declined",
        "cancelled by client",
        "canceled by client",
        "cancel by client",
      ];

      allBookings = sortByStatusPriority(
        (data.bookings || []).filter((b) =>
          allowedStatuses.includes((b.status || "").toLowerCase())
        )
      );

      filteredBookings = [...allBookings];

      currentPage = 1;
      renderTablePage();
      renderPagination();
    } catch (err) {
      console.error("Failed to load bookings:", err);
      renderNoData("Failed to fetch bookings.");
    }
  }


 async function autoCompletePlaces(inputEl, callback) {
  if (!inputEl) return; // Ensure inputEl exists

  inputEl.addEventListener("input", async () => {
    const q = inputEl.value.trim();
    if (!q) {
      callback([]);
      return;
    }

    const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
    const suggestions = await res.json();
    callback(suggestions);
  });
}

  function sortByStatusPriority(bookings) {
    const priority = {
      pending: 1,
      approved: 2,
      declined: 3,
      "cancel by client": 4,
      "canceled by client": 4,
      "cancelled by client": 4,
    };

    return bookings.sort((a, b) => {
      const sa = (a.status || "").trim().toLowerCase();
      const sb = (b.status || "").trim().toLowerCase();

      const pa = priority[sa] || 99;
      const pb = priority[sb] || 99;

      return pa - pb;
    });
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

    pageData.forEach((booking) => {
      const status = (booking.status || "").toLowerCase();
      const badgeClass = getStatusBadge(status);
      // SHOW REASON FOR DECLINED + CANCELLED BY CLIENT
      let reasonText = "";

      if (
        status === "declined" ||
        status === "cancel by client" ||
        status === "canceled by client" ||
        status === "cancelled by client"
      ) {
        reasonText = booking.decline_reason || "";
      }

      const reasonDisplay = reasonText
        ? `<span class="text-danger small">${reasonText}</span>`
        : "";

      const row = document.createElement("tr");
      row.innerHTML = `
  <td>${booking.tracking_number || "-"}</td>
  <td>
  ${booking.port_origin || "-"} 
  <i class="fas fa-arrow-right mx-1"></i> 
  ${booking.port_delivery || "-"}
</td>

  <td>${booking.service_type || "-"}</td>
  <td><span class="badge ${badgeClass}">${booking.status || "-"}</span></td>
  <td>${
    booking.created_at ? new Date(booking.created_at).toLocaleDateString() : "-"
  }</td>
  <td>${reasonDisplay}</td>
  <td>
  <div class="action-buttons">
    ${
      status === "pending" || status === "approved"
        ? `
      <button class="edit-booking-btn" 
        data-id="${booking.id}" 
        data-tracking="${booking.tracking_number || ""}">
  <i class="fas fa-edit me-1"></i> Edit
</button>

      <button class="cancel-booking-btn btn btn-sm btn-outline-danger" data-id="${
        booking.id
      }">
        <i class="fas fa-times me-1"></i> Cancel
      </button>
    `
        : ""
    }

    ${
      [
        "cancel by client",
        "canceled by client",
        "cancelled by client",
      ].includes(status)
        ? ""
        : ""
    }

  </div>
</td>
`;

      tableBody.appendChild(row);
    });
  }

  function renderPagination() {
    const pagination = document.getElementById("pagination");
    pagination.innerHTML = "";

    const totalPages = Math.ceil(filteredBookings.length / rowsPerPage);
    if (totalPages <= 1) return;

    const makeLi = (html, className = "", onClick = null) => {
      const li = document.createElement("li");
      li.className = `page-item ${className}`;
      li.innerHTML = html;

      if (onClick && className !== "disabled") {
        li.addEventListener("click", (e) => {
          e.preventDefault();
          onClick();
        });
      }
      return li;
    };

    // ================= PREVIOUS =================
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
        currentPage === 1 ? "disabled" : "",
        () => {
          currentPage--;
          renderTablePage();
          renderPagination();
        }
      )
    );

    // ================= PAGE NUMBERS =================
    for (let i = 1; i <= totalPages; i++) {
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

    // ================= NEXT =================
    pagination.appendChild(
      makeLi(
        `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
        currentPage === totalPages ? "disabled" : "",
        () => {
          currentPage++;
          renderTablePage();
          renderPagination();
        }
      )
    );
  }

  /* =================== CANCEL BOOKING =================== */
  /* =================== CANCEL BOOKING =================== */
  let selectedBookingId = null;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cancel-booking-btn");
    if (!btn) return;

    selectedBookingId = parseInt(btn.dataset.id, 10);
    console.log("Selected booking id for cancel:", selectedBookingId);

    const reasonInput = document.getElementById("cancelReason");
    const errorText = document.getElementById("cancelError");
    if (reasonInput) reasonInput.value = "";
    if (errorText) errorText.style.display = "none";

    const modalEl = document.getElementById("cancelBookingModal");
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  });

  document
    .getElementById("confirmCancelBtn")
    ?.addEventListener("click", async () => {
      const reasonInput = document.getElementById("cancelReason");
      const errorText = document.getElementById("cancelError");

      if (!reasonInput || !errorText) return;

      const reason = reasonInput.value.trim();

      // REQUIRED REASON
      if (!reason) {
        errorText.style.display = "block";
        reasonInput.classList.add("input-error");
        return;
      }

      errorText.style.display = "none";
      reasonInput.classList.remove("input-error");

      // 🚨 Extra safety: no ID, no fetch
      if (!selectedBookingId || Number.isNaN(selectedBookingId)) {
        console.error("No valid booking ID selected for cancellation");
        alert("No valid booking was selected to cancel.");
        return;
      }

      try {
        console.log("Cancelling booking id:", selectedBookingId);

        const res = await fetch(
          `${API_BASE}/api/bookings/${selectedBookingId}/cancel`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              reason: reason,
              cancel_reason: reason, // ok to send both
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          console.error("Back-end error:", data);
          throw new Error(data.message || "Failed to cancel booking");
        }

        // Close modal
        const modalEl = document.getElementById("cancelBookingModal");
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        // Refresh table
        window.refreshBookings();

        // Show success modal
        const successModalEl = document.getElementById("successModal");
        document.getElementById("successModalTitle").textContent =
          "Booking Cancelled";
        document.getElementById("successModalMessage").textContent =
          "Your booking has been successfully cancelled.";

        const successModal = new bootstrap.Modal(successModalEl);
        successModal.show();
      } catch (err) {
        console.error("Cancel booking error:", err);
        alert("Failed to cancel booking.");
      }
    });

  /* =================== SEARCH =================== */
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.toLowerCase();

      filteredBookings = !term
        ? [...allBookings]
        : allBookings.filter((b) =>
            Object.values(b).some((v) => String(v).toLowerCase().includes(term))
          );

      currentPage = 1;
      renderTablePage();
      renderPagination();
    });
  }

  /* =================== FILTER TABS =================== */
  const statusTabs = document.querySelectorAll("#statusTabs .nav-link");
  let currentFilter = "all";

  statusTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class
      statusTabs.forEach((t) => t.classList.remove("active"));

      // Set clicked active
      tab.classList.add("active");

      // Read value
      currentFilter = tab.dataset.status;

      applyStatusFilter();
    });
  });
  function applyStatusFilter() {
    const normalize = (s) => (s || "").trim().toLowerCase();

    if (currentFilter === "all") {
      filteredBookings = [...allBookings];
    } else if (currentFilter === "pending") {
      filteredBookings = allBookings.filter(
        (b) => normalize(b.status) === "pending"
      );
    } else if (currentFilter === "approved") {
      filteredBookings = allBookings.filter(
        (b) => normalize(b.status) === "approved"
      );
    } else if (currentFilter === "declined") {
      filteredBookings = allBookings.filter(
        (b) => normalize(b.status) === "declined"
      );
    } else if (currentFilter === "cancel by client") {
      filteredBookings = allBookings.filter((b) => {
        const s = normalize(b.status);
        return (
          s === "cancel by client" ||
          s === "canceled by client" ||
          s === "cancelled by client"
        );
      });
    }

    // ⭐ ALWAYS SORT RESULTS
    filteredBookings = sortByStatusPriority(filteredBookings);

    currentPage = 1;
    renderTablePage();
    renderPagination();
  }

  /* =================== REFRESH BOOKINGS =================== */
  window.refreshBookings = () => loadClientBookings();

  /* =================== EDIT BOOKING =================== */
  document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".edit-booking-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const tracking = btn.dataset.tracking || "";

  try {
    const res = await fetch(`${API_BASE}/api/bookings/id/${id}`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("Failed to load booking:", await res.text());
      alert("Failed to load booking details.");
      return;
    }

    const booking = await res.json();
    console.log("Loaded booking:", booking);

    const form = document.getElementById("editBookingForm");
    if (form) {
      form.dataset.id = id;
      form.dataset.tracking = tracking;

      loadEditForm(booking);
    } else {
      console.warn("Edit form not found.");
    }

    const modalEl = document.getElementById("editBookingModal");
    if (modalEl) {
      new bootstrap.Modal(modalEl).show();
    }

  } catch (err) {
    console.error("Error loading booking:", err);
    alert("Unable to load booking data.");
  }
});

 function loadEditForm(b) {
  const form = document.getElementById("editBookingForm");
  if (!form) return;

  const s = b.shipment || b;

  // Small helpers to query by id or name
  const byId = (id) => form.querySelector(`#${id}`);
  const byName = (name) => form.querySelector(`[name="${name}"]`);

  const setId = (id, value) => {
    const el = byId(id);
    if (el) el.value = value ?? "";
    else console.warn(`Element with id '${id}' not found.`);
  };

  const setName = (name, value) => {
    const el = byName(name);
    if (el) el.value = value ?? "";
    else console.warn(`Element with name '${name}' not found.`);
  };

  // Apply form values
  setId("edit_deliveryType", b.delivery_type);

  // Delay setting service type to ensure dropdown options are loaded
  setTimeout(() => {
    setId("edit_serviceType", b.service_type);
  }, 10);

  setName("shipper", b.shipper);
  setName("consignee", b.consignee);
  setId("edit_deliveryMode", b.delivery_mode);

  // Shipment type radio buttons
  const radio = form.querySelector(`input[name="shipmentType"][value="${b.shipment_type}"]`);
  if (radio) radio.checked = true;

  setName("numPackages", b.num_packages);
  setId("edit_grossWeight", b.gross_weight);
  setId("edit_grossWeightUnit", b.gross_weight_unit);
  setId("edit_netWeight", b.net_weight);
  setId("edit_netWeightUnit", b.net_weight_unit);

  setId("edit_portOriginInput", b.port_origin);
  setId("edit_portDeliveryInput", b.port_delivery);

  // Handle Specific Location and Remarks with additional checks
  setName("specificLocation", b.specific_location || "");
  setName("remarks", b.remarks);
}

  /* =================== REBOOK BOOKING =================== */
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".rebook-booking-btn");
    if (!btn) return;

    const id = btn.dataset.id;

    try {
      // Fetch booking data (same route used by Edit)
      const res = await fetch(`${API_BASE}/api/bookings/id/${id}`, {
        credentials: "include",
      });

      if (!res.ok) {
        console.error("Failed to load booking:", await res.text());
        alert("Failed to load booking details.");
        return;
      }

      const booking = await res.json();
      console.log("Loaded booking for REBOOK:", booking);

      // Setup modal: clear tracking number so it becomes a NEW booking flow
      const form = document.getElementById("editBookingForm");
      form.dataset.id = id;
      form.dataset.tracking = ""; // rebook = no tracking number

      // Load the data into the form
      loadEditForm(booking);

      // SHOW THE EDIT MODAL
      const modalEl = document.getElementById("editBookingModal");
      new bootstrap.Modal(modalEl).show();
    } catch (err) {
      console.error("Error loading booking for rebook:", err);
      alert("Unable to load booking data.");
    }
  });

  /* ===============================================
   FIXED SUBMIT HANDLER
   =============================================== */

  const editForm = document.getElementById("editBookingForm");

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const id = editForm.dataset.id;
      const tracking = editForm.dataset.tracking;

      // Choose correct endpoint
      let endpoint = "";

      if (tracking && tracking.trim() !== "") {
        // approved booking (has tracking number)
        endpoint = `${API_BASE}/api/bookings/${encodeURIComponent(
          tracking
        )}/edit`;
      } else {
        // pending booking (no tracking number yet)
        endpoint = `${API_BASE}/api/bookings/id/${id}/edit`;
      }

      console.log("Editing via:", endpoint);

      const submitBtn = editForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = {
  service_type: document.getElementById("edit_serviceType").value,
  shipment_type: editForm.querySelector('input[name="shipmentType"]:checked')?.value || "",
  delivery_type: document.getElementById("edit_deliveryType").value,
  delivery_mode: document.getElementById("edit_deliveryMode").value,

  shipper: document.getElementById("edit_shipper").value,
  consignee: document.getElementById("edit_consignee").value,

  port_origin: document.getElementById("edit_portOriginInput").value,
  port_delivery: document.getElementById("edit_portDeliveryInput").value,

  num_packages: editForm.querySelector('[name="numPackages"]')?.value,
  gross_weight: document.getElementById("edit_grossWeight").value,
  gross_weight_unit: document.getElementById("edit_grossWeightUnit").value,
  net_weight: document.getElementById("edit_netWeight").value,
  net_weight_unit: document.getElementById("edit_netWeightUnit").value,

  specific_location: editForm.querySelector('[name="specificLocation"]').value,
  remarks: editForm.querySelector('[name="remarks"]').value,

  // Geocode values will be filled by autocomplete
  origin_lat: document.getElementById("edit_originLat")?.value || null,
  origin_lon: document.getElementById("edit_originLon")?.value || null,
  delivery_lat: document.getElementById("edit_deliveryLat")?.value || null,
  delivery_lon: document.getElementById("edit_deliveryLon")?.value || null,
};


      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await res.json().catch(() => null);

        if (!res.ok) {
          console.error("Edit error:", result);
          alert(result?.message || "Failed to update booking.");
          return;
        }

        // Close edit modal
        const editModalEl = document.getElementById("editBookingModal");
        const editModal = bootstrap.Modal.getInstance(editModalEl);
        if (editModal) editModal.hide();

        // Refresh bookings
        window.refreshBookings();

        // Show YOUR modal
        const successModalEl = document.getElementById("successModal");
        document.getElementById("successModalTitle").textContent =
          "Booking Updated";
        document.getElementById("successModalMessage").textContent =
          "Your booking changes have been saved successfully.";

        const successModal = new bootstrap.Modal(successModalEl);
        successModal.show();
      } catch (err) {
        console.error("Error updating booking:", err);
        alert("Server error while updating booking.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* =================== SERVICE TYPE MAPPING (EDIT MODAL) =================== */
  const serviceMap = {
    Sea: [
      "Sea Freight Forwarding",
      "Customs Brokerage",
      "Sea Freight Consolidation",
    ],
    Air: ["Air Freight Forwarding", "Customs Brokerage"],
    Land: [
      "Trucking Services",
      "Warehousing",
      "Door to Door Services",
      "Rigging",
    ],
  };

  function updateServiceType() {
    const deliveryTypeEl = document.querySelector("#edit_deliveryType");
    const serviceTypeEl = document.querySelector("#edit_serviceType");

    if (!deliveryTypeEl || !serviceTypeEl) return;

    const selected = deliveryTypeEl.value;
    const list = serviceMap[selected] || [];

    serviceTypeEl.innerHTML = `<option value="">Select Service</option>`;
    list.forEach((svc) => {
      const opt = document.createElement("option");
      opt.value = svc;
      opt.textContent = svc;
      serviceTypeEl.appendChild(opt);
    });
  }

  const deliveryTypeEditEl = document.querySelector("#edit_deliveryType");
  if (deliveryTypeEditEl) {
    deliveryTypeEditEl.addEventListener("change", updateServiceType);
  }
});


/* ==========================================
   AUTOCOMPLETE + GEOCODING FOR EDIT BOOKING
========================================== */

function setupAutocomplete(inputEl, listEl, latElId, lonElId) {
  if (!inputEl || !listEl) return; // Ensure elements exist

  let timer;

  inputEl.addEventListener("input", () => {
    const query = inputEl.value.trim();
    clearTimeout(timer);

    if (!query) {
      listEl.innerHTML = "";
      return;
    }

    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
        const suggestions = await res.json();

        listEl.innerHTML = "";

        suggestions.forEach((place) => {
          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = place.display_name;

          div.addEventListener("click", async () => {
            inputEl.value = place.display_name;
            listEl.innerHTML = "";

            // GET GEOCODE
            const geo = await validateLocationIQ(place.display_name);
            if (geo) {
              document.getElementById(latElId).value = geo.lat;
              document.getElementById(lonElId).value = geo.lon;
            }
          });

          listEl.appendChild(div);
        });
      } catch (err) {
        console.error("Autocomplete error:", err);
      }
    }, 300);
  });

  // Close dropdown if user clicks outside
  document.addEventListener("click", (e) => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
      listEl.innerHTML = "";
    }
  });
}

/* =================== GLOBAL HELPERS =================== */
function getStatusBadge(status) {
  if (!status) return "bg-secondary";

  switch (status.toLowerCase()) {
    case "pending":
      return "bg-warning";
    case "approved":
      return "bg-success";
    case "declined":
      return "bg-declined"; // your custom class
    case "cancel by client":
    case "canceled by client":
    case "cancelled by client":
      return "bg-cancel-client";
    case "delivered":
      return "bg-delivered";
    case "shipping":
      return "bg-shipping";
    default:
      return "bg-secondary";
  }
}

function renderNoData(message) {
  const tableBody = document.querySelector('[data-table="recentBookings"]');
  if (!tableBody) return;
  tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">${message}</td></tr>`;
}



// Attach autocomplete for Port Origin
setupAutocomplete(
  document.getElementById("edit_portOriginInput"),
  document.getElementById("edit_portOriginList"),
  "edit_originLat",
  "edit_originLon"
);

// Attach autocomplete for Port Delivery
setupAutocomplete(
  document.getElementById("edit_portDeliveryInput"),
  document.getElementById("edit_portDeliveryList"),
  "edit_deliveryLat",
  "edit_deliveryLon"
);