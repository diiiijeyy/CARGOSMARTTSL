// ==================================================
// js/booking.js (LocationIQ + Geoapify Version)
// ==================================================
// Features:
// - LocationIQ (primary) + Geoapify (fallback) for forward geocoding (PH-only)
// - Autocomplete for Port of Origin and Port of Delivery (always active)
// - Synchronized weight units + validation
// - Notification badge & profile setup
// - Automatic field name mapping for backend

document.addEventListener("DOMContentLoaded", () => {
  // ---------- CONFIG ----------
  const API_BASE = "https://cargosmarttsl-5.onrender.com";
  const LOCATIONIQ_TOKEN = "pk.cb06d9dc8a074f0eab5d70fb8a492649";
  const GEOAPIFY_KEY = "e5e95eba533c4eb69344256d49166905";

  const form = document.getElementById("bookingForm");
  const submitButton = form?.querySelector('button[type="submit"]');
  let isSubmitting = false;

  const grossInput = document.getElementById("grossWeight");
  const netInput = document.getElementById("netWeight");
  const grossUnit = document.getElementById("grossWeightUnit");
  const packagesInput = document.getElementById("numPackages");
  const netUnit = document.getElementById("netWeightUnit");
  const shipperInput = document.querySelector('input[name="shipper"]');
  const deliveryType = document.getElementById("deliveryType");
  const serviceType = document.getElementById("serviceType");
  const deliveryMode = document.getElementById("deliveryMode");
  const specificInput = document.getElementById("specificLocationInput");

  const originInput = document.getElementById("portOriginInput");
  const originList = document.getElementById("portOriginList");
  const deliveryInput = document.getElementById("portDeliveryInput");
  const deliveryList = document.getElementById("portDeliveryList");

  let originSelected = null;
  let deliverySelected = null;

  // ------------------------------------------------
  // NEW: SHOW/HIDE CONTAINER SIZE FOR FCL / LCL
  // ------------------------------------------------
  function toggleContainerSize() {
    const wrapper = document.getElementById("containerSizeWrapper");
    if (!wrapper) return; // wrapper not present on this page
    if (!deliveryMode) return;

    if (deliveryMode.value === "FCL" || deliveryMode.value === "LCL") {
      wrapper.style.display = "block";
    } else {
      wrapper.style.display = "none";
      document
        .querySelectorAll('input[name="containerSize"]')
        .forEach((r) => (r.checked = false));
    }
  }
  deliveryMode?.addEventListener("change", toggleContainerSize);

  // ---------- UTILITIES ----------
  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function safe(el, cb) {
    if (el) cb(el);
  }

  // ---------- GEOAPIFY AUTOCOMPLETE + LOCATIONIQ FALLBACK ----------
  async function geocodeSearch(query, limit = 6) {
    if (!query || !query.trim()) return [];

    const geoapifyUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
      query
    )}&filter=countrycode:ph&limit=${limit}&apiKey=${GEOAPIFY_KEY}`;
    const locationiqUrl = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_TOKEN}&q=${encodeURIComponent(
      query
    )}&countrycodes=ph&format=json&limit=${limit}`;

    let results = [];

    try {
      const geoRes = await fetch(geoapifyUrl);
      if (geoRes.ok) {
        const data = await geoRes.json();
        if (data.features?.length > 0) {
          results = data.features.map((f) => ({
            display_name: f.properties.formatted,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            type: f.properties.result_type || "Address",
            source: "Geoapify",
          }));
        }
      }
    } catch (err) {
      console.error("Geoapify autocomplete failed:", err);
    }

    if (results.length === 0) {
      try {
        const locRes = await fetch(locationiqUrl);
        if (locRes.ok) {
          const data = await locRes.json();
          if (Array.isArray(data) && data.length > 0) {
            results = data.map((loc) => ({
              display_name: loc.display_name,
              lat: parseFloat(loc.lat),
              lon: parseFloat(loc.lon),
              type: loc.type || "Address",
              source: "LocationIQ",
            }));
          }
        }
      } catch (err) {
        console.error("LocationIQ fallback failed:", err);
      }
    }

    return results;
  }

  // ---------- AUTOCOMPLETE ----------
  function createItemNode(display_name, raw) {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.innerHTML = `
      <div><strong>${display_name}</strong></div>
      <small style="color:#0077b6;font-weight:500;">${raw.source}</small>`;
    div.dataset.lat = raw.lat;
    div.dataset.lon = raw.lon;
    div.dataset.raw = JSON.stringify(raw);
    return div;
  }

  function showList(container, items) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML =
        '<div class="autocomplete-noresults">No results found</div>';
      container.style.display = "block";
      return;
    }
    items.forEach((it) =>
      container.appendChild(createItemNode(it.display_name, it))
    );
    container.style.display = "block";
  }

  function hideList(container) {
    container.style.display = "none";
    container.innerHTML = "";
  }

  function attachAutocomplete({ inputEl, listEl, setSelected }) {
    if (!inputEl || !listEl) return;
    let results = [];
    let focused = -1;

    inputEl.addEventListener("keydown", async (ev) => {
      const items = listEl.querySelectorAll(".autocomplete-item");

      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!items.length) return;
        focused =
          ev.key === "ArrowDown"
            ? Math.min(focused + 1, items.length - 1)
            : Math.max(focused - 1, 0);
        items.forEach((it, i) => it.classList.toggle("focused", i === focused));
        items[focused].scrollIntoView({ block: "nearest" });
        return;
      }

      if (ev.key === "Enter") {
        ev.preventDefault();

        if (focused >= 0 && items[focused]) {
          items[focused].click();
          return;
        }

        const val = inputEl.value.trim();
        if (val.length >= 2) {
          const data = await geocodeSearch(val, 1);
          if (data.length > 0) {
            const loc = data[0];
            inputEl.value = loc.display_name;
            inputEl.dataset.lat = loc.lat;
            inputEl.dataset.lon = loc.lon;
            setSelected(loc);
          } else {
            alert("Could not find coordinates for this location.");
          }
        }
        hideList(listEl);
      }
    });

    listEl.addEventListener("click", (ev) => {
      const item = ev.target.closest(".autocomplete-item");
      if (!item) return;
      const raw = JSON.parse(item.dataset.raw);
      inputEl.value = raw.display_name;
      inputEl.dataset.lat = raw.lat;
      inputEl.dataset.lon = raw.lon;
      setSelected(raw);
      hideList(listEl);
    });

    const search = debounce(async () => {
      const q = inputEl.value.trim();
      if (!q || q.length < 2) {
        hideList(listEl);
        return;
      }
      results = await geocodeSearch(q);
      showList(listEl, results);
    }, 300);

    inputEl.addEventListener("input", search);
    inputEl.addEventListener("focus", () => {
      if (results.length) showList(listEl, results);
    });
    inputEl.addEventListener("blur", () =>
      setTimeout(() => hideList(listEl), 150)
    );
  }

  attachAutocomplete({
    inputEl: originInput,
    listEl: originList,
    setSelected: (p) => (originSelected = p),
  });

  attachAutocomplete({
    inputEl: deliveryInput,
    listEl: deliveryList,
    setSelected: (p) => (deliverySelected = p),
  });

  // ---------- SERVICE TYPE ----------
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
    if (!deliveryType || !serviceType) return;
    const selectedMode = deliveryType.value;
    const services = serviceMap[selectedMode] || [];

    serviceType.innerHTML = '<option value="">Select Service</option>';
    services.forEach((service) => {
      const opt = document.createElement("option");
      opt.value = service;
      opt.textContent = service;
      serviceType.appendChild(opt);
    });
  }

  deliveryType?.addEventListener("change", updateServiceType);
  updateServiceType();

  // ---------- WEIGHT VALIDATION ----------
  function validateWeights() {
    const gross = parseFloat(grossInput?.value);
    const net = parseFloat(netInput?.value);
    const grossU = grossUnit?.value;
    const netU = netUnit?.value;

    let message = "";

    if (grossInput.value.trim() === "" || netInput.value.trim() === "") {
      grossInput.classList.remove("is-invalid");
      netInput.classList.remove("is-invalid");
      showWeightMessage("");
      return;
    }

    if (isNaN(gross) || isNaN(net)) {
      message = "Please enter valid numerical weights.";
    } else if (gross < 0 || net < 0) {
      message = "Weights cannot be negative.";
    } else if (gross <= net) {
      message = "Gross weight must be greater than Net weight.";
    } else if (grossU && netU && grossU !== netU) {
      message = "Gross and Net weight units must match.";
    }

    if (message) {
      grossInput.classList.add("is-invalid");
      netInput.classList.add("is-invalid");
      showWeightMessage(message);
    } else {
      grossInput.classList.remove("is-invalid");
      netInput.classList.remove("is-invalid");
      showWeightMessage("");
    }
  }

  [grossInput, netInput].forEach((field) => {
    if (!field) return;

    field.addEventListener("input", () => {
      let raw = field.value;

      if (raw.includes("-")) {
        raw = raw.replace("-", "");
        field.value = raw;
      }

      validateWeights();
    });
  });

  [grossInput, netInput, grossUnit, netUnit].forEach((el) =>
    safe(el, (e) => e.addEventListener("input", validateWeights))
  );

  if (grossUnit) {
    grossUnit.addEventListener("change", () => {
      if (grossUnit.value) grossUnit.classList.remove("is-invalid");
    });
  }

  if (netUnit) {
    netUnit.addEventListener("change", () => {
      if (netUnit.value) netUnit.classList.remove("is-invalid");
    });
  }

  function syncWeightUnits(changedEl) {
    if (!grossUnit || !netUnit) return;
    if (changedEl === grossUnit && grossUnit.value)
      netUnit.value = grossUnit.value;
    if (changedEl === netUnit && netUnit.value) grossUnit.value = netUnit.value;
    validateWeights();
  }

  [grossUnit, netUnit].forEach((unitEl) =>
    safe(unitEl, (el) =>
      el.addEventListener("change", () => syncWeightUnits(el))
    )
  );

  /* ================== PROFILE + NOTIFICATIONS ================== */

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
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  }

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

  /* ================== PROFILE DROPDOWN ================== */

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

  /* Floating Notification Panel Toggle */
  document.addEventListener("click", (e) => {
    const notifBtn = document.getElementById("notificationsLink");
    const notifPanel = document.getElementById("notificationsFloat");
    if (!notifBtn || !notifPanel) return;

    if (notifBtn.contains(e.target)) {
      e.preventDefault();
      notifPanel.style.display =
        notifPanel.style.display === "block" ? "none" : "block";
    } else if (!notifPanel.contains(e.target)) {
      notifPanel.style.display = "none";
    }
  });

  document.getElementById("closeNotif")?.addEventListener("click", () => {
    const notifPanel = document.getElementById("notificationsFloat");
    if (notifPanel) notifPanel.style.display = "none";
  });

  // ---------- GENERAL EMPTY / ZERO VALIDATION ----------
  const requiredInputs = document.querySelectorAll(
    "#bookingForm input[required], #bookingForm select[required]"
  );

  function markRequiredField(field) {
    const value = field.value.trim();

    if (value === "" || value === "0" || value === 0) {
      field.classList.add("is-invalid");
    } else {
      field.classList.remove("is-invalid");
    }
  }

  function validateRequiredFields() {
    let isValid = true;

    requiredInputs.forEach((field) => {
      markRequiredField(field);
      if (field.classList.contains("is-invalid")) isValid = false;
    });

    return isValid;
  }

  requiredInputs.forEach((field) => {
    field.addEventListener("blur", () => markRequiredField(field));
    field.addEventListener("input", () => markRequiredField(field));
  });

  // ---------- FORM SUBMISSION ----------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!validateRequiredFields()) return;

      const pkg = Number(packagesInput.value);
      if (Number.isNaN(pkg) || pkg <= 0) {
        packagesInput.classList.add("is-invalid");
        showPackageMessage("Packages must be at least 1.");
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent = "Book Shipment";
        return;
      }

      if (isSubmitting) return;

      isSubmitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";

      try {
        if (!grossUnit.value || !netUnit.value) {
          if (!grossUnit.value) grossUnit.classList.add("is-invalid");
          if (!netUnit.value) netUnit.classList.add("is-invalid");

          isSubmitting = false;
          submitButton.disabled = false;
          submitButton.textContent = "Book Shipment";
          return;
        }

        if (!originInput.value.trim() || !deliveryInput.value.trim()) {
          alert("Please enter both Port of Origin and Port of Delivery.");
          return;
        }

        // ------------------------------------------
        // NEW: REQUIRE CONTAINER SIZE WHEN FCL / LCL
        // ------------------------------------------
        if (deliveryMode.value === "FCL" || deliveryMode.value === "LCL") {
          const selectedSize = document.querySelector(
            'input[name="containerSize"]:checked'
          );

          if (!selectedSize) {
            const sizeError = document.getElementById("containerSizeError");
            if (sizeError) sizeError.style.display = "block";
            isSubmitting = false;
            submitButton.disabled = false;
            submitButton.textContent = "Book Shipment";
            return;
          }
        }

        const formData = new FormData(form);

        if (deliveryMode.value === "FCL" || deliveryMode.value === "LCL") {
          const selectedSize =
            document.querySelector('input[name="containerSize"]:checked')
              ?.value || "";
          formData.set("containerSize", selectedSize);
        } else {
          formData.set("containerSize", "");
        }

        formData.set("origin_lat", originInput.dataset.lat || "");
        formData.set("origin_lon", originInput.dataset.lon || "");
        formData.set("delivery_lat", deliveryInput.dataset.lat || "");
        formData.set("delivery_lon", deliveryInput.dataset.lon || "");

        const res = await fetch(`${API_BASE}/api/bookings`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        const result = await res.text();
        if (!res.ok) throw new Error(result);

        openModal("successModal");
        form.reset();
      } catch (err) {
        console.error("Booking submission error:", err);
        openModal("errorModal");
      } finally {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent = "Book Shipment";
      }
    });
  }

  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.href === window.location.href) link.classList.add("active");
  });

  function showPackageMessage(msg) {
    let el = document.getElementById("packageErrorText");

    if (!el) {
      el = document.createElement("div");
      el.id = "packageErrorText";
      el.style.color = "red";
      el.style.fontSize = "13px";
      el.style.marginTop = "5px";
      packagesInput.parentElement.appendChild(el);
    }

    el.textContent = msg;
  }

  if (packagesInput) {
    packagesInput.addEventListener("input", () => {
      let raw = packagesInput.value;

      if (raw.includes("-")) {
        packagesInput.classList.add("is-invalid");
        showPackageMessage("Negative values are not allowed.");
      }

      raw = raw.replace(/-/g, "").replace(/[^0-9]/g, "");
      packagesInput.value = raw;

      const num = Number(raw);

      if (!raw || num <= 0 || Number.isNaN(num)) {
        packagesInput.classList.add("is-invalid");
        showPackageMessage("Packages must be at least 1.");
      } else {
        packagesInput.classList.remove("is-invalid");
        showPackageMessage("");
      }
    });
  }

  function showWeightMessage(msg) {
    let el = document.getElementById("weightErrorText");

    if (!el) {
      el = document.createElement("div");
      el.id = "weightErrorText";
      el.style.color = "red";
      el.style.fontSize = "13px";
      el.style.marginTop = "5px";
      grossInput.parentElement.appendChild(el);
    }

    el.textContent = msg;
  }
});

// --------------------------------------------------------
// NEW: EDIT BOOKING — CONTAINER SIZE HANDLING
// --------------------------------------------------------
function toggleEditContainerSize() {
  const wrapper = document.getElementById("edit_containerSizeWrapper");
  const mode = document.getElementById("edit_deliveryMode");

  if (!mode || !wrapper) return;

  if (mode.value === "FCL" || mode.value === "LCL") {
    wrapper.style.display = "block";
  } else {
    wrapper.style.display = "none";
    document
      .querySelectorAll('input[name="edit_containerSize"]')
      .forEach((r) => (r.checked = false));
  }
}

document
  .getElementById("edit_deliveryMode")
  ?.addEventListener("change", toggleEditContainerSize);

// ---------- MODAL HELPERS ----------
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "auto";
}
