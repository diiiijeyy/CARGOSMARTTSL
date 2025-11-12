//CONFIGURATION

const API_BASE_URL = "https://caiden-recondite-psychometrically.ngrok-free.dev";

// ========================
// POPULATE READ-ONLY PROFILE CARD & IMAGE
// ========================
function populateProfileCard(data) {
  const cardFields = {
    viewCompanyName: data.company_name,
    viewContactPerson: data.contact_person,
    viewContactNumber: data.contact_number,
    viewEmail: data.email,
    viewAddress: data.address,
  };

  for (const id in cardFields) {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.value = cardFields[id] || "";
      } else {
        el.textContent = cardFields[id] || "";
      }
    }
  }

  const imgDiv = document.querySelector(".profile-image");
  if (imgDiv) {
    imgDiv.innerHTML = data.photo
      ? `<img src="https://caiden-recondite-psychometrically.ngrok-free.dev/uploads/${data.photo}" 
          alt="Profile Photo" 
          class="img-fluid rounded-circle" 
          style="width:150px;height:150px;object-fit:cover;border-radius:50%;">`
      : `<i class="fa-solid fa-user fa-5x text-secondary"></i>`;
  }
}

// ========================
// LOAD PROFILE DATA
// ========================
async function loadProfile() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile",
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (res.status === 401) {
      return showStatusModal(
        "Session Expired",
        "Please log in again.",
        "warning",
        () => (window.location.href = "../../login.html")
      );
    }

    if (!res.ok) throw new Error(`Failed to fetch profile (${res.status})`);

    const data = await res.json();
    console.log("Fetched profile:", data);

    const inputs = {
      companyNameInput: data.company_name,
      contactPersonInput: data.contact_person,
      contactNumberInput: data.contact_number,
      emailInput: data.email,
      addressInput: data.address,
    };

    for (const id in inputs) {
      const el = document.getElementById(id);
      if (el) el.value = inputs[id] || "";
    }

    populateProfileCard(data);

    // === Update Username in Navbar ===
    const usernameEl = document.getElementById("username");
    if (usernameEl) usernameEl.textContent = data.contact_person || "Client";

    // === Update Profile Icon in Navbar ===
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
    showStatusModal(
      "Error",
      "Could not load profile. Please try again.",
      "error"
    );
  }
}

// ===============================
// 🔔 LOAD NOTIFICATION COUNT (Dashboard Badge Only)
// ===============================
async function loadNotificationCount() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/notifications",
      {
        credentials: "include",
      }
    );

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
    console.error("❌ Error fetching notification count:", err);
  }
}

setInterval(loadNotificationCount, 30000);
// ========================
// UPDATE PROFILE
// ========================
async function saveProfile(e) {
  e.preventDefault();

  const password = document.getElementById("passwordInput").value.trim();
  if (!password) {
    return showStatusModal(
      "Error",
      "Please enter your current password to update profile.",
      "error"
    );
  }

  const payload = {
    company_name: document.getElementById("companyNameInput").value,
    contact_person: document.getElementById("contactPersonInput").value,
    contact_number: document.getElementById("contactNumberInput").value,
    email: document.getElementById("emailInput").value,
    address: document.getElementById("addressInput").value,
    password,
  };

  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }
    );

    if (res.status === 401) {
      return showStatusModal(
        "Session Expired",
        "Please log in again.",
        "warning",
        () => (window.location.href = "../../login.html")
      );
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update profile");

    closeModal("editModal");
    showStatusModal(
      "Success",
      "Profile updated successfully.",
      "success",
      () => {
        if (data.user) {
          populateProfileCard(data.user);
        } else {
          loadProfile();
        }
      }
    );
  } catch (err) {
    showStatusModal("Error", err.message, "error");
  }
}

// ========================
// REMOVE PHOTO
// ========================
async function removePhoto() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile/photo",
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    if (res.status === 401) {
      return showStatusModal(
        "Session Expired",
        "Please log in again.",
        "warning",
        () => (window.location.href = "../../login.html")
      );
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Remove failed");

    closeModal("photoModal");
    showStatusModal("Success", "Photo removed successfully.", "success", () => {
      // ✅ Reload the page after clicking OK
      window.location.reload();
    });
  } catch (err) {
    showStatusModal("Error", err.message, "error");
  }
}

// ========================
// UPLOAD PHOTO (Improved UX)
// ========================
async function uploadPhoto() {
  const fileInput = document.getElementById("uploadPhoto");
  const file = fileInput.files[0];

  if (!file) {
    return showStatusModal("Error", "Please select a photo first.", "warning");
  }

  // Prevent accidental reload if inside a form
  if (fileInput.closest("form")) {
    fileInput
      .closest("form")
      .addEventListener("submit", (e) => e.preventDefault());
  }

  // ✅ Optional: show temporary loading message in modal
  const modal = document.getElementById("photoModal");
  const originalContent = modal.querySelector(".modal-content").innerHTML;
  modal.querySelector(".modal-content").innerHTML = `
    <div class="text-center p-4">
      <h5 class="mb-3">Uploading Photo...</h5>
      <div class="spinner-border text-primary" role="status"></div>
    </div>
  `;

  const formData = new FormData();
  formData.append("photo", file);

  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile/photo",
      {
        method: "POST",
        credentials: "include",
        body: formData,
      }
    );

    const data = await res.json();

    if (res.status === 401) {
      closeModal("photoModal");
      return showStatusModal(
        "Session Expired",
        "Please log in again.",
        "warning",
        () => (window.location.href = "../../login.html")
      );
    }

    if (!res.ok) throw new Error(data.error || "Upload failed");

    // ✅ Restore modal content before closing
    modal.querySelector(".modal-content").innerHTML = originalContent;

    // Close photo modal after small delay for UX
    setTimeout(() => {
      closeModal("photoModal");

      // ✅ Show success modal AFTER upload done
      showStatusModal(
        "Success",
        "Photo uploaded successfully.",
        "success",
        () => {
          if (data.user) {
            populateProfileCard(data.user);
          } else {
            loadProfile();
          }
        }
      );
    }, 500);
  } catch (err) {
    modal.querySelector(".modal-content").innerHTML = originalContent;
    showStatusModal("Error", err.message, "error");
  }
}

// ========================
// CHANGE PASSWORD
// ========================
async function changePassword(e) {
  e.preventDefault();
  const form = e.target;

  const oldPassword = form
    .querySelector("input[name='oldPassword']")
    .value.trim();
  const newPassword = form
    .querySelector("input[name='newPassword']")
    .value.trim();
  const confirmPassword = form
    .querySelector("input[name='confirmPassword']")
    .value.trim();

  if (!oldPassword || !newPassword || !confirmPassword) {
    return showStatusModal("Error", "All fields are required.", "error");
  }

  if (newPassword !== confirmPassword) {
    return showStatusModal(
      "Error",
      "New password and confirmation do not match.",
      "error"
    );
  }

  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/profile/password",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword }),
      }
    );

    if (res.status === 401) {
      return showStatusModal(
        "Session Expired",
        "Please log in again.",
        "warning",
        () => (window.location.href = "../../login.html")
      );
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Password change failed");

    closeModal("changePasswordModal");
    showStatusModal("Success", "Password updated successfully.", "success");
    form.reset();
  } catch (err) {
    showStatusModal("Error", err.message, "error");
  }
}

// ========================
// STATUS MODAL HANDLER (custom card modals)
// ========================
function showStatusModal(title, message, type = "success", onOk = null) {
  const modalId =
    type === "success"
      ? "successModal"
      : type === "error"
      ? "errorModal"
      : "warningModal";

  const modal = document.getElementById(modalId);
  if (!modal) return;

  // update text
  modal.querySelector("h2").textContent = title;
  modal.querySelector("p").textContent = message;

  // show modal
  modal.classList.add("show");

  // bind OK button
  const okBtn = modal.querySelector(".ok-btn");
  okBtn.onclick = () => {
    modal.classList.remove("show");
    if (onOk) onOk();
  };
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("show");
}

// ========================
// INIT
// ========================
document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelector("#editModal form")
    ?.addEventListener("submit", saveProfile);
  document
    .querySelector("#changePasswordModal form")
    ?.addEventListener("submit", changePassword);

  document
    .querySelector("#uploadPhotoBtn")
    ?.addEventListener("click", uploadPhoto);
  document
    .querySelector("#removePhotoBtn")
    ?.addEventListener("click", removePhoto);
  document
    .querySelector("#changePasswordForm")
    ?.addEventListener("submit", changePassword);

  loadProfile();
  loadNotificationCount();
});

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("show");
    modal.style.display = "block"; // 🔧 use block to remove gap
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
}

function openEditModal() {
  openModal("editModal");
}
function openPhotoModal() {
  openModal("photoModal");
}
function openPasswordModal() {
  openModal("changePasswordModal");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".exit, .close-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      if (modal) {
        modal.classList.remove("show");
        modal.style.display = "none";
      }
    });
  });
});

window.addEventListener("click", (event) => {
  document.querySelectorAll(".modal.show").forEach((modal) => {
    if (event.target === modal) {
      modal.classList.remove("show");
      modal.style.display = "none";
    }
  });
});

// ===================== DOMContentLoaded ===================== //
document.addEventListener("DOMContentLoaded", async () => {
  const body = document.querySelector("body");
  const sidebar = body.querySelector("nav");
  const sidebarToggle = body.querySelector(".sidebar-toggle");
  const statusKey = "sidebar-status";

  function applySidebarState(state) {
    if (state === "close") {
      sidebar.classList.add("close");
      body.classList.add("sidebar-close");
    } else {
      sidebar.classList.remove("close");
      body.classList.remove("sidebar-close");
    }
  }

  let savedStatus = localStorage.getItem(statusKey);
  if (!savedStatus) {
    applySidebarState(window.innerWidth <= 768 ? "close" : "open");
    localStorage.setItem(
      statusKey,
      window.innerWidth <= 768 ? "auto-close" : "auto-open"
    );
  } else {
    applySidebarState(savedStatus.includes("close") ? "close" : "open");
  }

  sidebarToggle?.addEventListener("click", () => {
    const isClosing = sidebar.classList.toggle("close");
    body.classList.toggle("sidebar-close", isClosing);
    localStorage.setItem(statusKey, isClosing ? "close" : "open");
  });
  await loadProfile();
  await loadNotificationCount();

  // Current Date
  const currentDateElement = document.getElementById("current-date");
  if (currentDateElement) {
    const now = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    currentDateElement.textContent = now.toLocaleDateString("en-US", options);
  }

  // Active Nav Highlight
  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (link.href === window.location.href) link.classList.add("active");
  });

  // Hamburger Menu
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  if (hamburgerMenu && sidebar) {
    hamburgerMenu.addEventListener("click", () =>
      sidebar.classList.toggle("active")
    );
    document.addEventListener("click", (e) => {
      if (!sidebar.contains(e.target) && !hamburgerMenu.contains(e.target))
        sidebar.classList.remove("active");
    });
  }

  // Preloader
  const preloader = document.getElementById("preloader");
  if (preloader) {
    preloader.style.opacity = "0";
    preloader.style.visibility = "hidden";
    setTimeout(() => preloader.remove(), 600);
  }
});

// ===================== Reload Profile on Page Return ===================== //
window.addEventListener("pageshow", () => {
  loadProfile();
});
