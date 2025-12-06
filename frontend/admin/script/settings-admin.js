// =======================
// Notifications System
// =======================
function ensureNotificationModal() {
  if (document.getElementById("notificationModal")) return;
  const modalHTML = `
    <div class="modal fade" id="notificationModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:520px;width:92%;">
        <div class="modal-content border-0 shadow-sm">
          <div class="modal-body p-3 rounded d-flex align-items-center gap-3" 
               id="notificationBody" 
               style="background:#0077b6;color:#fff;">
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

function showNotification({ variant = "info", title, message }) {
  ensureNotificationModal();

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
  }, 2000);
}

async function fetchNotifications() {
  try {
    const res = await fetch("https://cargosmarttsl-1.onrender.com/api/admin/notifications", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    const notifCountEl = document.getElementById("notifCount");
    if (!notifCountEl) return;

    // ✅ Only count unread
    const unreadCount = notifications.filter((n) => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0";
      notifCountEl.style.display = "none"; // hide badge when empty
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

// =======================
// Super Admin Signature (Upload + Draw + Save + Notifications)
// =======================
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("signatureUpload");
  const preview = document.getElementById("signaturePreview");
  const canvas = document.getElementById("signaturePad");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const clearBtn = document.getElementById("clearSignature");
  const saveBtn = document.getElementById("saveSignature");

  let drawing = false;

  // -------------------- Upload Signature -------------------- //
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.src = ev.target.result;
          localStorage.setItem("adminSignature", ev.target.result);
          showNotification({
            variant: "success",
            title: "Uploaded",
            message: "Signature uploaded successfully.",
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // -------------------- Draw Signature -------------------- //
  if (canvas && ctx) {
    canvas.addEventListener("mousedown", () => {
      drawing = true;
      ctx.beginPath();
    });

    canvas.addEventListener("mouseup", () => {
      drawing = false;
      ctx.beginPath();
    });

    canvas.addEventListener("mousemove", draw);
  }

  function draw(e) {
    if (!drawing || !ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  // -------------------- Clear Signature -------------------- //
  if (clearBtn && ctx) {
    clearBtn.addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      preview.src = "";
      localStorage.removeItem("adminSignature");
      showNotification({
        variant: "warning",
        title: "Cleared",
        message: "Signature cleared.",
      });
    });
  }

  if (saveBtn && ctx) {
    saveBtn.addEventListener("click", async () => {
      const signatureData = canvas.toDataURL("image/png");
      preview.src = signatureData;
      localStorage.setItem("adminSignature", signatureData);

      showNotification({
        variant: "success",
        title: "Saved",
        message: "Signature saved successfully.",
      });

      // NEW ✔ Success Modal
      showSuccessModal();

      // OPTIONAL backend notification
      try {
        await fetch("https://cargosmarttsl-1.onrender.com/api/admin/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "signature",
            message: "Super Admin updated their signature",
          }),
        });
      } catch (err) {
        console.error("Failed to log signature notification:", err);
      }
    });
  }

  // -------------------- Load Saved Signature -------------------- //
  const saved = localStorage.getItem("adminSignature");
  if (saved) {
    preview.src = saved;
  }

  // 🔔 Start polling
  fetchNotifications();
  setInterval(fetchNotifications, 30000);
});

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

function showSuccessModal() {
  const modal = new bootstrap.Modal(document.getElementById("successModal"));
  modal.show();

  setTimeout(() => {
    const inst = bootstrap.Modal.getInstance(
      document.getElementById("successModal")
    );
    if (inst) inst.hide();
  }, 2000);
}

// 🔥 GLOBAL AUTO-HOOK FOR ALL SAVE BUTTONS
document.addEventListener("click", (e) => {
  if (e.target.closest(".save-changes")) {
    showSuccessModal();
  }
});
