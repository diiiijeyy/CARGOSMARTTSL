/* =================== Globals =================== */
let allBookings = [];
let filteredBookings = [];
let currentPage = 1;
const rowsPerPage = 10;

/* =================== Base Chart Config =================== */
const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: "#333", font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: "#111",
      titleFont: { size: 13, weight: "bold" },
      bodyFont: { size: 12 },
    },
  },
  animation: { duration: 600, easing: "easeOutQuart" },
  scales: {
    x: { ticks: { color: "#555" }, grid: { display: false } },
    y: { ticks: { color: "#555" }, grid: { color: "#eee" } },
  },
};

/* =================== DOM READY =================== */
document.addEventListener("DOMContentLoaded", () => {
  // KPIs
  initKpis();

  // Charts
  if (document.getElementById("revenue-chart")) initRevenueChart();
  if (document.getElementById("payment-status-chart")) initPaymentStatusChart();
  if (document.getElementById("shipment-volume-chart"))
    initShipmentVolumeChart();
  if (document.getElementById("booking-status-chart")) initBookingStatusChart();

  // DDS lines
  updatePaymentDDS();
  updateShipmentVolumeDDS();
  updateTopClientsDDS();

  // Top Clients
  initTopClients();

  // Recent Shipments
  initRecentShipments();

  // Notifications
  fetchNotifications();

  // Search Filter
  initSearchFilter();
});

/* =================== KPI =================== */
async function initKpis() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/kpis",
      { credentials: "include" }
    );
    const data = await res.json();

    animateValue(
      document.querySelector('[data-stat="monthlyRevenue"]'),
      0,
      data.monthly_revenue ?? 0,
      1200,
      "₱"
    );
    animateValue(
      document.querySelector('[data-stat="currentBookings"]'),
      0,
      data.current_bookings ?? 0,
      1000
    );
    animateValue(
      document.querySelector('[data-stat="activeShipments"]'),
      0,
      data.active_shipments ?? 0,
      1000
    );
    animateValue(
      document.querySelector('[data-stat="completedDeliveries"]'),
      0,
      data.completed_deliveries ?? 0,
      1000
    );
  } catch (err) {
    console.error("Error loading KPIs:", err);
  }
}

/* =================== Revenue Trend Chart =================== */
async function initRevenueChart() {
  try {
    const ctx = document.getElementById("revenue-chart").getContext("2d");
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/revenue",
      { credentials: "include" }
    );
    const data = await res.json();

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const currentMonthIndex = new Date().getMonth();
    const months = monthNames.slice(0, currentMonthIndex + 1);

    const revenue = months.map((m) => {
      const row = data.find((d) => d.month === m);
      return row?.total != null ? Number(row.total) : 0;
    });

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.25)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0)");

    const chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            data: revenue,
            borderColor: "#0069d9",
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
            pointBackgroundColor: "#0069d9",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#0069d9",
            bodyColor: "#023e8a",
            borderColor: "#60adf4",
            borderWidth: 1,
            displayColors: false,
            padding: 10,
            callbacks: {
              label: (ctx) => `₱ ${ctx.parsed.y.toLocaleString()}`,
            },
          },
        },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#5c677d", font: { size: 12 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: {
              color: "#5c677d",
              font: { size: 12 },
              callback: (v) => "₱ " + Number(v).toLocaleString(),
            },
          },
        },
        layout: { padding: { top: 10, bottom: 10, left: 5, right: 5 } },
        animation: {
          duration: 1000,
          easing: "easeInOutQuad",
          delay: (ctx) =>
            ctx.type === "data" && ctx.mode === "default"
              ? ctx.dataIndex * 100
              : 0,
          loop: false,
        },
        transitions: {
          show: {
            animations: {
              y: { from: 0, duration: 1000, easing: "easeInOutQuad" },
            },
          },
        },
      },
    });

    const currentMonthName = monthNames[currentMonthIndex];
    const currentRow = data.find((d) => d.month === currentMonthName);
    const currentMonthRevenue = currentRow ? Number(currentRow.total) : 0;

    const totalDisplay =
      document.getElementById("revenueTotalDisplay") ||
      document.getElementById("shipmentVolumeTotal");
    const labelDisplay =
      document.getElementById("revenuePeriodLabel") ||
      document.getElementById("shipmentVolumeLabel");

    if (totalDisplay && labelDisplay) {
      labelDisplay.textContent = `for ${currentMonthName}`;
      animateValue(totalDisplay, 0, currentMonthRevenue, 1200, "₱");
    }

    window.addEventListener("resize", () => chartInstance.resize());
  } catch (err) {
    console.error("Error loading revenue chart:", err);
  }
}

/* =================== Payment Status Chart & Decision Analytics =================== */
async function initPaymentStatusChart() {
  try {
    // ----- 1️⃣ PAYMENT STATUS CHART -----
    const ctx = document
      .getElementById("payment-status-chart")
      .getContext("2d");
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/payment-status",
      {
        credentials: "include",
      }
    );
    let data = await res.json();

    if (!data || Object.keys(data).length === 0) data = { on_time: 0, late: 0 };

    const total = data.on_time + data.late;
    const onTimeRate =
      total > 0 ? ((data.on_time / total) * 100).toFixed(1) : 0;
    const lateRate = total > 0 ? ((data.late / total) * 100).toFixed(1) : 0;

    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["On Time", "Late"],
        datasets: [
          {
            data: [data.on_time || 0, data.late || 0],
            backgroundColor: ["#1cc88a", "#FFAA6E"],
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: 13 }, color: "#333" },
          },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}` },
          },
        },
      },
    });

    document.getElementById(
      "paymentCompletionDisplay"
    ).textContent = `On-Time: ${onTimeRate}% | Late: ${lateRate}%`;

    // ----- 2️⃣ DECISION SUPPORT ANALYTICS TABLE -----
    await loadPaymentDecisionAnalytics();
  } catch (err) {
    console.error("Error loading payment status chart:", err);
  }
}

/* =================== Decision Support Analytics Table =================== */
/* =================== Decision Support Analytics Table =================== */
async function loadPaymentDecisionAnalytics() {
  const tableBody = document.getElementById("payment-decision-table-body");
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/payment-decision",
      { credentials: "include" }
    );
    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("Unexpected data format:", data);
      tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Error loading data.</td></tr>`;
      return;
    }

    if (data.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-muted">No payment data found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = "";

    data.forEach((row) => {
      const total = Number(row.total_invoices) || 0;
      const onTime = Number(row.on_time) || 0;
      const late = Number(row.late) || 0;

      const onTimeRate =
        row.on_time_rate != null
          ? Number(row.on_time_rate).toFixed(2)
          : total > 0
          ? ((onTime / total) * 100).toFixed(2)
          : "0.00";
      const lateRate =
        row.late_rate != null
          ? Number(row.late_rate).toFixed(2)
          : total > 0
          ? ((late / total) * 100).toFixed(2)
          : "0.00";

      const decision = row.status_flag || "Good Standing";
      const decisionText = (row.status_flag || "").toLowerCase();

      let colorClass = "text-success fw-bold"; // default green
      if (
        decisionText.includes("require review") ||
        decisionText.includes("removal")
      ) {
        colorClass = "text-danger fw-bold"; // red for high lateness
      } else if (decisionText.includes("monitor")) {
        colorClass = "text-warning fw-bold"; // yellow for watchlist
      } else if (decisionText.includes("no available")) {
        colorClass = "text-muted fw-semibold"; // gray for no data
      }

      tableBody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>${escapeHtml(row.company_name ?? "—")}</td>
          <td>${total}</td>
          <td>${onTime}</td>
          <td>${late}</td>
          <td>${onTimeRate}%</td>
          <td>${lateRate}%</td>
          <td class="${colorClass}">${decision}</td>
        </tr>
        `
      );
    });
  } catch (err) {
    console.error("Error loading payment decision analytics:", err);
    tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Error loading data.</td></tr>`;
  }
}

// simple HTML escape helper
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =================== Shipment Volume Chart (Improved) =================== */
async function initShipmentVolumeChart() {
  try {
    const ctx = document
      .getElementById("shipment-volume-chart")
      .getContext("2d");
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/dashboard/shipment-volume",
      { credentials: "include" }
    );
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No shipment data available");
    }

    // Map backend values (can be month names, week numbers, etc.)
    const labels = data.map((d) => d.month || d.week || "N/A");
    const values = data.map((d) => Number(d.total) || 0);

    // Create a blue gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(96, 173, 244, 0.35)");
    gradient.addColorStop(1, "rgba(96, 173, 244, 0)");

    // Destroy any existing chart before re-creating
    if (window.shipmentVolumeChart) window.shipmentVolumeChart.destroy();

    window.shipmentVolumeChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Shipments per Period",
            data: values,
            borderColor: "#0077b6",
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 6,
            pointBackgroundColor: "#0077b6",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#0077b6",
            bodyColor: "#023e8a",
            borderColor: "#90e0ef",
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} Shipments`,
            },
          },
        },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#5c677d", font: { size: 12 } },
            title: {
              display: true,
              text: "Time Period (Weeks/Months)",
              color: "#5c677d",
              font: { size: 13 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: {
              color: "#5c677d",
              font: { size: 12 },
              callback: (v) => Number(v).toLocaleString(),
            },
            title: {
              display: true,
              text: "Number of Shipments",
              color: "#5c677d",
              font: { size: 14 },
            },
          },
        },
        layout: {
          padding: { top: 10, bottom: 10, left: 5, right: 5 },
        },
        animation: {
          duration: 800,
          easing: "easeInOutQuart",
        },
      },
    });
  } catch (err) {
    console.error("Error loading shipment volume chart:", err);
  }
}

/* =================== Booking Status Chart =================== */
async function initBookingStatusChart() {
  try {
    const canvas = document.getElementById("booking-status-chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/booking-status",
      { credentials: "include" }
    );
    const data = await res.json();

    if (!Array.isArray(data)) return;

    const labels = data.map((d) => d.status);
    const values = data.map((d) => Number(d.count ?? 0));

    new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: [
              "#2196F3",
              "#FF9800",
              "#4CAF50",
              "#9C27B0",
              "#F44336",
            ],
          },
        ],
      },
      options: {
        ...baseOptions,
        plugins: { ...baseOptions.plugins, legend: { position: "bottom" } },
      },
    });
  } catch (err) {
    console.error("Error loading booking status chart:", err);
  }
}

/* =================== Top Clients =================== */
async function initTopClients() {
  try {
    const container = document.getElementById("top-clients-container");
    if (!container) return;

    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/top-clients",
      { credentials: "include" }
    );
    const clients = await res.json();

    container.innerHTML = "";

    if (!clients || clients.length === 0) {
      container.innerHTML =
        '<div class="text-muted text-center py-3">No clients yet</div>';
      return;
    }

    clients.forEach((client) => {
      const item = document.createElement("div");
      item.className =
        "list-group-item d-flex justify-content-between align-items-center";
      item.innerHTML = `
        <span>${client.name}</span>
        <span class="fw-semibold">₱${Number(
          client.revenue
        ).toLocaleString()}</span>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error("Error loading top clients:", err);
    const container = document.getElementById("top-clients-container");
    if (container)
      container.innerHTML =
        '<div class="text-danger text-center py-3">Failed to load clients</div>';
  }
}

/* =================== Recent Shipments =================== */
/* =================== Recent Shipments =================== */
async function initRecentShipments() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/shipments",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const shipments = await res.json();

    // Log to see actual statuses (important)
    console.log("ADMIN SHIPMENTS:", shipments);

    // Show all active shipments
    const ACTIVE_STATUSES = [
      "approved",
      "shipping",
      "in transit",
      "in-transit",
      "for dispatch",
      "for pickup",
    ];

    allBookings = shipments.filter((s) =>
      ACTIVE_STATUSES.includes((s.status || "").toLowerCase().trim())
    );

    filteredBookings = [...allBookings];
    currentPage = 1;
    renderBookings();
  } catch (err) {
    console.error("Error loading shipments:", err);

    const tbody = document.getElementById("recent-bookings-table");
    if (tbody) {
      tbody.innerHTML = `<tr>
        <td colspan="6" class="text-danger text-center py-4">Failed to load shipments</td>
      </tr>`;
    }
  }
}

/* =================== Notifications =================== */
const notifCountEl = document.getElementById("notifCount");

async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/admin/notifications",
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

/* =================== Helpers =================== */
function animateValue(element, start, end, duration, prefix = "", suffix = "") {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const current = Math.floor(progress * (end - start) + start);
    element.textContent = prefix + current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initSearchFilter() {
  const searchInput = document.getElementById("clientSearch");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();

    if (!query) {
      filteredBookings = [...allBookings];
    } else {
      filteredBookings = allBookings.filter((b) =>
        Object.values(b).some((val) =>
          String(val).toLowerCase().includes(query)
        )
      );
    }

    currentPage = 1;
    renderBookings();
  });
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
          renderBookings();
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
          renderBookings();
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
          renderBookings();
        }
      }
    )
  );
}

function renderBookings() {
  const tbody = document.getElementById("recent-bookings-table");
  tbody.innerHTML = "";
  if (!filteredBookings || filteredBookings.length === 0) {
    tbody.innerHTML = `
      <tr class="text-muted">
        <td colspan="6" class="text-center py-4">No results found</td>
      </tr>
    `;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageData = filteredBookings.slice(start, end);

  pageData.forEach((b) => {
    const row = document.createElement("tr");

    const statusKey = (b.status || "default").toLowerCase().replace(/\s+/g, "");

    row.innerHTML = `
      <td>${b.tracking_number || b.id}</td>
      <td>${b.client_name || b.company_name || "Client #" + b.client_id}</td>
      <td>${b.origin || b.port_origin || "-"}</td>
      <td>${b.destination || b.port_destination || "-"}</td>
      <td>${new Date(b.created_at).toLocaleDateString()}</td>
      <td><span class="badge badge-${statusKey}">${b.status}</span></td>
    `;

    tbody.appendChild(row);
  });

  const totalPages = Math.ceil(filteredBookings.length / rowsPerPage);
  renderPagination(totalPages);
}

/* =================== Descriptive Decision Support =================== */
async function updatePaymentDDS() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/payment-status",
      { credentials: "include" }
    );
    const data = await res.json();

    let onTime = 0,
      late = 0;

    if (Array.isArray(data)) {
      const onTimeItem = data.find(
        (d) => d.status?.toLowerCase() === "on time"
      );
      const lateItem = data.find((d) => d.status?.toLowerCase() === "late");
      onTime = Number(onTimeItem?.count || 0);
      late = Number(lateItem?.count || 0);
    } else {
      onTime = Number(data.on_time) || 0;
      late = Number(data.late) || 0;
    }

    const total = onTime + late;
    const onTimeRate = total > 0 ? Math.round((onTime / total) * 100) : 0;

    console.log("Payment DDS Data:", { onTime, late, total, onTimeRate });

    const display = document.getElementById("paymentCompletionDisplay");
    if (!display) return;

    let ddsMessage = "";
    if (onTimeRate >= 90) {
      ddsMessage = `Excellent payment compliance this month (<strong>${onTimeRate}%</strong> on time).`;
    } else if (onTimeRate >= 70) {
      ddsMessage = `Most clients paid on time (<strong>${onTimeRate}%</strong>), but a few delays observed.`;
    } else {
      ddsMessage = `Payment delays increased this month (only <strong>${onTimeRate}%</strong> on time). Follow-up recommended.`;
    }

    display.innerHTML = ddsMessage;
  } catch (err) {
    console.error("DDS: Payment update failed", err);
  }
}

/* =================== Update Shipment DDS =================== */
async function updateShipmentVolumeDDS() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/dashboard/shipment-volume",
      { credentials: "include" }
    );
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) return;

    const totalShipments = data.reduce(
      (sum, d) => sum + (Number(d.total) || 0),
      0
    );
    const label = document.getElementById("shipmentPeriodLabel");
    const display = document.getElementById("shipmentTotalDisplay");

    if (label && display) {
      label.textContent = "this quarter";
      animateValue(display, 0, totalShipments, 1200);
    }
  } catch (err) {
    console.error("DDS: Shipment Volume update failed", err);
  }
}

/* =================== Update Clients DDS =================== */
async function updateTopClientsDDS() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/analytics/top-clients",
      { credentials: "include" }
    );
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) return;

    const totalRevenue = data.reduce(
      (sum, c) => sum + (Number(c.revenue) || 0),
      0
    );
    const topClient = data[0];
    const topName = topClient?.name || "N/A";
    const topRevenue = Number(topClient?.revenue || 0);
    const share =
      totalRevenue > 0 ? ((topRevenue / totalRevenue) * 100).toFixed(1) : 0;

    const label = document.getElementById("topClientPeriodLabel");
    const display = document.getElementById("topClientTotalDisplay");

    if (label && display) {
      label.textContent = "this year";
      display.innerHTML = `${topName} (${share}% of total sales)`;
    }
  } catch (err) {
    console.error("DDS: Top Clients update failed", err);
  }
}
