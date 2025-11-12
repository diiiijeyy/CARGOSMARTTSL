// =========================
// 📅 Set Current Date
// =========================
document.addEventListener("DOMContentLoaded", () => {
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

  // Initialize charts after DOM ready
  initShipmentVolumeChart();
  initOnTimeLateChart();
  loadShipmentStatus();
  loadTopClients();
  loadClientHistory();
});

// =========================
// 🚚 Shipment Volume Chart (This vs Last Month)
// =========================
async function initShipmentVolumeChart() {
  try {
    // Fetch current vs last month shipment volume
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/om/analytics/shipment-volume-compare",
      {
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error("Failed to fetch shipment volume comparison");

    const data = await res.json();
    // Expected backend format:
    // { labels: ["Week 1", "Week 2", "Week 3", "Week 4"], thisMonth: [..], lastMonth: [..] }

    const ctx = document.getElementById("shipmentVolumeChart");
    const reportEl = document.getElementById("shipmentVolumeReport");
    if (!ctx) return;

    // Destroy previous chart if it exists
    if (
      window.shipmentChart &&
      typeof window.shipmentChart.destroy === "function"
    ) {
      window.shipmentChart.destroy();
    }

    // Get current and previous month names
    const now = new Date();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const currentMonth = monthNames[now.getMonth()];
    const lastMonth = monthNames[(now.getMonth() - 1 + 12) % 12];
    const year = now.getFullYear();

    // Calculate totals
    const totalThisMonth = data.thisMonth.reduce((a, b) => a + b, 0);
    const totalLastMonth = data.lastMonth.reduce((a, b) => a + b, 0);
    const difference = totalThisMonth - totalLastMonth;

    // Create chart
    window.shipmentChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: `${currentMonth}`,
            data: data.thisMonth,
            backgroundColor: "#2e7fc0",
          },
          {
            label: `${lastMonth}`,
            data: data.lastMonth,
            backgroundColor: "#b0c4de",
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          title: {
            display: true,
            text: `Shipment Volume: ${currentMonth} vs ${lastMonth} ${year}`,
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 },
            grid: { color: "#eaeaea" },
          },
        },
      },
    });

    // Generate short descriptive summary
    let summary = "";
    if (difference > 0) {
      summary = `📈 <b>${currentMonth}</b> shows an increase in shipment volume compared to <b>${lastMonth}</b> — up by <b>${difference}</b> shipments.`;
    } else if (difference < 0) {
      summary = `📉 <b>${currentMonth}</b> has fewer shipments than <b>${lastMonth}</b> — down by <b>${Math.abs(
        difference
      )}</b> shipments.`;
    } else {
      summary = `⚖️ Shipments in <b>${currentMonth}</b> are equal to <b>${lastMonth}</b>. No change in overall volume.`;
    }

    if (reportEl) {
      reportEl.innerHTML = `<p class="mt-2 text-muted small">${summary}</p>`;
    }
  } catch (err) {
    console.error("❌ Error initializing shipment volume chart:", err);
  }
}

// Auto-run when the page loads
document.addEventListener("DOMContentLoaded", initShipmentVolumeChart);

// =========================
// ⏰ On-Time vs Late Chart
// =========================
// =========================
// ⏰ On-Time vs Late Chart
// =========================
async function initOnTimeLateChart() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/on-time-vs-late",
      {
        credentials: "include",
      }
    );

    if (!res.ok) throw new Error("Failed to fetch on-time vs late data");
    const data = await res.json();

    // Extract data safely
    const values = data.data || data.values || [];
    const labels = data.labels || ["On-Time", "Late"];
    const ctx = document.getElementById("onTimeLateChart");
    const reportEl = document.getElementById("onTimeLateReport");
    if (!ctx) return;

    // Destroy existing chart to prevent duplicates
    if (
      window.onTimeLateChart &&
      typeof window.onTimeLateChart.destroy === "function"
    ) {
      window.onTimeLateChart.destroy();
    }

    // Create chart
    window.onTimeLateChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: ["#2e7fc0", "#d9534f"],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          title: { display: true, text: "On-Time vs Late Deliveries" },
        },
      },
    });

    // =========================
    // 📄 Generate descriptive report
    // =========================
    const onTime = values[0] || 0;
    const late = values[1] || 0;
    const total = onTime + late;

    let summary = "";

    if (total === 0) {
      summary = "ℹ️ No deliveries recorded for the selected period.";
    } else {
      const onTimeRate = ((onTime / total) * 100).toFixed(1);
      const lateRate = ((late / total) * 100).toFixed(1);

      if (onTimeRate >= 90) {
        summary = `✅ Excellent! <b>${onTimeRate}%</b> of deliveries were on time this month. Only <b>${lateRate}%</b> were delayed.`;
      } else if (onTimeRate >= 70) {
        summary = `⚠️ Moderate performance — <b>${onTimeRate}%</b> of deliveries arrived on time, while <b>${lateRate}%</b> were late. There’s room for improvement.`;
      } else {
        summary = `📉 Performance Alert: Only <b>${onTimeRate}%</b> of deliveries were on time. <b>${lateRate}%</b> were delayed — consider reviewing logistics efficiency.`;
      }
    }

    if (reportEl) {
      reportEl.innerHTML = `<p class="mt-2 text-muted small text-center">${summary}</p>`;
    }
  } catch (err) {
    console.error("❌ Chart Error:", err);
  }
}

// Auto-run on page load
document.addEventListener("DOMContentLoaded", initOnTimeLateChart);

// =========================
// 📊 Shipment Status Table
// =========================
async function loadShipmentStatus() {
  try {
    // Shipment Status
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/shipment-status",
      {
        credentials: "include",
      }
    );

    if (!res.ok) throw new Error("Failed to fetch shipment status");
    const shipments = await res.json();
    // Expected: [{id: "#1001", client: "Client A", status: "On-Time", delivery_date: "2025-09-05"}]

    const tbody = document.querySelector("table.table-bordered tbody");
    tbody.innerHTML = "";
    shipments.forEach((s) => {
      const badgeClass =
        s.status.toLowerCase() === "on-time" ? "bg-success" : "bg-danger";
      tbody.innerHTML += `
        <tr>
          <td>${s.tracking_number}</td>
          <td>${s.client}</td>
          <td><span class="badge ${badgeClass}">${s.status}</span></td>
          <td>${s.expected_delivery_date}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// =========================
// 👥 Top Clients by Booking
// =========================
async function loadTopClients() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/top-clients-bookings",
      {
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error("Failed to fetch top clients");
    const clients = await res.json();
    // Backend returns: [{ name: "Client A", total_bookings: 120 }, ...]

    const container = document.querySelector(".col-lg-4 ul.list-group");
    container.innerHTML = "";

    clients.forEach((c) => {
      container.innerHTML += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <span class="fw-semibold">${c.name}</span>
          <span class="text-muted">${c.total_bookings} Bookings</span>
        </li>
      `;
    });
  } catch (err) {
    console.error("❌ Error loading top clients:", err);
  }
}

// ===============================
// Load Clients for Dropdown
// ===============================
async function loadClients() {
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/clients",
      {
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error("Failed to fetch clients");

    const clients = await res.json();
    const select = document.getElementById("clientSelect");

    select.innerHTML = ""; // clear old
    clients.forEach((c) => {
      select.innerHTML += `<option value="${c.company_name}">${c.company_name}</option>`;
    });

    // Load first client by default
    if (clients.length > 0) {
      loadClientHistory(clients[0].company_name);
    }

    // Change listener
    select.addEventListener("change", (e) => {
      loadClientHistory(e.target.value);
    });
  } catch (err) {
    console.error("❌ Error loading clients:", err);
  }
}

// ===============================
// Client Shipment History
// ===============================
async function loadClientHistory(client) {
  try {
    if (!client) return; // prevent empty fetch

    const res = await fetch(
      `https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/client-history?client=${encodeURIComponent(
        client
      )}`,
      {
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error("Failed to fetch client history");

    const history = await res.json();
    const tbody = document.querySelector("table.table-striped tbody");
    tbody.innerHTML = "";

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No shipments found</td></tr>`;
      return;
    }

    history.forEach((h) => {
      let badgeClass = "bg-secondary";
      if (h.status && h.status.toLowerCase() === "delivered")
        badgeClass = "bg-success";
      if (h.status && h.status.toLowerCase() === "in transit")
        badgeClass = "bg-warning";

      tbody.innerHTML += `
        <tr>
          <td>${h.id}</td>
          <td>${h.shipment_date}</td>
          <td><span class="badge ${badgeClass}">${h.status}</span></td>
          <td>${h.origin} → ${h.destination}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("❌ Error loading client history:", err);
  }
}

// ===============================
// Init on Page Load
// ===============================
document.addEventListener("DOMContentLoaded", loadClients);

// =========================
// ⏳ Preloader Fade Out
// =========================
window.addEventListener("load", function () {
  const preloader = document.getElementById("preloader");
  if (preloader) {
    preloader.style.opacity = "0";
    preloader.style.visibility = "hidden";
    setTimeout(() => preloader.remove(), 600);
  }
});
