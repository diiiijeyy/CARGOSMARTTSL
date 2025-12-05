document.addEventListener("DOMContentLoaded", () => {
  loadDriverProfile();
});

/* ============================
    LOAD DRIVER PROFILE
=============================== */
async function loadDriverProfile() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/driver/profile",
      { credentials: "include" }
    );

    if (!res.ok) {
      console.error("Failed to load profile", res.status);
      return;
    }

    const data = await res.json();

    // Fill fields
    document.getElementById("driverFirstName").value = data.first_name || "";
    document.getElementById("driverLastName").value = data.last_name || "";
    document.getElementById("driverEmail").value = data.email || "";
    document.getElementById("driverContact").value = data.phone || "";

    // Display name
    document.getElementById("driverDisplayName").textContent =
      `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.email;

    // Avatar letter
    const letter = (data.first_name || data.email || "D").charAt(0).toUpperCase();
    document.getElementById("driverAvatar").textContent = letter;

  } catch (err) {
    console.error("Profile load error:", err);
  }
}

/* ============================
      SAVE PROFILE
=============================== */
async function saveProfile() {
  const body = {
    first_name: document.getElementById("driverFirstName").value.trim(),
    last_name: document.getElementById("driverLastName").value.trim(),
    email: document.getElementById("driverEmail").value.trim(),
    phone: document.getElementById("driverContact").value.trim()
  };

  if (!body.email) {
    alert("Email is required.");
    return;
  }

  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/driver/profile",
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to update profile.");
      return;
    }

    alert("Profile updated successfully.");
    loadDriverProfile();

  } catch (err) {
    console.error("Profile update error:", err);
  }
}

/* ============================
      CHANGE PASSWORD
=============================== */
async function changePassword() {
  const oldPass = document.getElementById("oldPass").value;
  const newPass = document.getElementById("newPass").value;

  if (!oldPass || !newPass) {
    alert("Please enter both current and new password.");
    return;
  }

  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/driver/password",
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPass, newPass }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Password update failed.");
      return;
    }

    alert("Password updated successfully!");

    document.getElementById("oldPass").value = "";
    document.getElementById("newPass").value = "";

  } catch (err) {
    console.error("Password change error:", err);
  }
}