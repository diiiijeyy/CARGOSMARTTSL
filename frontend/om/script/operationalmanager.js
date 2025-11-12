
// =============================
// Dashboard Data + Charts
// =============================
document.addEventListener("DOMContentLoaded", async function () {

  // =============================
  // 1. Summary Cards (Animated)
  // =============================
  fetch("http://localhost:5001/api/analytics/kpis")
    .then(res => res.json())
    .then(data => {
      animateValue(
        document.querySelector("[data-stat='currentBookings']"),
        null,
        data.current_bookings ?? 0,
        1000
      );
      animateValue(
        document.querySelector("[data-stat='pendingBookings']"),
        null,
        data.pending_bookings ?? 0,
        1000
      );
      animateValue(
        document.querySelector("[data-stat='activeShipments']"),
        null,
        data.active_shipments ?? 0,
        1000
      );
      animateValue(
        document.querySelector("[data-stat='completedDeliveries']"),
        null,
        data.completed_deliveries ?? 0,
        1000
      );
    })
    .catch(err => console.error("Error loading KPIs:", err));

  // =============================
  // 2. Booking Status Doughnut
  // =============================
  fetch("http://localhost:5001/api/analytics/shipment-status")
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById("booking-status-chart");
      if (!ctx) return;

      new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Approved", "Pending", "Completed", "Declined"],
          datasets: [{
            data: [data.approved, data.pending, data.completed, data.declined],
            backgroundColor: ['#03045e', '#f4d13d', '#45c33b', '#dc3545'],
            borderWidth: 2,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: "bottom",
              labels: { font: { size: 14 } }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  let total = context.dataset.data.reduce((a, b) => a + b, 0);
                  let value = context.raw;
                  let percentage = ((value / total) * 100).toFixed(1);
                  return `${context.label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    });

// =============================
// 3. Shipment Status Bar
// =============================
fetch("http://localhost:5001/api/analytics/operational/shipment-status")
  .then(res => res.json())
  .then(data => {
    const ctx = document.getElementById("shipment-status-chart");
    if (!ctx) return;

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Book Processed", "Order Shipped", "In Transit", "Delivered"],
        datasets: [{
          label: "Shipments",
          data: [
            data.processed ?? 0,
            data.order_shipped ?? 0,
            data.in_transit ?? 0,
            data.delivered ?? 0
          ],
          backgroundColor: [
            "#17a2b8",  // Processed (teal)
            "#007bff",  // Order Shipped (blue)
            "#ffc107",  // In Transit (yellow)
            "#28a745"   // Delivered (green)
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 5 } }
        }
      }
    });
  })
  .catch(err => console.error("❌ Error loading shipment status:", err));


  // =============================
  // 4. Top Clients
  // =============================
  fetch("http://localhost:5001/api/analytics/operational/top-clients")
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById("topClientsChart");
      if (!ctx) return;
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.labels,
          datasets: [{
            label: "Completed Shipments",
            data: data.data,
            backgroundColor: "#2e7fc0",
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.raw} shipments`
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 5 } },
            x: { grid: { display: false } }
          }
        }
      });
    });

  // =============================
  // 5. Shipment Volume Line
  // =============================
  fetch("http://localhost:5001/api/om/analytics/shipment-volume-compare")
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById("shipmentVolumeChart");
      if (!ctx) return;
      const chartCtx = ctx.getContext("2d");

      const gradientThisMonth = chartCtx.createLinearGradient(0, 0, 0, 400);
      gradientThisMonth.addColorStop(0, "rgba(46,127,192,0.3)");
      gradientThisMonth.addColorStop(1, "rgba(255,255,255,0)");

      const gradientLastMonth = chartCtx.createLinearGradient(0, 0, 0, 400);
      gradientLastMonth.addColorStop(0, "rgba(255,193,7,0.3)");
      gradientLastMonth.addColorStop(1, "rgba(255,255,255,0)");

      new Chart(chartCtx, {
        type: "line",
        data: {
          labels: data.labels,
          datasets: [
            {
              label: "This Month",
              data: data.thisMonth,
              borderColor: "#0077b6",
              backgroundColor: gradientThisMonth,
              tension: 0.4,
              fill: true
            },
            {
              label: "Last Month",
              data: data.lastMonth,
              borderColor: "#dc3545",
              backgroundColor: gradientLastMonth,
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } }
        }
      });
    });

  // =============================
  // 6. On-time vs Late Pie
  // =============================
  
  fetch("http://localhost:5001/api/analytics/on-time-vs-late")
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById("onTimeVsDelayedChart");
      if (!ctx) return;
      new Chart(ctx, {
        type: "pie",
        data: {
          labels: data.labels,
          datasets: [{
            data: data.data,
            backgroundColor: ['#0077b6', '#03045e']
          }]
        },
        options: { responsive: true }
      });
    });

  // =============================
  // 7. Weekly Bookings Bar
  // =============================
  fetch("http://localhost:5001/api/analytics/weekly-bookings")
    .then(res => res.json())
    .then(data => {
      const ctx = document.getElementById("weeklyBookingsChart");
      if (!ctx) return;
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.labels,
          datasets: [{
            label: "Bookings",
            data: data.data,
            backgroundColor: "#2e7fc0"
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } }
        }
      });
    });
});

// =============================
// Recent Shipments Table
// =============================
document.addEventListener("DOMContentLoaded", async function () {
  const tableBody = document.querySelector("[data-table='recentShipments']");
  if (!tableBody) return;

  try {
    const res = await fetch("http://localhost:5001/api/operational/shipments/recent");
    if (!res.ok) throw new Error("Failed to fetch recent shipments");

    const shipments = await res.json();
    console.log("✅ Shipments received:", shipments);

    // Clear placeholder
    tableBody.innerHTML = "";

    if (!shipments || shipments.length === 0) {
      tableBody.innerHTML = `
        <tr class="text-muted">
          <td colspan="6" class="text-center py-4">No shipments yet</td>
        </tr>`;
      return;
    }

    shipments.forEach(shipment => {
      const row = document.createElement("tr");

      const status = (shipment.status || "").toLowerCase();
      let badgeClass =
        status === "approved" ? "success" :
        status === "pending" ? "warning" :
        status === "completed" ? "primary" :
        status === "declined" ? "danger" : "secondary";

      row.innerHTML = `
        <td>${shipment.tracking_number ?? "-"}</td>
        <td>${shipment.client_name ?? "-"}</td>
        <td>${shipment.port_origin ?? "-"}</td>
        <td>${shipment.port_delivery ?? "-"}</td>
        <td>${
          shipment.created_at
            ? new Date(shipment.created_at).toLocaleDateString("en-US")
            : "-"
        }</td>
        <td>
          <span class="badge bg-${badgeClass}">
            ${shipment.status ?? "Unknown"}
          </span>
        </td>
      `;

      tableBody.appendChild(row);
    });
  } catch (err) {
    console.error("❌ Error loading recent shipments:", err);
    tableBody.innerHTML = `
      <tr class="text-danger">
        <td colspan="6" class="text-center py-4">Error loading shipments</td>
      </tr>`;
  }
});

/* -------------------------------
  Animated Counter (Improved)
--------------------------------*/
const activeAnimations = new WeakMap();

function animateValue(el, start, end, duration, prefix = "", suffix = "") {
  if (!el) return;

  // Cancel any running animation for this element
  if (activeAnimations.has(el)) {
    cancelAnimationFrame(activeAnimations.get(el));
    activeAnimations.delete(el);
  }

  let startTimestamp = null;

  // If start not given, parse from existing text
  if (start === null || start === undefined) {
    const currentText = el.textContent.replace(/[^\d]/g, "");
    start = parseInt(currentText) || 0;
  }

  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);

    const current = Math.floor(start + (end - start) * progress);
    el.textContent = prefix + current.toLocaleString() + suffix;

    if (progress < 1) {
      const reqId = requestAnimationFrame(step);
      activeAnimations.set(el, reqId);
    } else {
      // ✅ Ensure final exact value
      el.textContent = prefix + end.toLocaleString() + suffix;
      activeAnimations.delete(el);
    }
  };

  const reqId = requestAnimationFrame(step);
  activeAnimations.set(el, reqId);
}
