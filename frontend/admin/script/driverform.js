document.addEventListener("DOMContentLoaded", () => {
  /* =================== Notifications =================== */
  const notifCountEl = document.getElementById("notifCount");

  async function fetchNotifications() {
    try {
      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/admin/notifications",
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

  /* =================== Driver Form =================== */
  const form = document.getElementById("createDriverForm");
  if (!form) {
    console.error("Form not found: createDriverForm");
    return;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const firstNameEl = document.getElementById("firstName");
    const lastNameEl = document.getElementById("lastName");
    const emailEl = document.getElementById("email");
    const phoneEl = document.getElementById("phone");

    const firstName = firstNameEl.value.trim();
    const lastName = lastNameEl.value.trim();
    const email = emailEl.value.trim();
    const phone = phoneEl.value.trim();

    let isValid = true;

    // Reset borders
    [firstNameEl, lastNameEl, emailEl, phoneEl].forEach((el) => {
      el.style.border = "1px solid #ced4da";
    });

    if (!firstName) {
      firstNameEl.style.border = "2px solid red";
      isValid = false;
    }
    if (!lastName) {
      lastNameEl.style.border = "2px solid red";
      isValid = false;
    }
    if (!email) {
      emailEl.style.border = "2px solid red";
      isValid = false;
    }
    if (!phone) {
      phoneEl.style.border = "2px solid red";
      isValid = false;
    }

    if (phone && !/^\d+$/.test(phone)) {
      phoneEl.style.border = "2px solid red";
      alert("Phone number must contain digits only.");
      return;
    }

    if (!isValid) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showSuccessModal(
          "Driver Created",
          "A new driver has been added successfully."
        );
        form.reset();
      } else {
        alert(data.error || "Something went wrong.");
      }
    } catch (err) {
      console.error("Request error:", err);
      alert("Network error.");
    }
  });

  // Phone restrict
  const phoneInput = document.getElementById("phone");
  if (phoneInput) {
    phoneInput.addEventListener("input", function () {
      this.value = this.value.replace(/[^\d]/g, "");
    });
  }
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
