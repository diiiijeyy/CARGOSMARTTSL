// =============================
// Dashboard Data + Charts
// =============================
document.addEventListener("DOMContentLoaded", async function () {
  // ===== 1. Summary KPIs =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/analytics/kpis"
  )
    .then((res) => res.json())
    .then((data) => {
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
    });

  // ===== 2. Shipment Status Bar =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/analytics/operational/shipment-status"
  )
    .then((res) => res.json())
    .then((data) => {
      const ctx = document.getElementById("shipment-status-chart");
      if (!ctx) return;
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: [
            "Book Processed",
            "Order Shipped",
            "In Transit",
            "Delivered",
          ],
          datasets: [
            {
              data: [
                data.processed ?? 0,
                data.order_shipped ?? 0,
                data.in_transit ?? 0,
                data.delivered ?? 0,
              ],
              backgroundColor: ["#17a2b8", "#007bff", "#ffc107", "#28a745"],
              borderRadius: 8,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    });

  // ===== 3. Shipment Volume Line =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/om/analytics/shipment-volume-compare"
  )
    .then((res) => res.json())
    .then((data) => {
      const canvas = document.getElementById("shipmentVolumeChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");

      const grad1 = ctx.createLinearGradient(0, 0, 0, 300);
      grad1.addColorStop(0, "rgba(46,127,192,0.3)");
      grad1.addColorStop(1, "rgba(255,255,255,0)");

      const grad2 = ctx.createLinearGradient(0, 0, 0, 300);
      grad2.addColorStop(0, "rgba(255,193,7,0.3)");
      grad2.addColorStop(1, "rgba(255,255,255,0)");

      new Chart(ctx, {
        type: "line",
        data: {
          labels: data.labels,
          datasets: [
            {
              label: "This Month",
              data: data.thisMonth,
              borderColor: "#0077b6",
              backgroundColor: grad1,
              fill: true,
              tension: 0.4,
            },
            {
              label: "Last Month",
              data: data.lastMonth,
              borderColor: "#dc3545",
              backgroundColor: grad2,
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } },
        },
      });
    });

  // ===== 4. Weekly Bookings =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/analytics/weekly-bookings"
  )
    .then((res) => res.json())
    .then((data) => {
      const ctx = document.getElementById("weeklyBookingsChart");
      if (!ctx) return;
      new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.labels,
          datasets: [{ data: data.data, backgroundColor: "#2e7fc0" }],
        },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    });

  // ===== 5. Booking Status (Doughnut) =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/analytics/operational/booking-status"
  )
    .then((res) => res.json())
    .then((data) => {
      const canvas = document.getElementById("bookingStatusChart");
      if (!canvas) return;

      new Chart(canvas, {
        type: "doughnut",
        data: {
          labels: ["Approved", "Pending", "Completed", "Declined"],
          datasets: [
            {
              data: [
                data.approved ?? 0,
                data.pending ?? 0,
                data.completed ?? 0,
                data.declined ?? 0,
              ],
              backgroundColor: ["#50ABE7", "#ffff90", "#1cc88a", "#ff6666"],
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } },
        },
      });
    });

  // ===== 6. On-Time vs Late =====
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/analytics/operational/on-time-late"
  )
    .then((res) => res.json())
    .then((data) => {
      const canvas = document.getElementById("onTimeLateChart");
      if (!canvas) return;

      const values = [data.on_time ?? 0, data.late ?? 0];
      const total = values[0] + values[1];
      const percent = total ? Math.round((values[0] / total) * 100) : 0;

      new Chart(canvas, {
        type: "doughnut",
        data: {
          labels: ["On-Time", "Late"],
          datasets: [
            {
              data: values,
              backgroundColor: ["#52b788", "#D9534F"],
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "bottom" } },
        },
      });

      const pctEl = document.getElementById("onTimeLatePercentage");
      if (pctEl)
        pctEl.innerHTML = `On-time deliveries: <strong>${percent}%</strong>`;
    });

  // ===== 7. Recent Shipments =====
  const tableBody = document.querySelector("[data-table='recentShipments']");
  if (tableBody) {
    fetch(
      "https://cargosmarttsl-5.onrender.com/api/operational/shipments/recent"
    )
      .then((res) => res.json())
      .then((rows) => {
        tableBody.innerHTML = "";
        if (!rows.length) {
          tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No shipments yet</td></tr>`;
          return;
        }

        rows.forEach((s) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${s.tracking_number ?? "-"}</td>
            <td>${s.client_name ?? "-"}</td>
            <td>${s.port_origin ?? "-"}</td>
            <td>${s.port_delivery ?? "-"}</td>
            <td>${
              s.created_at ? new Date(s.created_at).toLocaleDateString() : "-"
            }</td>
            <td><span class="badge bg-${(
              s.status ?? "secondary"
            ).toLowerCase()}">${s.status ?? "Unknown"}</span></td>
          `;
          tableBody.appendChild(tr);
        });
      });
  }
});

// =============================
// Recent Shipments Table
// =============================
document.addEventListener("DOMContentLoaded", async function () {
  const tableBody = document.querySelector("[data-table='recentShipments']");
  if (!tableBody) return;

  try {
    const res = await fetch(
      "https://cargosmarttsl-5.onrender.com/api/operational/shipments/recent"
    );
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

    shipments.forEach((shipment) => {
      const row = document.createElement("tr");

      const status = (shipment.status || "").toLowerCase();
      let badgeClass =
        status === "approved"
          ? "success"
          : status === "pending"
          ? "warning"
          : status === "completed"
          ? "primary"
          : status === "declined"
          ? "danger"
          : "secondary";

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
