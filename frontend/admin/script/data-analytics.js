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
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/notifications",
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
    let url = `https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/shipment-volume?filter=${filterType}`;
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
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "none" ? "block" : "none";
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
    let url = `https://caiden-recondite-psychometrically.ngrok-free.dev/api/admin/reports/on-time-vs-delayed?filter=${filterType}`;
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
    document.getElementById(
      "onTimeLatePercentage"
    ).innerHTML = `On-time deliveries: <strong>${pct}%</strong>`;
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

/* -------------------------------
   Export Booking Status as PDF
--------------------------------*/
async function exportBookingStatusTablePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 55, 128);
  doc.text("TSL Freight Movers Inc.", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Booking Status Report", 14, 26);

  const f = window.shipmentStatusFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.shipmentStatusRange?.start) {
    const { start, end } = window.shipmentStatusRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  doc.setFontSize(11);
  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  const data = window.shipmentStatusData;
  if (!data) {
    showNotification(
      "No Data",
      "No shipment data available for export.",
      "warning"
    );
    return;
  }

  const total =
    (data.approved ?? 0) +
    (data.pending ?? 0) +
    (data.completed ?? 0) +
    (data.declined ?? 0);

  const body = [
    [
      "Approved",
      data.approved,
      `${((data.approved / total) * 100).toFixed(1)}%`,
    ],
    ["Pending", data.pending, `${((data.pending / total) * 100).toFixed(1)}%`],
    [
      "Completed",
      data.completed,
      `${((data.completed / total) * 100).toFixed(1)}%`,
    ],
    [
      "Declined",
      data.declined,
      `${((data.declined / total) * 100).toFixed(1)}%`,
    ],
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

  doc.text(
    "Generated by CARGOSMART: SHIPMENT TRACKING SYSTEM WITH DATA ANALYTICS",
    14,
    285
  );
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

  const f = window.shipmentStatusFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.shipmentStatusRange?.start) {
    const { start, end } = window.shipmentStatusRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  const total =
    (data.approved ?? 0) +
    (data.pending ?? 0) +
    (data.completed ?? 0) +
    (data.declined ?? 0);

  let csv = `Booking Status Report\n`;
  csv += `Filter:,${filterText}\n`;
  csv += `Generated on:,${new Date().toLocaleDateString()}\n\n`;
  csv += `Status,Count,Percentage\n`;
  csv += `Approved,${data.approved},${((data.approved / total) * 100).toFixed(
    1
  )}%\n`;
  csv += `Pending,${data.pending},${((data.pending / total) * 100).toFixed(
    1
  )}%\n`;
  csv += `Completed,${data.completed},${(
    (data.completed / total) *
    100
  ).toFixed(1)}%\n`;
  csv += `Declined,${data.declined},${((data.declined / total) * 100).toFixed(
    1
  )}%\n`;
  csv += `Total,${total},100%\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `booking_status_${f}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification(
    "Exported",
    "Booking Status report saved as CSV.",
    "success"
  );
}

/* -------------------------------
   Revenue (Monthly) - Styled
--------------------------------*/
async function initRevenueChart() {
  const canvas = document.getElementById("monthlyRevenueChart");
  if (!canvas) return;

  try {
    const ctx = canvas.getContext("2d");

    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/revenue-trend",
      { credentials: "include" }
    );
    if (!res.ok)
      throw new Error(`Failed to fetch revenue trend: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid data format");

    const labels = data.map((d) => d.label);
    const revenues = data.map((d) => Number(d.revenue));

    if (window.accountingRevenueChart instanceof Chart)
      window.accountingRevenueChart.destroy();

    // 🎨 Gradient fill (matching Shipment Volume style)
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.9)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0.3)");

    window.accountingRevenueChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: revenues,
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
              label: (ctx) => `₱${ctx.parsed.y.toLocaleString()}`,
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
              text: "Month",
              color: "#5c677d",
              font: { size: 14 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.06)" },
            ticks: {
              color: "#5c677d",
              font: { size: 12 },
              callback: (v) => `₱${v.toLocaleString()}`,
            },
            title: {
              display: true,
              text: "Revenue (₱)",
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
  } catch (err) {
    console.error("Error loading revenue chart:", err);
  }
}

/* -------------------------------
   Invoice Status Report
--------------------------------*/
async function initInvoiceStatus() {
  const canvas = document.getElementById("invoiceStatus");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/payment-status",
      { credentials: "include" }
    );
    const data = await res.json();

    new Chart(ctx, {
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
    console.error("Error loading invoice status chart:", err);
  }
}

/* -------------------------------
   Revenue by Client (Styled + Top 5)
--------------------------------*/
let revenueByClientChart;

async function loadRevenueByClientChart(mode = "single") {
  const canvas = document.getElementById("revenueByClientChart");
  if (!canvas) return;

  try {
    const ctx = canvas.getContext("2d");
    const url =
      mode === "single"
        ? "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/client-revenue"
        : "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/client-revenue-trend";

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch revenue data: ${res.status}`);
    const data = await res.json();

    if (revenueByClientChart instanceof Chart) revenueByClientChart.destroy();

    // 🎨 Shared gradient for single mode
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(0, 119, 182, 0.9)");
    gradient.addColorStop(1, "rgba(0, 119, 182, 0.3)");

    // 🎯 SINGLE MODE — Top 5 clients by revenue
    if (mode === "single") {
      // Sort by total revenue (descending)
      const sorted = data
        .sort((a, b) => Number(b.total) - Number(a.total))
        .slice(0, 5);

      // Reverse to make highest appear at top (for horizontal chart)
      const labels = sorted.map((d) => d.company_name).reverse();
      const totals = sorted.map((d) => Number(d.total)).reverse();

      revenueByClientChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              data: totals,
              backgroundColor: gradient,
              borderColor: "#0077b6",
              borderWidth: 1.5,
              borderRadius: 8,
              barThickness: 30,
              maxBarThickness: 40,
            },
          ],
        },
        options: {
          indexAxis: "y", // ✅ horizontal bars
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
                label: (ctx) => `₱${ctx.parsed.x.toLocaleString()}`,
              },
            },
          },
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: "rgba(0,0,0,0.06)" },
              ticks: {
                color: "#5c677d",
                font: { size: 12 },
                callback: (v) => `₱${v.toLocaleString()}`,
              },
              title: {
                display: true,
                text: "Revenue (₱)",
                color: "#5c677d",
                font: { size: 14 },
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: "#5c677d", font: { size: 12 } },
              title: {
                display: true,
                text: "Top 5 Clients",
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
                ? ctx.dataIndex * 150
                : 0,
          },
          transitions: {
            show: {
              animations: {
                x: { from: 0, duration: 1000, easing: "easeInOutQuad" },
              },
            },
          },
        },
      });

      // 📈 TREND MODE — keep as grouped bars
    } else {
      const months = [...new Set(data.map((d) => d.month))];
      const clients = [...new Set(data.map((d) => d.company_name))];
      const colors = [
        "#0077b6",
        "#0096c7",
        "#00b4d8",
        "#48cae4",
        "#90e0ef",
        "#5c677d",
        "#6c63ff",
        "#64dfdf",
      ];

      const datasets = clients.map((client, i) => ({
        label: client,
        data: months.map((m) => {
          const rec = data.find(
            (d) => d.company_name === client && d.month === m
          );
          return rec ? Number(rec.total) : 0;
        }),
        backgroundColor: colors[i % colors.length],
        borderRadius: 6,
      }));

      revenueByClientChart = new Chart(ctx, {
        type: "bar",
        data: { labels: months, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#5c677d", font: { size: 12 } },
            },
            tooltip: {
              backgroundColor: "#fff",
              titleColor: "#0077b6",
              bodyColor: "#023e8a",
              borderColor: "#90e0ef",
              borderWidth: 1,
              displayColors: true,
              padding: 10,
              callbacks: {
                label: (ctx) => `₱${ctx.parsed.y.toLocaleString()}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#5c677d", font: { size: 12 } },
              title: {
                display: true,
                text: "Month",
                color: "#5c677d",
                font: { size: 14 },
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(0,0,0,0.06)" },
              ticks: {
                color: "#5c677d",
                font: { size: 12 },
                callback: (v) => `₱${v.toLocaleString()}`,
              },
              title: {
                display: true,
                text: "Revenue (₱)",
                color: "#5c677d",
                font: { size: 14 },
              },
            },
          },
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
    }
  } catch (err) {
    console.error("Error loading revenue by client chart:", err);
  }
}

/* -------------------------------
   Booking Status Reports (with filters)
--------------------------------*/
let shipmentStatusChart;

async function initShipmentStatus(filterType = "this_month", customRange = {}) {
  const canvas = document.getElementById("shipmentStatus");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  try {
    //Build API URL dynamically
    let url = `https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/shipment-status?filter=${filterType}`;
    if (filterType === "custom" && customRange.start && customRange.end) {
      url += `&start=${customRange.start}&end=${customRange.end}`;
    }

    const res = await fetch(url, { credentials: "include" });
    if (!res.ok)
      throw new Error(`Failed to fetch booking status: ${res.status}`);
    const data = await res.json();

    window.shipmentStatusData = data;
    window.shipmentStatusFilter = filterType;
    window.shipmentStatusRange = customRange;

    if (shipmentStatusChart) shipmentStatusChart.destroy();

    shipmentStatusChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Approved", "Pending", "Completed", "Declined"],
        datasets: [
          {
            data: [data.approved, data.pending, data.completed, data.declined],
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
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const value = context.raw;
                const percentage =
                  total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
      },
    });

    // ✅ Update summary
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
   Booking Status Filter
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterShipmentStatusBtn");
  if (!filterBtn) return;

  // Create dropdown
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

  // Filter logic
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

          await initShipmentStatus("custom", {
            start: toYMD(start),
            end: toYMD(end),
          });

          bootstrap.Modal.getInstance(
            document.getElementById("dateRangeModal")
          )?.hide();
          filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${toYMD(
            start
          )} → ${toYMD(end)}`;
        });
      } else {
        await initShipmentStatus(selected);
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
      }
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
    let url = `https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/top-clients-bookings?filter=${filterType}`;
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 55, 128);
  doc.text("TSL Freight Movers Inc.", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Top Clients by Booking", 14, 26);

  const f = window.topClientsFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.topClientsRange?.start) {
    const { start, end } = window.topClientsRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  doc.setFontSize(11);
  doc.text(`Filter: ${filterText}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  const data = window.topClientsData || [];
  if (!data.length) {
    showNotification("No Data", "No client data found.", "warning");
    return;
  }

  const body = data.map((d, i) => [
    i + 1,
    d.name,
    d.total_bookings.toLocaleString(),
  ]);
  doc.autoTable({
    startY: 50,
    head: [["#", "Client Name", "Total Bookings"]],
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
  doc.save(`top_clients_${f}.pdf`);
  showNotification("Exported", "Top Clients saved as PDF.", "success");
}

async function exportTopClientsCSV() {
  const data = window.topClientsData || [];
  if (!data.length) {
    showNotification("No Data", "No client data found.", "warning");
    return;
  }

  const f = window.topClientsFilter || "this_month";
  let filterText = "This Month";
  if (f === "last_month") filterText = "Last Month";
  else if (f === "this_year") filterText = "This Year";
  else if (f === "custom" && window.topClientsRange?.start) {
    const { start, end } = window.topClientsRange;
    filterText = `Custom Range (${start} → ${end})`;
  }

  let csv = `Top Clients by Booking\nFilter:,${filterText}\nGenerated on:,${new Date().toLocaleDateString()}\n\n`;
  csv += "No.,Client Name,Total Bookings\n";
  data.forEach((d, i) => {
    csv += `${i + 1},"${d.name}",${d.total_bookings}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `top_clients_${f}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification("Exported", "Top Clients saved as CSV.", "success");
}

/* -------------------------------
   Top Clients by Booking Filter (Fixed & Working)
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterTopClientsBtn");
  if (!filterBtn) return;

  // Create dropdown dynamically
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

  // Toggle dropdown visibility
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = filterBtn.getBoundingClientRect();
    dropdown.style.top = rect.bottom + window.scrollY + "px";
    dropdown.style.left = rect.left + window.scrollX + "px";
    dropdown.style.display =
      dropdown.style.display === "block" ? "none" : "block";
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!filterBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // Filter logic
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";
      const selected = item.dataset.filter;

      // ✅ Handle predefined filters
      if (selected !== "custom") {
        await initTopClients(selected); // re-render chart
        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${item.textContent}`;
        showNotification({
          variant: "success",
          title: "Filter Applied",
          message: `Top Clients updated for ${item.textContent}.`,
        });
        return;
      }

      // ✅ Handle custom date range
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

        await initTopClients("custom", {
          start: toYMD(start),
          end: toYMD(end),
        });

        bootstrap.Modal.getInstance(
          document.getElementById("dateRangeModal")
        )?.hide();

        filterBtn.innerHTML = `<i class="fas fa-filter me-1"></i> ${toYMD(
          start
        )} → ${toYMD(end)}`;
        showNotification({
          variant: "success",
          title: "Custom Range Applied",
          message: `${toYMD(start)} → ${toYMD(end)}`,
        });
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
    "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/clients",
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
      <td>${client.late_shipments}</td>
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
    "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/aging",
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
  initRevenueChart();
  initInvoiceStatus();
  loadRevenueByClientChart("single");
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
   Shipment Volume Export Handlers
--------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".export-option").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const format = item.dataset.format;
      const target = item.dataset.target;

      switch (target) {
        case "shipmentVolume":
          if (format === "pdf") exportShipmentVolumeTablePDF();
          else exportShipmentVolumeCSV();
          break;

        case "onTimeLate":
          if (format === "pdf") exportOnTimeLatePDF();
          else exportOnTimeLateCSV();
          break;

        case "shipmentStatus":
          if (format === "pdf") exportBookingStatusTablePDF();
          else exportBookingStatusCSV();
          break;

        case "topClients":
          if (format === "pdf") exportTopClientsPDF();
          else exportTopClientsCSV();
          break;

        default:
          console.warn("Unknown export target:", target);
      }
    });
  });
});

/* -------------------------------
   Client Shipment History Filter
--------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
  const filterBtn = document.getElementById("filterRevenueTrendBtn");
  if (!filterBtn) return;

  let clients = [];
  try {
    const res = await fetch(
      "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/clients",
      { credentials: "include" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    clients = await res.json();

    if (!Array.isArray(clients) || clients.length === 0) {
      showNotification("Info", "No clients available.", "info");
      return;
    }
  } catch (err) {
    console.error("❌ Failed to fetch clients:", err);
    showNotification("Error", "Could not load client list.", "error");
    return;
  }

  // 🔹 Create dropdown container
  const wrapper = document.createElement("div");
  wrapper.className = "dropdown position-relative d-inline-block";

  // 🔹 Move filter button into wrapper
  filterBtn.parentNode.insertBefore(wrapper, filterBtn);
  wrapper.appendChild(filterBtn);

  // 🔹 Create dropdown
  const dropdown = document.createElement("ul");
  dropdown.className = "dropdown-menu shadow-sm show mt-2 border-0 rounded-3";
  dropdown.style.position = "absolute";
  dropdown.style.zIndex = "1050";
  dropdown.style.display = "none";
  dropdown.style.minWidth = "220px";

  dropdown.innerHTML = `
    <li><a class="dropdown-item" href="#" data-client="all"><strong>All Clients</strong></a></li>
    <li><hr class="dropdown-divider"></li>
    ${clients
      .map(
        (c) => `
        <li><a class="dropdown-item" href="#" data-client="${encodeURIComponent(
          c.client_name
        )}">
          ${c.client_name}
        </a></li>`
      )
      .join("")}
  `;
  wrapper.appendChild(dropdown);

  // 🔹 Toggle dropdown visibility
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === "block";
    document
      .querySelectorAll(".dropdown-menu")
      .forEach((d) => (d.style.display = "none"));
    dropdown.style.display = isVisible ? "none" : "block";
  });

  // 🔹 Hide when clicking outside
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) dropdown.style.display = "none";
  });

  // 🔹 Handle client selection
  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      dropdown.style.display = "none";

      const clientName = decodeURIComponent(item.dataset.client);
      const tbody = document.getElementById("clientHistoryTableBody");
      if (!tbody) return;

      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Loading...</td></tr>`;

      try {
        let url =
          "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/client-history";
        if (clientName !== "all") {
          url += `?client_name=${encodeURIComponent(clientName)}`;
        }

        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        tbody.innerHTML = "";

        if (!Array.isArray(data) || data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No shipments found</td></tr>`;
          showNotification(
            "Info",
            `No shipments found for ${clientName}.`,
            "info"
          );
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
        console.error("❌ Error filtering client history:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load client data</td></tr>`;
        showNotification("Error", "Failed to load client data.", "error");
      }
    });
  });
});

/* -------------------------------
   Export Client Shipment History (PDF & CSV)
--------------------------------*/
async function exportClientHistoryPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 55, 128);
  doc.text("TSL Freight Movers Inc.", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Client Shipment & Booking History", 14, 26);

  const selectedClient =
    window.clientHistoryFilter && window.clientHistoryFilter !== "all"
      ? window.clientHistoryFilter
      : "All Clients";

  doc.setFontSize(11);
  doc.text(`Client: ${selectedClient}`, 14, 34);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 40);

  const data = window.clientHistoryData || [];
  if (!Array.isArray(data) || data.length === 0) {
    showNotification({
      variant: "warning",
      title: "No Data",
      message: "No shipment data available for export.",
    });
    return;
  }

  // Format table
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

  doc.autoTable({
    startY: 50,
    head: [
      [
        "#",
        "Company Name",
        "Tracking #",
        "Service Type",
        "Origin",
        "Destination",
        "Status",
        "Date",
      ],
    ],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [96, 173, 244],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 25 },
      6: { cellWidth: 25 },
      7: { cellWidth: 22 },
    },
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    "Generated by CARGOSMART: SHIPMENT TRACKING SYSTEM WITH DATA ANALYTICS",
    14,
    285
  );

  doc.save(
    `client_shipment_history_${selectedClient.replace(/\s+/g, "_")}.pdf`
  );

  showNotification({
    variant: "success",
    title: "Exported",
    message: `Client shipment history for ${selectedClient} saved as PDF.`,
  });
}

async function exportClientHistoryCSV() {
  const data = window.clientHistoryData || [];
  if (!Array.isArray(data) || data.length === 0) {
    showNotification({
      variant: "warning",
      title: "No Data",
      message: "No shipment data available for export.",
    });
    return;
  }

  const selectedClient =
    window.clientHistoryFilter && window.clientHistoryFilter !== "all"
      ? window.clientHistoryFilter
      : "All Clients";

  let csv = `Client Shipment & Booking History\nClient:,${selectedClient}\nGenerated on:,${new Date().toLocaleDateString()}\n\n`;
  csv +=
    "No.,Company Name,Tracking #,Service Type,Origin,Destination,Status,Shipment Date\n";

  data.forEach((d, i) => {
    csv += `${i + 1},"${d.client_name}","${d.tracking_number}","${
      d.service_type
    }","${d.origin}","${d.destination}","${d.status}","${new Date(
      d.shipment_date
    ).toLocaleDateString()}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `client_shipment_history_${selectedClient.replace(
    /\s+/g,
    "_"
  )}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showNotification({
    variant: "success",
    title: "Exported",
    message: `Client shipment history for ${selectedClient} saved as CSV.`,
  });
}
