/* -------------------------------
   Notifications
--------------------------------*/
function ensureNotificationModal() {
  if (document.getElementById("notificationModal")) return;
  const modalHTML = `
    <div class="modal fade" id="notificationModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered" style="max-width:520px;width:92%;">
        <div class="modal-content border-0 shadow-sm">
          <div class="modal-body p-3 rounded d-flex align-items-center gap-3" id="notificationBody" style="background:#0077b6;color:#fff;">
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

function showNotification(arg1, arg2, arg3) {
  ensureNotificationModal();

  let title, message, variant;
  if (typeof arg1 === "object") {
    ({ title, message, variant } = arg1);
  } else {
    title = arg1;
    message = arg2;
    variant = arg3 || "info";
  }

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
  }, 1800);
}

async function fetchNotifications() {
  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/admin/notifications",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const notifications = await res.json();

    const notifCountEl = document.getElementById("notifCount");
    if (!notifCountEl) return;

    // Count only unread
    const unreadCount = notifications.filter((n) => !n.is_read).length;

    if (unreadCount > 0) {
      notifCountEl.textContent = unreadCount;
      notifCountEl.style.display = "inline-block";
    } else {
      notifCountEl.textContent = "0"; // optional
      notifCountEl.style.display = "none"; // hide badge when no unread
    }
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
  }
}

/* -------------------------------
   Export Shipment Volume - PDF & CSV
--------------------------------*/
async function exportShipmentVolumeTablePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 55, 128);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Shipment Volume Report", 14, 26);

  // Filter label
  let filterText = "This Month";
  const f = window.shipmentVolumeFilter || "this_month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.shipmentVolumeRange?.start) {
    const { start, end } = window.shipmentVolumeRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  doc.setFontSize(11);
  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  // Data validation
  const data = window.shipmentVolumeData || [];
  if (!Array.isArray(data) || data.length === 0) {
    showNotification({
      variant: "warning",
      title: "No Data",
      message: "No shipment data available for export.",
    });
    return;
  }

  // Table content
  const tableBody = data.map((d, i) => [
    i + 1,
    d.label || d.month || d.date || "N/A",
    Number(d.total || 0).toLocaleString(),
  ]);

  // jsPDF-AutoTable
  doc.autoTable({
    startY: 50,
    head: [["#", "Period", "Total Shipments"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [96, 173, 244], // TSL palette
      textColor: 255,
      halign: "center",
      fontStyle: "bold",
    },
    bodyStyles: {
      halign: "center",
      textColor: [40, 40, 40],
    },
    styles: { fontSize: 11, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 100 },
      2: { cellWidth: 40 },
    },
  });

  // Total
  const total = data.reduce((sum, d) => sum + Number(d.total || 0), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    `Total Shipments: ${total.toLocaleString()}`,
    14,
    doc.lastAutoTable.finalY + 10
  );

  // Footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Generated by CARGOSMART: SHIPMENT TRACKING SYSTEM WITH DATA ANALYTICS",
    14,
    285
  );

  // Save
  doc.save(`shipment_volume_${f}.pdf`);
  showNotification({
    variant: "success",
    title: "Exported",
    message: `Shipment Volume (${filterText}) saved as PDF.`,
  });
}

async function exportShipmentVolumeCSV() {
  const data = window.shipmentVolumeData || [];
  if (!Array.isArray(data) || data.length === 0) {
    showNotification({
      variant: "warning",
      title: "No Data",
      message: "No shipment data available for CSV export.",
    });
    return;
  }

  const f = window.shipmentVolumeFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.shipmentVolumeRange?.start) {
    const { start, end } = window.shipmentVolumeRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  // CSV header
  let csv = "No.,Period,Total Shipments\n";
  data.forEach((d, i) => {
    csv += `${i + 1},"${d.label || d.month || d.date || "N/A"}",${d.total}\n`;
  });

  const total = data.reduce((a, b) => a + Number(b.total || 0), 0);
  csv += `\nTotal Shipments,,${total}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shipment_volume_${f}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification({
    variant: "success",
    title: "Exported",
    message: `Shipment Volume (${filterText}) saved as CSV.`,
  });
}

/* -------------------------------
   Shipment Volume Chart (Animated Line + Filter)
--------------------------------*/
let currentShipmentFilter = "this_month";

async function initShipmentVolumeChart(
  filterType = "this_month",
  customRange = {}
) {
  const canvas = document.getElementById("shipmentVolume");
  if (!canvas) return;

  try {
    const ctx = canvas.getContext("2d");

    // ✅ Build API URL dynamically
    let url = `https://cargosmarttsl-1.onrender.com/api/analytics/shipment-volume?filter=${filterType}`;
    if (filterType === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok)
      throw new Error(`Failed to fetch shipment volume: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    window.shipmentVolumeData = data;
    window.shipmentVolumeFilter = filterType;
    window.shipmentVolumeRange = customRange;

    const labels = data.map((d) => d.label || d.month || d.date);
    const volumes = data.map((d) => Number(d.total));

    // 🎯 Update label text
    const labelEl = document.getElementById("shipmentVolumeLabel");
    if (labelEl) {
      switch (filterType) {
        case "this_month":
          labelEl.textContent = "this month";
          break;
        case "last_month":
          labelEl.textContent = "last month";
          break;
        case "this_year":
          labelEl.textContent = "this year";
          break;
        case "custom":
          labelEl.textContent = "for selected range";
          break;
        default:
          labelEl.textContent = "this month";
      }
    }

    // ✅ Create gradient for fill effect
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.25)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0)");

    // Destroy previous chart instance if reloaded
    if (window.shipmentVolumeChart instanceof Chart) {
      window.shipmentVolumeChart.destroy();
    }

    window.shipmentVolumeChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Shipments",
            data: volumes,
            borderColor: "#0077b6",
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 4.5,
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
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toLocaleString()} shipments`,
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
              callback: (v) => v.toLocaleString(),
            },
            title: {
              display: true,
              text: "Number of Shipments",
              color: "#5c677d",
              font: { size: 14 },
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

    // 🧮 Display total
    const total = volumes.reduce((a, b) => a + b, 0);
    document.getElementById("shipmentVolumeTotal").textContent =
      total.toLocaleString();
  } catch (err) {
    console.error("Error loading shipment volume chart:", err);
  }
}

/* -------------------------------
   Shipment Volume Filter Dropdown + Calendar Range
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterShipmentVolumeBtn");
  if (!filterBtn) return;

  // ✅ Create dropdown
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  // ✅ Toggle dropdown visibility
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const rect = filterBtn.getBoundingClientRect();

    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px"; // 👈 left aligned
    dropdown.style.width = filterBtn.offsetWidth + "px"; // 👈 optional: match button width

    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  });

  // ✅ Initialize Flatpickr for custom date range (only once)
  let fpRange;
  function ensureDateRangePicker() {
    if (fpRange) return fpRange;
    const input = document.getElementById("dateRangeInput");
    if (!input) return null;
    fpRange = flatpickr(input, {
      mode: "range",
      dateFormat: "Y-m-d",
      maxDate: "today",
      disableMobile: true,
    });
    return fpRange;
  }

  function openDateRangeModal() {
    ensureDateRangePicker();
    const modal = new bootstrap.Modal(
      document.getElementById("dateRangeModal")
    );
    modal.show();
  }

  // ✅ Handle filter selection
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      const selected = item.dataset.filter;
      dropdown.style.display = "none";

      if (selected === "custom") {
        // 🟦 Disable the filter button while modal is open
        filterBtn.classList.add("disabled");

        openDateRangeModal();
        const applyBtn = document.getElementById("applyDateRangeBtn");

        // remove old listener (avoid stacking)
        const newApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApply, applyBtn);

        newApply.addEventListener("click", async () => {
          if (!fpRange) return;
          const picked = fpRange.selectedDates || [];
          if (picked.length < 2) {
            showNotification({
              variant: "warning",
              title: "Incomplete Range",
              message: "Please select both start and end dates.",
            });
            return;
          }

          const toYMD = (d) => d.toISOString().slice(0, 10);
          let [start, end] = picked;
          if (start > end) [start, end] = [end, start];

          await initShipmentVolumeChart("custom", {
            start: toYMD(start),
            end: toYMD(end),
          });

          const inst = bootstrap.Modal.getInstance(
            document.getElementById("dateRangeModal")
          );
          inst?.hide();

          filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${toYMD(
            start
          )} → ${toYMD(end)}`;
        });
      } else {
        await initShipmentVolumeChart(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
      }
    });
  });

  // ✅ Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // ✅ Load default chart
  initShipmentVolumeChart("this_month");
});

/* -------------------------------
   On-Time vs Late (Filter + Export)
--------------------------------*/
let onTimeLateChart;

async function initOnTimeLate(filterType = "this_month", customRange = {}) {
  const canvas = document.getElementById("onTimeLate");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    // ✅ Build API URL dynamically
    let url = `https://cargosmarttsl-1.onrender.com/api/admin/reports/on-time-vs-delayed?filter=${filterType}`;
    if (filterType === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok)
      throw new Error(`Failed to fetch on-time vs late: ${res.status}`);
    const data = await res.json();

    window.onTimeLateData = data;
    window.onTimeLateFilter = filterType;
    window.onTimeLateRange = customRange;

    const values = [data.on_time, data.delayed];

    if (onTimeLateChart) onTimeLateChart.destroy();

    onTimeLateChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["On-Time", "Late"],
        datasets: [
          {
            data: values,
            backgroundColor: ["#52b788", "#D9534F"],
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = values.reduce((a, b) => a + b, 0);
                const val = context.raw;
                const pct = total ? ((val / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${val} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    // 🔹 Update text label
    const total = values.reduce((a, b) => a + b, 0);
    const pct = total ? Math.round((data.on_time / total) * 100) : 0;

    document.getElementById("onTimeLatePercentage").innerHTML = `
  On-time deliveries: <strong>${pct}%</strong><br>
  Total deliveries: <strong>${total}</strong>
`;
  } catch (err) {
    console.error("Error loading On-Time vs Late:", err);
    showNotification("Error", "Failed to load On-Time vs Late chart.", "error");
  }
}

/* 🔹 Filter Dropdown (same style as Shipment Volume) */
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterOnTimeLateBtn");
  if (!filterBtn) return;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  filterBtn.addEventListener("click", (e) => {
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const selected = item.dataset.filter;
      if (selected === "custom") {
        ensureDateRangePicker();
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();

        const applyBtn = document.getElementById("applyDateRangeBtn");
        const newApply = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApply, applyBtn);

        newApply.addEventListener("click", async () => {
          if (!fpRange) return;
          const dates = fpRange.selectedDates;
          if (dates.length < 2) {
            showNotification(
              "Warning",
              "Please select both start and end dates.",
              "warning"
            );
            return;
          }
          const toYMD = (d) => d.toISOString().slice(0, 10);
          let [start, end] = dates;
          if (start > end) [start, end] = [end, start];
          await initOnTimeLate("custom", {
            start: toYMD(start),
            end: toYMD(end),
          });
          bootstrap.Modal.getInstance(
            document.getElementById("dateRangeModal")
          )?.hide();
          filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${toYMD(
            start
          )} → ${toYMD(end)}`;
          showNotification(
            "Range Applied",
            `${toYMD(start)} to ${toYMD(end)}`,
            "success"
          );
        });
      } else {
        await initOnTimeLate(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  initOnTimeLate("this_month");
});

/* Export On-Time vs Late as PDF */
async function exportOnTimeLatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 55, 128);
  doc.text("TSL Freight Movers Inc.", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("On-Time vs Late Deliveries", 14, 26);

  const f = window.onTimeLateFilter || "this_month";
  let filterText =
    f === "last_month"
      ? "Last Month"
      : f === "this_year"
      ? "This Year"
      : "This Month";
  if (f === "custom" && window.onTimeLateRange?.start) {
    filterText = `Custom Range (${window.onTimeLateRange.start} → ${window.onTimeLateRange.end})`;
  }

  doc.setFontSize(11);
  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  const data = window.onTimeLateData;
  if (!data) {
    showNotification("No Data", "No delivery data to export.", "warning");
    return;
  }

  const total = (data.on_time ?? 0) + (data.delayed ?? 0);
  const onTimePct = total ? ((data.on_time / total) * 100).toFixed(1) : 0;
  const latePct = total ? ((data.delayed / total) * 100).toFixed(1) : 0;

  const body = [
    ["On-Time Deliveries", data.on_time, `${onTimePct}%`],
    ["Late Deliveries", data.delayed, `${latePct}%`],
    ["Total", total, "100%"],
  ];

  doc.autoTable({
    startY: 50,
    head: [["Category", "Count", "Percentage"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { fontSize: 11, halign: "center" },
  });

  doc.text(
    "Generated by CARGOSMART: SHIPMENT TRACKING SYSTEM WITH DATA ANALYTICS",
    14,
    285
  );
  doc.save(`on_time_vs_late_${f}.pdf`);

  showNotification(
    "Exported",
    "On-Time vs Late report saved as PDF.",
    "success"
  );
}

/* 🔹 Export On-Time vs Late as CSV */
async function exportOnTimeLateCSV() {
  const data = window.onTimeLateData;
  if (!data) {
    showNotification("No Data", "No delivery data to export.", "warning");
    return;
  }

  const f = window.onTimeLateFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.onTimeLateRange?.start) {
    filterText = `Custom Range (${window.onTimeLateRange.start} → ${window.onTimeLateRange.end})`;
  }

  const total = (data.on_time ?? 0) + (data.delayed ?? 0);
  const onTimePct = total ? ((data.on_time / total) * 100).toFixed(1) : 0;
  const latePct = total ? ((data.delayed / total) * 100).toFixed(1) : 0;

  // Build CSV content
  let csv = `On-Time vs Late Deliveries\n`;
  csv += `Filter:,${filterText}\n`;
  csv += `Generated on:,${new Date().toLocaleDateString()}\n\n`;
  csv += `Category,Count,Percentage\n`;
  csv += `On-Time Deliveries,${data.on_time},${onTimePct}%\n`;
  csv += `Late Deliveries,${data.delayed},${latePct}%\n`;
  csv += `Total,${total},100%\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `on_time_vs_late_${f}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification(
    "Exported",
    "On-Time vs Late report saved as CSV.",
    "success"
  );
}

async function exportBookingStatusTablePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const data = window.shipmentStatusData;
  if (!data) {
    showNotification(
      "No Data",
      "No shipment data available for export.",
      "warning"
    );
    return;
  }

  // FIX: Read correct field names from API
  const approved = Number(data.approved ?? data.approved_bookings ?? 0);
  const pending = Number(data.pending ?? data.pending_bookings ?? 0);
  const completed = Number(data.completed ?? data.completed_bookings ?? 0);
  const declined = Number(data.declined ?? data.declined_bookings ?? 0);

  const total = approved + pending + completed + declined;

  // ---- HEADER ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Booking Status Report", 14, 26);

  const f = window.shipmentStatusFilter || "this_month";
  let filterText =
    f === "last_month"
      ? "Last Month"
      : f === "this_year"
      ? "This Year"
      : f === "custom"
      ? `Custom Range (${window.shipmentStatusRange.start} → ${window.shipmentStatusRange.end})`
      : "This Month";

  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  // ---- TABLE ----
  const body = [
    ["Approved", approved, `${((approved / total) * 100).toFixed(1)}%`],
    ["Pending", pending, `${((pending / total) * 100).toFixed(1)}%`],
    ["Completed", completed, `${((completed / total) * 100).toFixed(1)}%`],
    ["Declined", declined, `${((declined / total) * 100).toFixed(1)}%`],
    ["Total", total, "100%"],
  ];

  doc.autoTable({
    startY: 50,
    head: [["Status", "Count", "Percentage"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { fontSize: 11, halign: "center" },
  });

  doc.save(`booking_status_${f}.pdf`);

  showNotification(
    "Exported",
    "Booking Status Report saved as PDF.",
    "success"
  );
}

async function exportBookingStatusCSV() {
  const data = window.shipmentStatusData;
  if (!data) {
    showNotification(
      "No Data",
      "No shipment data available for CSV export.",
      "warning"
    );
    return;
  }

  // FIX: Use proper field names
  const approved = Number(data.approved ?? data.approved_bookings ?? 0);
  const pending = Number(data.pending ?? data.pending_bookings ?? 0);
  const completed = Number(data.completed ?? data.completed_bookings ?? 0);
  const declined = Number(data.declined ?? data.declined_bookings ?? 0);

  const total = approved + pending + completed + declined;

  const f = window.shipmentStatusFilter || "this_month";
  let filterText =
    f === "last_month"
      ? "Last Month"
      : f === "this_year"
      ? "This Year"
      : f === "custom"
      ? `Custom Range (${window.shipmentStatusRange.start} → ${window.shipmentStatusRange.end})`
      : "This Month";

  let csv = `Booking Status Report\nFilter:,${filterText}\nGenerated:,${new Date().toLocaleDateString()}\n\n`;
  csv += "Status,Count,Percentage\n";
  csv += `Approved,${approved},${((approved / total) * 100).toFixed(1)}%\n`;
  csv += `Pending,${pending},${((pending / total) * 100).toFixed(1)}%\n`;
  csv += `Completed,${completed},${((completed / total) * 100).toFixed(1)}%\n`;
  csv += `Declined,${declined},${((declined / total) * 100).toFixed(1)}%\n`;
  csv += `Total,${total},100%\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `booking_status_${f}.csv`;
  a.click();

  URL.revokeObjectURL(url);

  showNotification("Exported", "Booking Status saved as CSV.", "success");
}

/* -------------------------------
   Revenue (Monthly) - Styled
--------------------------------*/
async function initRevenueChart(filter = "this_month", customRange = {}) {
  const canvas = document.getElementById("monthlyRevenueChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    // Build API URL
    let url = `https://cargosmarttsl-1.onrender.com/api/reports/revenue-trend?filter=${filter}`;
    if (filter === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });

    if (!res.ok) {
      console.error("Revenue API error", await res.text());
      throw new Error(`Failed revenue trend: ${res.status}`);
    }

    const raw = await res.json();

    // 🔥 FIX: Ensure correct fields exist
    const data = raw.map((row) => ({
      label: row.label || row.month || row.period || "N/A",
      revenue: Number(row.revenue || row.total_revenue || 0),
    }));

    window.revenueTrendData = data;
    window.revenueTrendFilter = filter;
    window.revenueTrendRange = customRange;

    const labels = data.map((d) => d.label);
    const revenues = data.map((d) => d.revenue);

    if (window.accountingRevenueChart instanceof Chart) {
      window.accountingRevenueChart.destroy();
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0,119,182,0.9)");
    gradient.addColorStop(1, "rgba(0,119,182,0.3)");

    window.accountingRevenueChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Revenue",
            data: revenues,
            backgroundColor: gradient,
            borderColor: "#0077b6",
            borderWidth: 1.5,
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `₱${ctx.parsed.y.toLocaleString()}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `₱${v.toLocaleString()}` },
          },
        },
      },
    });
  } catch (err) {
    console.error("Revenue trend error:", err);
    showNotification("Error", "Unable to load Sales Trend", "error");
  }
}

/* -------------------------------
   Revenue Filter Buttons
--------------------------------*/

// Blue filter button click
document.getElementById("revenueFilterBtn")?.addEventListener("click", () => {
  const filter = document.getElementById("revenueFilterSelect").value;

  // If custom range is selected
  if (filter === "custom") {
    const start = document.getElementById("revenueStartDate").value;
    const end = document.getElementById("revenueEndDate").value;

    if (!start || !end) {
      showNotification(
        "Error",
        "Please choose both start and end dates.",
        "error"
      );
      return;
    }

    initRevenueChart("custom", { start, end });
    return;
  }

  // Other filters
  initRevenueChart(filter);
});

/* -------------------------------
   Auto-show Custom Range Inputs
--------------------------------*/
document
  .getElementById("revenueFilterSelect")
  ?.addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    document.getElementById("customRangeFields").style.display = isCustom
      ? "block"
      : "none";
  });

/* -------------------------------
   Invoice Status Report
--------------------------------*/
async function initInvoiceStatus(filter = "this_month", customRange = {}) {
  const canvas = document.getElementById("invoiceStatus");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    let url = `https://cargosmarttsl-1.onrender.com/api/reports/payment-status?filter=${filter}`;

    if (filter === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    const data = await res.json();

    // ⭐ STEP 3 — STORE FILTERED DATA FOR EXPORT
    window.invoiceStatusData = data;
    window.invoiceStatusFilter = filter;
    window.invoiceStatusRange = customRange;

    // ---------------------------
    // Compute total invoices
    // ---------------------------
    const totalInvoices =
      Number(data.on_time || 0) +
      Number(data.late || 0) +
      Number(data.pending || 0);

    // Display in UI
    const totalEl = document.getElementById("invoiceStatusTotal");
    if (totalEl) {
      totalEl.textContent = `Total invoices: ${totalInvoices.toLocaleString()}`;
    }

    // your chart code below...

    if (window.invoiceStatusChart) window.invoiceStatusChart.destroy();

    window.invoiceStatusChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["On-Time", "Late", "Pending"],
        datasets: [
          {
            data: [data.on_time, data.late, data.pending],
            backgroundColor: ["#1cc88a", "#FFAA6E", "#ffff90"],
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  } catch (err) {
    console.error("Invoice status error:", err);
  }
}

/* -------------------------------
   Revenue by Client (Top 5 Only)
--------------------------------*/
let revenueByClientChart;

/* Load Top 5 Revenue Chart */
async function loadRevenueByClientChart(
  filter = "this_month",
  customRange = {}
) {
  const canvas = document.getElementById("revenueByClientChart");
  if (!canvas) return;

  try {
    const ctx = canvas.getContext("2d");

    // ----------------------------
    // Build API URL
    // ----------------------------
    let url = `https://cargosmarttsl-1.onrender.com/api/reports/client-revenue?filter=${filter}`;

    if (filter === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch top clients revenue");

    const data = await res.json();

    // -----------------------------------------
    // Convert grouped-month data → total revenue
    // -----------------------------------------
    const totalsByClient = {};

    data.forEach((row) => {
      const name = row.company_name;
      const revenue = Number(row.revenue || 0);

      if (!totalsByClient[name]) totalsByClient[name] = 0;
      totalsByClient[name] += revenue;
    });

    // Convert to array
    const sorted = Object.entries(totalsByClient)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Prepare chart data
    const labels = sorted.map((x) => x.name).reverse();
    const totals = sorted.map((x) => x.revenue).reverse();

    // ----------------------------
    // Destroy existing chart
    // ----------------------------
    if (revenueByClientChart instanceof Chart) {
      revenueByClientChart.destroy();
    }

    // ----------------------------
    // Gradient
    // ----------------------------
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.9)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0.3)");

    // ----------------------------
    // Draw Chart
    // ----------------------------
    revenueByClientChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Revenue (₱)",
            data: totals,
            backgroundColor: gradient,
            borderColor: "#0077b6",
            borderWidth: 1.5,
            borderRadius: 8,
            barThickness: 35,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `₱${ctx.raw.toLocaleString()}`,
            },
          },
        },

        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (v) => `₱${v.toLocaleString()}`,
            },
            title: {
              display: true,
              text: "Revenue (₱)",
            },
          },
          y: {
            title: {
              display: true,
              text: "Top 5 Clients",
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Error loading top clients chart:", err);
  }
}

/* -------------------------------
   Booking Status Reports (Frontend)
--------------------------------*/
let shipmentStatusChart;

async function initShipmentStatus(filterType = "this_month", customRange = {}) {
  const canvas = document.getElementById("shipmentStatus");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    // Build API URL (Correct: shipment-status)
    let url = `https://cargosmarttsl-1.onrender.com/api/analytics/shipment-status?filter=${filterType}`;

    if (filterType === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok)
      throw new Error(`Failed to fetch booking status: ${res.status}`);

    const data = await res.json();

    // Save for export
    window.shipmentStatusData = data;
    window.shipmentStatusFilter = filterType;
    window.shipmentStatusRange = customRange;

    // Destroy previous chart
    if (shipmentStatusChart) shipmentStatusChart.destroy();

    shipmentStatusChart = new Chart(ctx, {
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
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: function (context) {
                const arr = context.dataset.data;
                const total = arr.reduce((a, b) => a + b, 0);
                const val = context.raw;
                const pct = total ? ((val / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${val} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    // Update summary
    document.querySelector("#shipmentStatusSummary").innerHTML = `
      Approved: <strong>${data.approved}</strong> |
      Pending: <strong>${data.pending}</strong> |
      Completed: <strong>${data.completed}</strong> |
      Declined: <strong>${data.declined}</strong>
    `;
  } catch (err) {
    console.error("Error loading booking status chart:", err);
    showNotification("Error", "Failed to load booking status report.", "error");
  }
}

/* -------------------------------
   Booking Status Filter Dropdown
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterShipmentStatusBtn");
  if (!filterBtn) return;

  // Dropdown menu
  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  // Toggle dropdown
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  // Handle selection
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const selected = item.dataset.filter;

      // Not custom: apply immediately
      if (selected !== "custom") {
        await initShipmentStatus(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        return;
      }

      // Custom Range mode
      ensureDateRangePicker();

      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();

      const applyBtn = document.getElementById("applyDateRangeBtn");
      const newApply = applyBtn.cloneNode(true);
      applyBtn.parentNode.replaceChild(newApply, applyBtn);

      newApply.addEventListener("click", async () => {
        if (!fpRange || fpRange.selectedDates.length < 2) {
          showNotification("Warning", "Please select both dates.", "warning");
          return;
        }

        const [start, end] = fpRange.selectedDates.sort((a, b) => a - b);

        const S = start.toISOString().slice(0, 10);
        const E = end.toISOString().slice(0, 10);

        await initShipmentStatus("custom", { start: S, end: E });

        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${S} → ${E}`;

        modal.hide();
      });
    });
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
});

/* -------------------------------
   Top Clients by Bookings (with filters)
--------------------------------*/
let topClientsChart;

async function initTopClients(filterType = "this_month", customRange = {}) {
  const canvas = document.getElementById("topClients");
  if (!canvas) return;

  try {
    const ctx = canvas.getContext("2d");

    // ✅ Build API URL dynamically with filters
    let url = `https://cargosmarttsl-1.onrender.com/api/analytics/top-clients-bookings?filter=${filterType}`;
    if (filterType === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch top clients: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    // ✅ Store globally for export
    window.topClientsData = data;
    window.topClientsFilter = filterType;
    window.topClientsRange = customRange;

    const labels = data.map((d) => d.name);
    const totals = data.map((d) => Number(d.total_bookings));

    // Destroy old chart if exists
    if (window.topClientsChart instanceof Chart) {
      window.topClientsChart.destroy();
    }

    // 🎨 Gradient for nice look
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.9)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0.3)");

    // ✅ Recreate chart with new data
    window.topClientsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Total Bookings",
            data: totals,
            backgroundColor: gradient,
            borderColor: "#0077b6",
            borderWidth: 1.5,
            borderRadius: 8,
            barThickness: 40,
            maxBarThickness: 50,
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
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toLocaleString()} bookings`,
            },
          },
        },
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
              callback: (v) => v.toLocaleString(),
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
        },
      },
    });
  } catch (err) {
    console.error("Error loading top clients chart:", err);
    showNotification("Error", "Failed to load top clients data.", "error");
  }
}

async function exportTopClientsPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const data = window.topClientsData || [];
  const filter = window.topClientsFilter || "this_month";
  const range = window.topClientsRange || {};

  if (!Array.isArray(data) || data.length === 0) {
    showNotification("Warning", "No client data found.", "warning");
    return;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Top Clients by Booking", 14, 26);

  // Filter text
  let filterText = "This Month";
  if (filter === "last_month") filterText = "Last Month";
  else if (filter === "this_year") filterText = "This Year";
  else if (filter === "custom" && range.start && range.end)
    filterText = `Custom Range (${range.start} → ${range.end})`;

  doc.setFontSize(11);
  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  // FIXED: accurate mapping based on API data from chart
  const body = data.map((d, i) => [
    i + 1,
    d.name || "N/A",
    Number(d.total_bookings || 0).toLocaleString(),
  ]);

  doc.autoTable({
    startY: 50,
    head: [["#", "Client Name", "Total Bookings"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { halign: "center", fontSize: 10 },
  });

  doc.save(`top_clients_${filter}.pdf`);

  showNotification("Success", "Top Clients saved as PDF.", "success");
}

function exportTopClientsCSV() {
  const data = window.topClientsData || [];
  const filter = window.topClientsFilter || "this_month";
  const range = window.topClientsRange || {};

  if (!Array.isArray(data) || data.length === 0) {
    showNotification("Warning", "No client data found.", "warning");
    return;
  }

  let filterText = "This Month";
  if (filter === "last_month") filterText = "Last Month";
  else if (filter === "this_year") filterText = "This Year";
  else if (filter === "custom" && range.start && range.end)
    filterText = `Custom Range (${range.start} → ${range.end})`;

  // CSV HEADER
  let csv = `Top Clients by Booking\n`;
  csv += `Filter:,${filterText}\n`;
  csv += `Generated on:,${new Date().toLocaleDateString()}\n\n`;
  csv += "No.,Client Name,Total Bookings\n";

  // FIXED: Match chart data exactly
  data.forEach((d, i) => {
    csv += `${i + 1},"${d.name}",${Number(d.total_bookings || 0)}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `top_clients_${filter}.csv`;
  a.click();

  URL.revokeObjectURL(url);

  showNotification("Success", "Top Clients saved as CSV.", "success");
}

/* -------------------------------
   Top Clients by Booking Filter (Fixed & Working)
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterTopClientsBtn");
  if (!filterBtn) return;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show shadow-sm";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const selected = item.dataset.filter;

      // ⭐ Predefined filters (works)
      if (selected !== "custom") {
        await initTopClients(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        window.topClientsFilter = selected;
        return;
      }

      // ⭐ Custom Range
      ensureDateRangePicker();
      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();

      const applyBtn = document.getElementById("applyDateRangeBtn");
      const newApply = applyBtn.cloneNode(true);
      applyBtn.parentNode.replaceChild(newApply, applyBtn);

      newApply.addEventListener("click", async () => {
        if (!fpRange || fpRange.selectedDates.length < 2) {
          showNotification(
            "Warning",
            "Please select start and end dates",
            "warning"
          );
          return;
        }

        const [start, end] = fpRange.selectedDates.sort((a, b) => a - b);
        const S = start.toISOString().slice(0, 10);
        const E = end.toISOString().slice(0, 10);

        await initTopClients("custom", { start: S, end: E });

        window.topClientsFilter = "custom";
        window.topClientsRange = { start: S, end: E };

        modal.hide();

        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${S} → ${E}`;
      });
    });
  });
});

/* -------------------------------
   Clients Overview
--------------------------------*/
async function loadClientsOverview() {
  const tableBody = document.querySelector("#clients table tbody");
  if (!tableBody) return;

  const res = await fetch(
    "https://cargosmarttsl-1.onrender.com/api/reports/analytics/clients",
    { credentials: "include" }
  );
  const clients = await res.json();

  tableBody.innerHTML = "";

  if (clients.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No client data found</td></tr>`;
    return;
  }

  clients.forEach((client) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${client.client_name}</td>
      <td>${client.total_bookings}</td>
      <td>₱${Number(client.total_revenue).toLocaleString()}</td>
      <td>${client.on_time_percent}%</td>
    `;
    tableBody.appendChild(row);
  });
}

/* -------------------------------
   Aging Report
--------------------------------*/
async function initAgingReport() {
  const canvas = document.getElementById("agingReport");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const res = await fetch(
    "https://cargosmarttsl-1.onrender.com/api/reports/aging",
    { credentials: "include" }
  );
  const data = await res.json();

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["0-30 Days", "31-60 Days", "61-90 Days", "90+ Days"],
      datasets: [
        {
          label: "Unpaid Invoices",
          data: [data["0_30"], data["31_60"], data["61_90"], data["90_plus"]],
          backgroundColor: ["#1cc88a", "#ffc107", "#fd7e14", "#dc3545"],
          barThickness: 40,
          maxBarThickness: 50,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      maintainAspectRatio: false,
    },
  });
}

/* -------------------------------
   INIT ALL ON LOAD
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  initShipmentVolumeChart();
  initOnTimeLate();
  initRevenueChart("this_year");
  initInvoiceStatus();
  loadRevenueByClientChart("this_year");
  initShipmentStatus("this_month");
  initTopClients();
  loadClientsOverview();
  initAgingReport();

  // Notifications
  fetchNotifications();
  setInterval(fetchNotifications, 30000);

  const filter = document.getElementById("revenueByClientFilter");
  if (filter) {
    filter.addEventListener("change", (e) => {
      loadRevenueByClientChart(e.target.value);
    });
  }
});

/* ---------- Custom Range Picker Helpers ---------- */
let fpRange; // flatpickr instance
function ensureDateRangePicker() {
  if (fpRange) return fpRange;
  const input = document.getElementById("dateRangeInput");
  if (!input) return null;

  fpRange = flatpickr(input, {
    mode: "range",
    dateFormat: "Y-m-d",
    allowInput: false,
    maxDate: "today", // adjust if you want future dates
    animate: true,
    // Make it nicer on small screens:
    disableMobile: true,
  });
  return fpRange;
}

function openDateRangeModal(prefillStart, prefillEnd) {
  ensureDateRangePicker();
  // Pre-fill previously chosen range (optional)
  if (fpRange) {
    if (prefillStart && prefillEnd) {
      fpRange.setDate([prefillStart, prefillEnd], true);
    } else {
      fpRange.clear();
    }
  }
  const m = new bootstrap.Modal(document.getElementById("dateRangeModal"));
  m.show();
  return m;
}

/* -------------------------------
   Client Shipment History Filter (FIXED)
--------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
  const filterBtn = document.getElementById("filterRevenueTrendBtn");
  if (!filterBtn) return;

  let clients = [];
  try {
    const res = await fetch(
      "https://cargosmarttsl-1.onrender.com/api/reports/clients-with-shipments",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    clients = await res.json();
  } catch (err) {
    console.error("❌ Failed to load clients:", err);
    showNotification("Error", "Could not load client list.", "error");
    return;
  }

  // Wrapper for dropdown
  const wrapper = document.createElement("div");
  wrapper.className = "dropdown position-relative d-inline-block";
  filterBtn.parentNode.insertBefore(wrapper, filterBtn);
  wrapper.appendChild(filterBtn);

  // Create dropdown list
  const dropdown = document.createElement("ul");
  dropdown.className = "dropdown-menu shadow-sm border-0 rounded-3";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.style.minWidth = "220px";

  const uniqueClients = [
    ...new Map(clients.map((c) => [c.company_name, c])).values(),
  ];

  dropdown.innerHTML = `
    <li>
      <a class="dropdown-item fw-bold text-primary" href="#" data-client-id="all">
        All Clients
      </a>
    </li>
    <li><hr class="dropdown-divider"></li>

    ${uniqueClients
      .map(
        (c) => `
      <li>
        <a class="dropdown-item" href="#"
           data-client-id="${c.id}"
           data-client-name="${encodeURIComponent(c.company_name)}">
          ${c.company_name}
        </a>
      </li>`
      )
      .join("")}
  `;
  wrapper.appendChild(dropdown);

  // Toggle dropdown
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) dropdown.style.display = "none";
  });

  // When selecting a client
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const clientId = item.dataset.clientId;
      const clientName = item.dataset.clientName
        ? decodeURIComponent(item.dataset.clientName)
        : "All Clients";

      const tbody = document.getElementById("clientHistoryTableBody");
      tbody.innerHTML = `
        <tr><td colspan="8" class="text-center text-muted">Loading...</td></tr>
      `;

      // Build API
      let url =
        "https://cargosmarttsl-1.onrender.com/api/analytics/client-history";
      if (clientId !== "all") url += `?client_id=${clientId}`;

      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        /** FIX: Save filtered data FOR EXPORT (correct & safe) **/
        window.clientHistoryFiltered = data;
        window.clientHistoryFilterName = clientName;
        window.clientHistoryFilterId = clientId;

        tbody.innerHTML = "";

        if (!Array.isArray(data) || data.length === 0) {
          tbody.innerHTML = `
            <tr><td colspan="8" class="text-center text-muted">No shipments found</td></tr>
          `;
          showNotification("Info", `No shipments for ${clientName}.`, "info");
          return;
        }

        const getBadgeClass = (status) => {
          const s = (status || "").toLowerCase();
          if (s.includes("approved")) return "badge-approved";
          if (s.includes("pending")) return "badge-pending";
          if (s.includes("in transit")) return "badge-intransit";
          if (s.includes("processed")) return "badge-processed";
          if (s.includes("completed") || s.includes("delivered"))
            return "badge-completed";
          if (s.includes("shipping")) return "badge-shipping";
          if (
            s.includes("declined") ||
            s.includes("cancelled") ||
            s.includes("returned")
          )
            return "badge-declined";
          return "badge-default";
        };

        tbody.innerHTML = data
          .map(
            (row, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${row.client_name}</td>
              <td>${row.tracking_number}</td>
              <td>${row.service_type}</td>
              <td>${row.origin}</td>
              <td>${row.destination}</td>
              <td><span class="badge ${getBadgeClass(row.status)}">${
              row.status
            }</span></td>
              <td>${new Date(row.shipment_date).toLocaleDateString()}</td>
            </tr>`
          )
          .join("");

        showNotification(
          "Filtered",
          `Showing results for ${clientName}`,
          "success"
        );
      } catch (err) {
        console.error("❌ Error loading client history:", err);
        tbody.innerHTML =
          '<tr><td colspan="8" class="text-center text-danger">Failed to load data.</td></tr>';

        showNotification("Error", "Could not load client data.", "error");
      }
    });
  });
});

async function exportClientHistoryPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const data = window.clientHistoryFiltered || [];
  const clientName = window.clientHistoryFilterName || "All Clients";

  if (!Array.isArray(data) || data.length === 0) {
    showNotification(
      "Warning",
      "No shipment data available for export.",
      "warning"
    );
    return;
  }

  // HEADER
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Client Shipment & Booking History", 14, 26);

  doc.text(`Client: ${clientName}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  // BUILD TABLE ROWS
  const tableBody = data.map((d, i) => [
    i + 1,
    d.client_name || "N/A",
    d.tracking_number || "N/A",
    d.service_type || "N/A",
    d.origin || "N/A",
    d.destination || "N/A",
    d.status || "N/A",
    new Date(d.shipment_date).toLocaleDateString(),
  ]);

  // GENERATE TABLE
  doc.autoTable({
    startY: 48,
    head: [
      [
        "#",
        "Client",
        "Tracking #",
        "Service",
        "Origin",
        "Destination",
        "Status",
        "Date",
      ],
    ],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { fontSize: 9, halign: "center" },
  });

  // SAVE FILE
  const sanitized = clientName.replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  doc.save(`client_history_${sanitized}.pdf`);

  showNotification(
    "Success",
    "Client shipment history saved as PDF.",
    "success"
  );
}

async function exportRevenueTrendPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const data = window.revenueTrendData || [];
  const filter = window.revenueTrendFilter || "this_month";
  const range = window.revenueTrendRange || {};

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Sales Trend Report", 14, 26);

  // Filter Label
  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end)
    label = `Custom Range (${range.start} → ${range.end})`;

  doc.text(`Filter: ${label}`, 14, 34);

  // Validation
  if (!data.length) {
    showNotification("Warning", "No revenue data to export.", "warning");
    return;
  }

  // FIXED — correct fields
  const body = data.map((d, i) => [
    i + 1,
    d.label,
    Number(d.revenue).toLocaleString(),
  ]);

  doc.autoTable({
    startY: 50,
    head: [["#", "Month", "Revenue"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    bodyStyles: { textColor: 50 },
    styles: { halign: "center" },
  });

  doc.save(`sales_trend_${filter}.pdf`);
  showNotification("Exported", "Sales Trend exported as PDF.", "success");
}

async function exportRevenueTrendCSV() {
  const data = window.revenueTrendData || [];
  const filter = window.revenueTrendFilter || "this_month";
  const range = window.revenueTrendRange || {};

  if (!data.length) {
    showNotification("Warning", "No revenue data to export.", "warning");
    return;
  }

  // Filter label
  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end)
    label = `Custom Range (${range.start} → ${range.end})`;

  // CSV Header
  let csv = `Sales Trend Report\n`;
  csv += `Filter:,${label}\n`;
  csv += `Generated on:,${new Date().toLocaleDateString()}\n\n`;
  csv += "No.,Month,Revenue\n";

  // Add rows WITHOUT commas
  data.forEach((d, i) => {
    csv += `${i + 1},"${d.label}",${Number(d.revenue)}\n`;
  });

  // Download CSV
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales_trend_${filter}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification("Success", "Sales Trend exported as CSV.", "success");
}

async function exportClientHistoryCSV() {
  const data = window.clientHistoryFiltered || [];
  const clientName = window.clientHistoryFilterName || "All Clients";

  if (!Array.isArray(data) || data.length === 0) {
    showNotification(
      "Warning",
      "No shipment data available for export.",
      "warning"
    );
    return;
  }

  let csv = `Client Shipment & Booking History\n`;
  csv += `Client:,${clientName}\n`;
  csv += `Generated:,${new Date().toLocaleDateString()}\n\n`;

  csv += "No.,Client,Tracking #,Service,Origin,Destination,Status,Date\n";

  data.forEach((d, i) => {
    csv += `${i + 1},"${d.client_name}","${d.tracking_number}","${
      d.service_type
    }","${d.origin}","${d.destination}","${d.status}",${new Date(
      d.shipment_date
    ).toLocaleDateString()}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  const sanitized = clientName.replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  a.download = `client_history_${sanitized}.csv`;

  a.click();
  URL.revokeObjectURL(a.href);

  showNotification(
    "Success",
    "Client shipment history saved as CSV.",
    "success"
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterInvoiceStatusBtn");
  if (!filterBtn) return;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  // toggle dropdown
  filterBtn.addEventListener("click", (e) => {
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  // apply filter
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const selected = item.dataset.filter;

      if (selected !== "custom") {
        await initInvoiceStatus(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        return;
      }

      // custom range
      ensureDateRangePicker();
      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();

      const apply = document.getElementById("applyDateRangeBtn");
      const newApply = apply.cloneNode(true);
      apply.parentNode.replaceChild(newApply, apply);

      newApply.addEventListener("click", async () => {
        if (!fpRange || fpRange.selectedDates.length < 2) {
          showNotification("Warning", "Select date range", "warning");
          return;
        }

        const [start, end] = fpRange.selectedDates.sort((a, b) => a - b);
        const S = start.toISOString().slice(0, 10);
        const E = end.toISOString().slice(0, 10);

        await initInvoiceStatus("custom", { start: S, end: E });

        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${S} → ${E}`;
        modal.hide();
      });
    });
  });
});

async function exportInvoiceStatusPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const data = window.invoiceStatusData;
  const filter = window.invoiceStatusFilter;
  const range = window.invoiceStatusRange;

  if (!data) {
    showNotification("Warning", "No invoice status data to export.", "warning");
    return;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Invoice Status Report", 14, 26);

  // Filter Label
  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end)
    label = `Custom Range (${range.start} → ${range.end})`;

  doc.text(`Filter: ${label}`, 14, 34);

  // Convert safely to numbers
  const onTime = Number(data.on_time || 0);
  const late = Number(data.late || 0);
  const pending = Number(data.pending || 0);

  // Correct math
  const total = onTime + late + pending;

  // Correct rows
  const rows = [
    ["On-Time", onTime, percent(onTime, total)],
    ["Late", late, percent(late, total)],
    ["Pending", pending, percent(pending, total)],
    ["Total", total, "100%"],
  ];

  doc.autoTable({
    startY: 50,
    head: [["Status", "Count", "Percentage"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { halign: "center" },
  });

  doc.save(`invoice_status_${filter}.pdf`);

  showNotification("Success", "Invoice Status exported as PDF.", "success");
}

function percent(value, total) {
  return total === 0 ? "0%" : ((value / total) * 100).toFixed(1) + "%";
}

async function exportInvoiceStatusCSV() {
  const data = window.invoiceStatusData;
  const filter = window.invoiceStatusFilter;
  const range = window.invoiceStatusRange;

  if (!data) {
    showNotification("Warning", "No invoice status data to export.", "warning");
    return;
  }

  // Fix: Convert values safely to numbers (same logic as PDF)
  const onTime = Number(data.on_time || 0);
  const late = Number(data.late || 0);
  const pending = Number(data.pending || 0);

  const total = onTime + late + pending;

  // Filter label
  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end)
    label = `Custom Range (${range.start} → ${range.end})`;

  // Build CSV
  let csv = `Invoice Status Report\n`;
  csv += `Filter:,${label}\n`;
  csv += `Generated:,${new Date().toLocaleDateString()}\n\n`;
  csv += "Status,Count,Percentage\n";

  csv += `On-Time,${onTime},${percent(onTime, total)}\n`;
  csv += `Late,${late},${percent(late, total)}\n`;
  csv += `Pending,${pending},${percent(pending, total)}\n`;

  // Fix: Correct combined total row (same as PDF)
  csv += `Total,${total},100%\n`;

  // Download CSV
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice_status_${filter}.csv`;
  a.click();

  URL.revokeObjectURL(url);

  showNotification("Success", "Invoice Status exported as CSV.", "success");
}

async function exportRevenueByClientPDF() {
  const data = window.revenueByClientData || [];
  const mode = window.revenueByClientMode || "single";

  if (!Array.isArray(data) || data.length === 0) {
    showNotification("Warning", "No revenue data to export.", "warning");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    mode === "single"
      ? "Revenue by Client (Top 5)"
      : "Revenue by Client (Multi-Month Trend)",
    14,
    26
  );

  doc.setFontSize(10);
  doc.text(`View: ${mode === "single" ? "Top Clients" : "Trend"}`, 14, 32);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 38);

  let head = [];
  let body = [];

  if (mode === "single") {
    const sorted = [...data]
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 5);

    head = [["#", "Client", "Total Revenue (₱)"]];
    body = sorted.map((row, i) => [
      i + 1,
      row.company_name || "N/A",
      Number(row.total || 0).toLocaleString(),
    ]);
  } else {
    head = [["#", "Month", "Client", "Revenue (₱)"]];
    body = data.map((row, i) => [
      i + 1,
      row.month || "N/A",
      row.company_name || "N/A",
      Number(row.total || 0).toLocaleString(),
    ]);
  }

  doc.autoTable({
    startY: 48,
    head,
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { fontSize: 10, halign: "center" },
  });

  doc.save(
    `revenue_by_client_${mode === "single" ? "top_clients" : "trend"}.pdf`
  );

  showNotification("Success", "Revenue by Client PDF exported.", "success");
}

async function exportRevenueByClientCSV() {
  const data = window.revenueByClientData || [];
  const mode = window.revenueByClientMode || "single";

  if (!Array.isArray(data) || data.length === 0) {
    showNotification("Warning", "No revenue data to export.", "warning");
    return;
  }

  let csv = "Revenue by Client Report\n";
  csv += `View,${mode === "single" ? "Top Clients" : "Multi-Month Trend"}\n`;
  csv += `Generated on,${new Date().toLocaleDateString()}\n\n`;

  if (mode === "single") {
    const sorted = [...data]
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 5);

    csv += "No.,Client,Total Revenue (₱)\n";
    sorted.forEach((row, i) => {
      csv += `${i + 1},"${row.company_name}",${Number(
        row.total || 0
      ).toLocaleString()}\n`;
    });
  } else {
    csv += "No.,Month,Client,Revenue (₱)\n";
    data.forEach((row, i) => {
      csv += `${i + 1},"${row.month}","${row.company_name}",${Number(
        row.total || 0
      ).toLocaleString()}\n`;
    });
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue_by_client_${
    mode === "single" ? "top_clients" : "trend"
  }.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification("Success", "Revenue by Client CSV exported.", "success");
}

/* -------------------------------
   Sales Trend Filter Dropdown
--------------------------------*/
const salesTrendBtn = document.getElementById("filterSalesTrendBtn");
const salesTrendMenu = document.getElementById("filterSalesTrendDropdown");

salesTrendBtn?.addEventListener("click", () => {
  salesTrendMenu.classList.toggle("show");
});

document.addEventListener("click", (e) => {
  if (!salesTrendBtn.contains(e.target) && !salesTrendMenu.contains(e.target)) {
    salesTrendMenu.classList.remove("show");
  }
});

document
  .querySelectorAll("#filterSalesTrendDropdown .dropdown-item")
  .forEach((item) => {
    item.addEventListener("click", () => {
      const filter = item.dataset.filter;

      if (filter === "custom") {
        const modal = new bootstrap.Modal(
          document.getElementById("dateRangeModal")
        );
        modal.show();

        document.getElementById("applyDateRangeBtn").onclick = () => {
          const range = document.getElementById("dateRangeInput").value;
          const [start, end] = range.split(" to ");

          if (start && end) {
            initRevenueChart("custom", { start, end });
            modal.hide();
            salesTrendMenu.classList.remove("show");
          } else {
            showNotification(
              "Error",
              "Please select a valid date range.",
              "error"
            );
          }
        };
      } else {
        initRevenueChart(filter);
        salesTrendMenu.classList.remove("show");
      }
    });
  });

/* -------------------------------
   Top 5 Client Report – Filter
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("filterRevenueByClientBtn");
  const menu = document.getElementById("filterRevenueByClientDropdown");

  if (!btn || !menu) return;

  /* Toggle dropdown */
  btn.addEventListener("click", () => {
    menu.classList.toggle("show");
  });

  /* Close when clicking outside */
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove("show");
    }
  });

  /* Handle dropdown selections */
  menu.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      const filter = item.dataset.filter;
      menu.classList.remove("show");

      /* NOT CUSTOM – load immediately */
      if (filter !== "custom") {
        loadRevenueByClientChart(filter);
        btn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        return;
      }

      /* CUSTOM RANGE */
      ensureDateRangePicker(); // flatpickr init
      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();

      /* Replace old click listener to avoid duplicate firing */
      const applyBtn = document.getElementById("applyDateRangeBtn");
      const newApplyBtn = applyBtn.cloneNode(true);
      applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);

      newApplyBtn.addEventListener("click", async () => {
        if (!fpRange || fpRange.selectedDates.length < 2) {
          showNotification("Warning", "Please select a date range.", "warning");
          return;
        }

        let [start, end] = fpRange.selectedDates.sort((a, b) => a - b);
        start = start.toISOString().slice(0, 10);
        end = end.toISOString().slice(0, 10);

        await loadRevenueByClientChart("custom", { start, end });
        btn.innerHTML = `<i class="fas fa-filter me-1"></i> ${start} → ${end}`;
        modal.hide();
      });
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterAgingReportBtn");
  if (!filterBtn) return;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown-menu show";
  dropdown.style.position = "absolute";
  dropdown.style.display = "none";
  dropdown.innerHTML = `
    <a class="dropdown-item" data-filter="this_month" href="#">This Month</a>
    <a class="dropdown-item" data-filter="last_month" href="#">Last Month</a>
    <a class="dropdown-item" data-filter="this_year" href="#">This Year</a>
    <a class="dropdown-item" data-filter="custom" href="#">Custom Range</a>
  `;
  document.body.appendChild(dropdown);

  filterBtn.addEventListener("click", () => {
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
  });

  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const selected = item.dataset.filter;

      // Not custom — apply filter immediately
      if (selected !== "custom") {
        await initAgingReport(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        return;
      }

      // Custom Range
      ensureDateRangePicker();
      const modal = new bootstrap.Modal(
        document.getElementById("dateRangeModal")
      );
      modal.show();

      const applyBtn = document.getElementById("applyDateRangeBtn");
      const newBtn = applyBtn.cloneNode(true);
      applyBtn.parentNode.replaceChild(newBtn, applyBtn);

      newBtn.addEventListener("click", async () => {
        if (!fpRange || fpRange.selectedDates.length < 2) {
          showNotification("Warning", "Please select a date range.", "warning");
          return;
        }

        let [start, end] = fpRange.selectedDates.sort((a, b) => a - b);

        start = start.toISOString().slice(0, 10);
        end = end.toISOString().slice(0, 10);

        await initAgingReport("custom", { start, end });

        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${start} → ${end}`;
        modal.hide();
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
});

async function exportAgingReportPDF() {
  const data = window.agingReportData;
  if (!data) {
    return showNotification("Warning", "No data to export.", "warning");
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const filter = window.agingReportFilter;
  const range = window.agingReportRange;

  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end) {
    label = `Custom Range (${range.start} → ${range.end})`;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("TSL Freight Movers Inc.", 14, 18);
  doc.setFontSize(12);
  doc.text("Aging Report (Unpaid Invoices)", 14, 26);
  doc.text(`Filter: ${label}`, 14, 34);

  const body = [
    ["0–30 Days", data["0_30"]],
    ["31–60 Days", data["31_60"]],
    ["61–90 Days", data["61_90"]],
    ["90+ Days", data["90_plus"]],
  ];

  doc.autoTable({
    startY: 42,
    head: [["Age Bracket", "Unpaid Count"]],
    body,
    theme: "grid",
    headStyles: { fillColor: [96, 173, 244], textColor: 255 },
    styles: { halign: "center" },
  });

  doc.save(`aging_report_${filter}.pdf`);
  showNotification("Success", "Aging Report exported as PDF.", "success");
}
async function exportAgingReportCSV() {
  const data = window.agingReportData;
  if (!data) {
    return showNotification("Warning", "No data to export.", "warning");
  }

  const filter = window.agingReportFilter;
  const range = window.agingReportRange;

  let label = "This Month";
  if (filter === "last_month") label = "Last Month";
  else if (filter === "this_year") label = "This Year";
  else if (filter === "custom" && range.start && range.end)
    label = `Custom Range (${range.start} → ${range.end})`;

  let csv = "Aging Report (Unpaid Invoices)\n";
  csv += `Filter:,${label}\n`;
  csv += `Generated:,${new Date().toLocaleDateString()}\n\n`;
  csv += "Age Bracket,Unpaid Count\n";

  csv += `0–30 Days,${data["0_30"]}\n`;
  csv += `31–60 Days,${data["31_60"]}\n`;
  csv += `61–90 Days,${data["61_90"]}\n`;
  csv += `90+ Days,${data["90_plus"]}\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aging_report_${filter}.csv`;
  a.click();

  showNotification("Success", "Aging Report exported as CSV.", "success");
}

/* -------------------------------
   SINGLE EXPORT DISPATCHER — FIXED
--------------------------------*/
document.addEventListener("click", function (e) {
  const btn = e.target.closest(".export-option");
  if (!btn) return;

  e.preventDefault();

  const format = btn.dataset.format;
  const target = btn.dataset.target;

  const actions = {
    clientHistory: () =>
      format === "pdf" ? exportClientHistoryPDF() : exportClientHistoryCSV(),

    shipmentVolume: () =>
      format === "pdf"
        ? exportShipmentVolumeTablePDF()
        : exportShipmentVolumeCSV(),

    onTimeLate: () =>
      format === "pdf" ? exportOnTimeLatePDF() : exportOnTimeLateCSV(),

    shipmentStatus: () =>
      format === "pdf"
        ? exportBookingStatusTablePDF()
        : exportBookingStatusCSV(),

    topClients: () =>
      format === "pdf" ? exportTopClientsPDF() : exportTopClientsCSV(),

    salesTrend: () =>
      format === "pdf" ? exportRevenueTrendPDF() : exportRevenueTrendCSV(),

    revenueByClient: () =>
      format === "pdf"
        ? exportRevenueByClientPDF()
        : exportRevenueByClientCSV(),

    invoiceStatus: () =>
      format === "pdf" ? exportInvoiceStatusPDF() : exportInvoiceStatusCSV(),

    agingReport: () =>
      format === "pdf" ? exportAgingReportPDF() : exportAgingReportCSV(),
  };

  if (actions[target]) actions[target]();
  else console.warn("Unknown export target:", target);
});
