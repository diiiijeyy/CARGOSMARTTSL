/* =================== Client Dashboard =================== */
async function loadDashboard() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/dashboard", {
      credentials: "include"
    });
    if (!res.ok) throw new Error("Failed to fetch dashboard data");

    const data = await res.json();

    // Update stats
    const totalBookingsEl = document.querySelector('[data-stat="total_bookings"]');
    const airFreightEl = document.querySelector('[data-stat="air_freight"]');
    const seaFreightEl = document.querySelector('[data-stat="sea_freight"]');
    const pendingClientBookingsEl = document.querySelector('[data-stat="pendingclient_bookings"]');
    const pendingShipmentsEl = document.querySelector('[data-stat="pending_shipments"]');

    if (totalBookingsEl) animateCounter(totalBookingsEl, data.totalBookings || 0);
    if (airFreightEl) animateCounter(airFreightEl, data.airFreight || 0);
    if (seaFreightEl) animateCounter(seaFreightEl, data.seaFreight || 0);
    if (pendingClientBookingsEl) animateCounter(pendingClientBookingsEl, data.pendingShipments || 0);
    if (pendingShipmentsEl) animateCounter(pendingShipmentsEl, data.pendingShipments || 0);

    updateDescriptiveAnalysis({
      totalBookings: data.totalBookings,
      airFreight: data.airFreight,
      seaFreight: data.seaFreight,
      pendingShipments: data.pendingShipments,
      totalRevenue: data.totalRevenue,
      mostCommonFreight: data.mostCommonFreight,
      monthlyBookings: data.monthlyBookings
    });

    updateRecentBookingsTable(data.bookings);
  } catch (err) {
    console.error("Dashboard fetch error:", err);
  }
}

/* =================== Load Profile =================== */
async function loadProfile() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/v1/user/profile", {
      method: "GET",
      credentials: "include"
    });
    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();

    const username = data.contact_person || "Client";

    const usernameEls = [
      document.getElementById("username"),
      document.getElementById("usernameWelcome")
    ];
    usernameEls.forEach(el => {
      if (el) el.textContent = username;
    });

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
    console.error("Error loading profile:", err);
  }
}

/* =================== Notification Count =================== */
async function loadNotificationCount() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/notifications", {
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to fetch notifications (${res.status})`);

    const notifications = await res.json();
    if (!Array.isArray(notifications)) return;

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const notifCountEl = document.getElementById("notifCount");
    if (notifCountEl) {
      notifCountEl.textContent = unreadCount > 0 ? unreadCount : "";
      notifCountEl.style.display = unreadCount > 0 ? "inline-block" : "none";
    }

  } catch (err) {
    console.error(" Error fetching notification count:", err);
  }
}

setInterval(loadNotificationCount, 3000);

/* =================== Descriptive Analysis =================== */
function updateDescriptiveAnalysis(data) {
  const totalBookingsEl = document.getElementById("analysis-total-bookings");
  const avgMonthlyEl = document.getElementById("analysis-average-monthly");
  const mostCommonEl = document.getElementById("analysis-most-common");
  const pendingRatioEl = document.getElementById("analysis-pending-ratio");
  const revenueEl = document.getElementById("analysis-revenue");

  const totalBookings = data.totalBookings || 0;
  const air = data.airFreight || 0;
  const sea = data.seaFreight || 0;
  const pending = data.pendingShipments || 0;
  const monthly = data.monthlyBookings || [];
  const totalRevenue = data.totalRevenue || 0;

  if (totalBookingsEl) totalBookingsEl.textContent = `Total Bookings: ${totalBookings}`;
  if (avgMonthlyEl) {
    const avgMonthly = monthly.length > 0
      ? (monthly.reduce((a, b) => a + b, 0) / monthly.length).toFixed(1)
      : 0;
    avgMonthlyEl.textContent = `Average Monthly Bookings: ${avgMonthly}`;
  }
  if (mostCommonEl) {
    const mostCommon = air > sea ? "Air Freight" : sea > air ? "Sea Freight" : "Equal";
    mostCommonEl.textContent = `Most Common Freight Type: ${mostCommon}`;
  }
  if (pendingRatioEl) {
    const pendingRatio = totalBookings ? ((pending / totalBookings) * 100).toFixed(1) : 0;
    pendingRatioEl.textContent = `Pending Shipments Ratio: ${pendingRatio}%`;
  }
  if (revenueEl) revenueEl.textContent = `Total Revenue: $${totalRevenue.toLocaleString()}`;
}

/* =================== Status Badge Helper =================== */
function getStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case "pending": return "bg-warning text-dark";
    case "approved": return "bg-success";
    case "declined": return "bg-danger";
    case "shipping": return "bg-shipping";
    default: return "bg-secondary";
  }
}

let allBookings = [];
let showingAll = false;

/* =================== Update Recent Bookings =================== */
function updateRecentBookingsTable(bookings, limitToFive = true) {
  const tableBody = document.querySelector('[data-table="recentBookings"]');
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const filteredBookings = bookings?.filter(
    b => ["approved", "pending", "declined", "decline"].includes(b.status?.toLowerCase().trim())
  ) || [];

  if (filteredBookings.length === 0) {
    tableBody.innerHTML =
      `<tr><td colspan="7" class="text-center py-4">No approved, pending, or declined bookings.</td></tr>`;
    return;
  }

  const displayBookings = limitToFive ? filteredBookings.slice(0, 5) : filteredBookings;

  displayBookings.forEach(booking => {
    const status = booking.status?.toLowerCase().trim() || "-";
    const isDeclined = status === "declined" || status === "decline";

    const declineReason = isDeclined
      ? `<span class="text-danger small">${booking.decline_reason || "No reason provided"}</span>`
      : `<span class="text-muted small">—</span>`;

    const actionButtons = `
      <div class="action-buttons d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary edit-booking-btn" data-id="${booking.id}">
          <i class="fas fa-edit"></i>
        </button>
        ${
          !isDeclined
            ? `<button class="btn btn-sm btn-outline-danger cancel-booking-btn" data-id="${booking.id}" data-tracking="${booking.tracking_number || ''}">
                <i class="fas fa-times"></i>
              </button>`
            : ""
        }
      </div>
    `;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${booking.tracking_number || booking.id || "-"}</td>
      <td>${booking.route || "-"}</td>
      <td>${booking.service_type || "-"}</td>
      <td><span class="badge ${getStatusBadge(status)}">${booking.status || "-"}</span></td>
      <td>${booking.created_at ? new Date(booking.created_at).toLocaleDateString() : "-"}</td>
      <td>${declineReason}</td>
      <td>${actionButtons}</td>
    `;

    tableBody.appendChild(row);
  });
}

/* =================== View All Button =================== */
document.addEventListener("DOMContentLoaded", () => {
  const viewAllBtn = document.querySelector(".view-all-btn");

  if (viewAllBtn) {
    viewAllBtn.addEventListener("click", () => {
      window.location.href = "bookings.html";
    });
  }
});


/* =================== Export Booking Trends =================== */
async function exportBookingTrendsToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  const pageWidth = doc.internal.pageSize.getWidth();
  const year = new Date().getFullYear();
  const filterText = `Booking Trends Report • ${year}`;

  doc.setFillColor(96, 173, 244);
  doc.rect(0, 0, pageWidth, 25, "F");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(255);
  doc.setFontSize(15);
  doc.text("TSL Freight Movers Inc.", 14, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Monthly Booking Trends", 14, 22);

  doc.setTextColor(0, 55, 128);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Dashboard Report", 14, 38);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(filterText, 14, 44);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 50);

  const chartCanvas = document.getElementById("bookingTrendsChart");
  const chartInstance = Chart.getChart(chartCanvas);
  if (!chartInstance) return;

  const labels = chartInstance.data.labels;
  const values = chartInstance.data.datasets[0].data;
  const total = values.reduce((a, b) => a + Number(b || 0), 0);
  const tableBody = labels.map((label, i) => [i + 1, label, values[i]]);
  doc.autoTable({
    startY: 58,
    head: [["#", "Month", "Bookings"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [96, 173, 244],
      textColor: 255,
      halign: "center",
      fontStyle: "bold",
    },
    bodyStyles: {
      halign: "center",
      textColor: [40, 40, 40],
    },
    alternateRowStyles: { fillColor: [245, 250, 255] },
    styles: { fontSize: 11, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { cellWidth: 40 },
    },
  });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 55, 128);
  doc.setFontSize(12);
  doc.text(`Total Bookings: ${total.toLocaleString()}`, 14, doc.lastAutoTable.finalY + 10);

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text("CARGOSMART: Shipment Tracking System with Data Analytics", 14, pageHeight - 10);

  doc.save(`TSL_Booking_Trends_${year}.pdf`);
}

/* =================== DOMContentLoaded =================== */
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
    localStorage.setItem(statusKey, window.innerWidth <= 768 ? "auto-close" : "auto-open");
  } else {
    applySidebarState(savedStatus.includes("close") ? "close" : "open");
  }

  sidebarToggle?.addEventListener("click", () => {
    const isClosing = sidebar.classList.toggle("close");
    body.classList.toggle("sidebar-close", isClosing);
    localStorage.setItem(statusKey, isClosing ? "close" : "open");
  });

// Load Dashboard and Profile
await loadDashboard();
await loadProfile();
await loadNotificationCount();
await loadRecentUpdates();

  // Current Date
  const currentDateElement = document.getElementById("current-date");
  if (currentDateElement) {
    const now = new Date();
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    currentDateElement.textContent = now.toLocaleDateString("en-US", options);
  }

  // Active Nav
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.href === window.location.href) link.classList.add('active');
  });

  // Hamburger Menu
  const hamburgerMenu = document.getElementById("hamburgerMenu");
  if (hamburgerMenu && sidebar) {
    hamburgerMenu.addEventListener("click", () => sidebar.classList.toggle("active"));
    document.addEventListener("click", e => {
      if (!sidebar.contains(e.target) && !hamburgerMenu.contains(e.target))
        sidebar.classList.remove("active");
    });
  }

/* =================== Chart Booking Trends =================== */
const chartCanvas = document.getElementById("bookingTrendsChart");
if (chartCanvas) {
  const ctx = chartCanvas.getContext("2d");

  try {
    const year = new Date().getFullYear();
    const response = await fetch(`https://caiden-recondite-psychometrically.ngrok-free.dev/api/v1/dashboard/trends?year=${year}`, {
      credentials: "include"
    });
    const monthlyBookings = await response.json();

    const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.offsetHeight);
    gradient.addColorStop(0, "rgba(96, 173, 244, 0.25)");
    gradient.addColorStop(1, "rgba(96, 173, 244, 0)");

    new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        datasets: [{
          label: "Bookings",
          data: monthlyBookings,
          fill: true,
          borderColor: "#60adf4",
          backgroundColor: gradient,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: "#60adf4",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#555", font: { size: 12 } },
            title: {
              display: true,
              text: "Month",
              color: "#555",
              font: { size: 13, weight: "500" }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.08)" },
            ticks: {
              color: "#555",
              font: { size: 12 },
              callback: v => v.toLocaleString()
            },
            title: {
              display: true,
              text: "Number of Bookings",
              color: "#555",
              font: { size: 13, weight: "500" }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#0077b6",
            bodyColor: "#023e8a",
            borderColor: "#90e0ef",
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: ctx => `${ctx.parsed.y.toLocaleString()} bookings`
            }
          }
        },
        layout: { padding: { top: 10, bottom: 10, left: 5, right: 5 } }
      }
    });
  } catch (error) {
    console.error("Error loading booking trends:", error);
  }
}

  // Preloader
  const preloader = document.getElementById("preloader");
  if (preloader) {
    preloader.style.opacity = "0";
    preloader.style.visibility = "hidden";
    setTimeout(() => preloader.remove(), 600);
  }

  handleWelcomeModal();

/* =================== Export Button =================== */
const exportBtn = document.getElementById("exportChart");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportBookingTrendsToPDF()
  });
}

});

/* =================== Export Functions =================== */
function exportDashboardToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Cannot export: SheetJS library not loaded.");
    return;
  }

  try {
    // Chart data
    const chartCanvas = document.getElementById("bookingTrendsChart");
    const chartInstance = Chart.getChart(chartCanvas);
    if (!chartInstance) return alert("Chart not loaded yet!");
    const trendData = chartInstance.data.datasets[0].data;
    const trendLabels = chartInstance.data.labels;
    const chartSheetData = [["Month","Bookings"]];
    trendLabels.forEach((label, idx) => chartSheetData.push([label, trendData[idx]]));
    const ws1 = XLSX.utils.aoa_to_sheet(chartSheetData);

    const tableBody = document.querySelector('[data-table="recentBookings"]');
    const tableRows = Array.from(tableBody.querySelectorAll("tr"));
    const tableSheetData = [["Tracking Number","Route","Type","Status","Date","Value","Weight"]];
    tableRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length === 7) tableSheetData.push(cells.map(c => c.textContent.trim()));
    });
    const ws2 = XLSX.utils.aoa_to_sheet(tableSheetData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Booking Trends");
    XLSX.utils.book_append_sheet(wb, ws2, "Recent Bookings");
    XLSX.writeFile(wb, `Dashboard_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  } catch (err) {
    console.error("Excel export error:", err);
    alert("Failed to export dashboard data.");
  }
}

/* =================== Profile Dropdown =================== */
document.addEventListener("click", (e) => {
  const icon = document.getElementById("profileIcon");
  const dropdown = document.getElementById("profileDropdown");
  if (!icon || !dropdown) return;

  if (icon.contains(e.target)) {
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  } else if (!dropdown.contains(e.target)) {
    dropdown.style.display = "none";
  }
});

window.addEventListener("pageshow", () => {
  loadProfile();
});

/* =================== Floating Notifications =================== */
document.addEventListener("click", (e) => {
  const notifBtn = document.getElementById("notificationsLink");
  const notifPanel = document.getElementById("notificationsFloat");
  if (!notifBtn || !notifPanel) return;

  if (notifBtn.contains(e.target)) {
    e.preventDefault();
    notifPanel.style.display = notifPanel.style.display === "block" ? "none" : "block";
  } else if (!notifPanel.contains(e.target)) {
    notifPanel.style.display = "none";
  }
});

document.getElementById("closeNotif")?.addEventListener("click", () => {
  const notifPanel = document.getElementById("notificationsFloat");
  if (notifPanel) notifPanel.style.display = "none";
});

/* =================== Welcome Modal =================== */
function handleWelcomeModal() {
  const welcomeModalEl = document.getElementById("welcomeModal");
  if (!welcomeModalEl) return;

  const shown = sessionStorage.getItem("welcomeShown");
  if (shown) return;

  const welcomeModal = new bootstrap.Modal(welcomeModalEl);
  welcomeModal.show();

  sessionStorage.setItem("welcomeShown", "true");
}

/* =================== Counter Animation =================== */
function animateCounter(element, endValue, duration = 1000, format = v => v) {
  if (!element) return;

  let startValue = parseInt(element.textContent.replace(/\D/g, "")) || 0;
  const range = endValue - startValue;
  if (range === 0) {
    element.textContent = format(endValue);
    return;
  }

  let startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const current = Math.round(startValue + range * progress);
    element.textContent = format(current);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =================== Load Recent Updates =================== */
async function loadRecentUpdates() {
  try {
    const res = await fetch("https://caiden-recondite-psychometrically.ngrok-free.dev/api/client/notifications", {
      credentials: "include"
    });

    if (!res.ok) throw new Error(`Failed to fetch notifications (${res.status})`);

    const notifications = await res.json();
    if (!Array.isArray(notifications)) return;

    const recent = [...notifications]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const badge = document.querySelector('[data-updates="newCount"]');
    if (badge) badge.textContent = `${unreadCount} new`;

    const list = document.querySelector('[data-list="recentUpdates"]');
    if (!list) return;
    list.innerHTML = "";

    if (recent.length === 0) {
      list.innerHTML = `<div class="text-muted text-center py-3">No recent updates</div>`;
      return;
    }

    recent.forEach(n => {
      const item = document.createElement("a");
      item.href = "./notifications.html";
      item.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-start";
      item.innerHTML = `
        <div class="me-auto">
          <div class="fw-semibold">${n.title || "Notification"}</div>
          <small class="text-muted">${n.message || ""}</small>
        </div>
        <small class="text-secondary">${new Date(n.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        })}</small>
      `;
      list.appendChild(item);
    });

  } catch (err) {
    console.error("Error loading recent updates:", err);
  }
}

let selectedTrackingNumber = null;

/* =================== Actions =================== */
document.addEventListener("click", (e) => {
  const cancelBtn = e.target.closest(".cancel-booking-btn");
  const editBtn = e.target.closest(".edit-booking-btn");

  // Cancel booking
  if (cancelBtn) {
    selectedTrackingNumber = cancelBtn.dataset.tracking;
    const modal = new bootstrap.Modal(document.getElementById("cancelBookingModal"));
    modal.show();
  }

  // Edit booking
  if (editBtn) {
    const bookingId = editBtn.dataset.id;
    window.location.href = `./booking-edit.html?id=${bookingId}`;
  }
});

/* =================== Cancel Confirmation =================== */
document.getElementById("confirmCancelBtn")?.addEventListener("click", async () => {
  const reason = document.getElementById("cancelReason").value.trim();
  if (!reason) {
    alert("Please enter a reason for cancellation.");
    return;
  }

  try {
    const res = await fetch(
      `https://caiden-recondite-psychometrically.ngrok-free.dev/api/bookings/${selectedTrackingNumber}/cancel`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to cancel booking.");

    alert("Booking cancelled successfully!");
    document.getElementById("cancelReason").value = "";
    bootstrap.Modal.getInstance(document.getElementById("cancelBookingModal")).hide();

    await loadDashboard();

  } catch (err) {
    console.error("Cancel booking error:", err);
    alert("Failed to cancel booking.");
  }
});






