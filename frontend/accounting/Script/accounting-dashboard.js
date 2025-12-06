let currentPage = 1;
const rowsPerPage = 5;

// dynamic data source
let activeData = [];
let activeRenderer = null;

let unpaidData = [];
let paidData = [];
let paymentDecisionData = [];

let agingChart;
const agingCtx = document.getElementById("agingReportChart")?.getContext("2d");

/* ============================
   PAGE MAIN LOADER
============================ */
document.addEventListener("DOMContentLoaded", () => {
  // ====================
  // DOM Elements
  // ====================
  const totalRevenueEl = document.getElementById("totalRevenue");
  const outstandingAmountEl = document.getElementById("outstandingAmount");
  const paidInvoicesEl = document.getElementById("paidInvoices");
  const unpaidInvoicesEl = document.getElementById("unpaidInvoices");

  const unpaidTable = document.getElementById("unpaidTable");
  const paidTable = document.getElementById("paidTable");

  const monthlyRevenueChartCanvas = document
    .getElementById("monthlyRevenueChart")
    ?.getContext("2d");

  let monthlyChart;

  const ledgerModal = new bootstrap.Modal(
    document.getElementById("ledgerModal")
  );
  const ledgerClientName = document.getElementById("ledgerClientName");
  const ledgerClientContact = document.getElementById("ledgerClientContact");
  const ledgerInvoices = document.getElementById("ledgerInvoices");

  const agingCurrent = document.getElementById("agingCurrent");
  const aging1to30 = document.getElementById("aging1to30");
  const aging31to60 = document.getElementById("aging31to60");
  const aging61to90 = document.getElementById("aging61to90");
  const aging90plus = document.getElementById("aging90plus");

  /* ====================
     Helpers
  ==================== */
  const formatCurrency = (val) => `₱${Number(val || 0).toLocaleString()}`;
  const formatDate = (val) => (val ? new Date(val).toLocaleDateString() : "-");

  const showMessage = (msg) => alert(msg);
  const showConfirm = (msg, onYes) => {
    if (confirm(msg)) onYes();
  };

  /* -------------------------------
     Animated Counter Helper
  --------------------------------*/
  const activeAnimations = new WeakMap();

  function animateValue(el, start, end, duration, prefix = "", suffix = "") {
    if (!el) return;
    if (activeAnimations.has(el)) {
      cancelAnimationFrame(activeAnimations.get(el));
      activeAnimations.delete(el);
    }
    if (start === null || start === undefined) {
      const parsed = parseInt(el.textContent.replace(/[^\d]/g, ""));
      start = isNaN(parsed) ? 0 : parsed;
    }
    const startTime = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const value = Math.floor(start + (end - start) * progress);
      el.textContent = prefix + value.toLocaleString() + suffix;
      if (progress < 1) {
        const id = requestAnimationFrame(animate);
        activeAnimations.set(el, id);
      } else {
        activeAnimations.delete(el);
      }
    };
    const id = requestAnimationFrame(animate);
    activeAnimations.set(el, id);
  }

  /* ================================
      AGING REPORT
================================ */
  async function fetchAgingReport() {
    try {
      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/reports/aging",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch aging report");
      return await res.json(); // { 0_30, 31_60, 61_90, 90_plus }
    } catch (err) {
      console.error("Error fetching aging report:", err);
      return {};
    }
  }

  function renderAgingReportChart(aging) {
    if (!agingCtx) return;

    const labels = ["0–30 days", "31–60 days", "61–90 days", "90+ days"];
    const values = [
      Number(aging["0_30"] || 0),
      Number(aging["31_60"] || 0),
      Number(aging["61_90"] || 0),
      Number(aging["90_plus"] || 0),
    ];

    if (agingChart) agingChart.destroy();

    agingChart = new Chart(agingCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Unpaid Invoices",
            data: values,
            backgroundColor: ["#03045e", "#0077b6", "#00b4d8", "#90e0ef"],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "Invoice Age (Days)" } },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Number of Unpaid Invoices" },
            ticks: { stepSize: 1 },
          },
        },
      },
    });
  }

  async function loadAgingReport() {
    const aging = await fetchAgingReport();
    renderAgingReportChart(aging);
  }

  /* ===================
      RENDERERS
  =================== */

  function renderPaymentDecisionTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const rows = paymentDecisionData.slice(start, start + rowsPerPage);

    const tbody = document.getElementById("payment-decision-table-body");
    tbody.innerHTML = "";

    rows.forEach((row) => {
      const total = Number(row.total_invoices) || 0;
      const onTime = Number(row.on_time) || 0;
      const late = Number(row.late) || 0;

      const onTimeRate = total ? ((onTime / total) * 100).toFixed(2) : "0.00";
      const lateRate = total ? ((late / total) * 100).toFixed(2) : "0.00";

      const decision = row.status_flag || "Good Standing";
      const d = decision.toLowerCase();

      let colorClass = "text-success fw-semibold";

      if (d.includes("require review") || d.includes("removal")) {
        colorClass = "text-danger fw-bold";
      } else if (d.includes("monitor")) {
        colorClass = "text-warning fw-bold";
      } else if (d.includes("no available")) {
        colorClass = "text-muted fw-semibold";
      }

      tbody.insertAdjacentHTML(
        "beforeend",
        `
      <tr>
        <td>${row.company_name || "—"}</td>
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

    renderPagination(
      paymentDecisionData.length,
      "pagination",
      renderPaymentDecisionTable
    );
  }

  function renderUnpaidTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const rows = unpaidData.slice(start, start + rowsPerPage);

    unpaidTable.innerHTML = rows
      .map(
        (inv) => `
        <tr>
          <td>${inv.invoice_number}</td>
          <td><a href="#" class="ledger-link" data-id="${
            inv.client_id
          }" data-name="${inv.client_name}">${inv.client_name}</a></td>
          <td>${formatCurrency(inv.amount_due)}</td>
          <td>${formatDate(inv.due_date)}</td>
        </tr>`
      )
      .join("");

    renderPagination(unpaidData.length, "unpaidPagination", renderUnpaidTable);
  }

  function renderPaidTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const rows = paidData.slice(start, start + rowsPerPage);

    paidTable.innerHTML = rows
      .map(
        (inv) => `
        <tr>
          <td>${inv.invoice_number}</td>
          <td><a href="#" class="ledger-link" data-id="${
            inv.client_id
          }" data-name="${inv.client_name}">${inv.client_name}</a></td>
          <td>${formatCurrency(inv.amount_due)}</td>
          <td>${formatDate(inv.updated_at)}</td>
        </tr>`
      )
      .join("");

    renderPagination(paidData.length, "paidPagination", renderPaidTable);
  }

  /* ===================
      TAB SWITCHING
  =================== */

  document
    .querySelector("[data-bs-target='#unpaidTab']")
    .addEventListener("click", () => {
      currentPage = 1;
      activeRenderer = renderUnpaidTable;
      activeData = unpaidData;
      renderUnpaidTable();
    });

  document
    .querySelector("[data-bs-target='#paidTab']")
    .addEventListener("click", () => {
      currentPage = 1;
      activeRenderer = renderPaidTable;
      activeData = paidData;
      renderPaidTable();
    });

  /* ====================
      LOAD DASHBOARD
  ==================== */
  async function loadDashboard() {
    try {
      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/accounting/dashboard",
        {
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const data = await res.json();

      animateValue(totalRevenueEl, null, data.totalRevenue ?? 0, 1000, "₱");
      animateValue(
        outstandingAmountEl,
        null,
        data.outstandingAmount ?? 0,
        1000,
        "₱"
      );
      animateValue(paidInvoicesEl, null, data.paidCount ?? 0, 1000);
      animateValue(unpaidInvoicesEl, null, data.unpaidCount ?? 0, 1000);

      unpaidData = data.unpaidInvoices;
      paidData = data.paidInvoices;

      activeRenderer = renderUnpaidTable;
      activeData = unpaidData;
      renderUnpaidTable();

      /* ---------------------
         MONTHLY REVENUE CHART
      ---------------------- */
      const monthlyLabels = data.monthlyRevenue.map(
        (r) => r.month.split(" ")[0]
      );
      const monthlyValues = data.monthlyRevenue.map((r) => parseFloat(r.total));

      if (monthlyChart) monthlyChart.destroy();
      monthlyChart = new Chart(monthlyRevenueChartCanvas, {
        type: "line",
        data: {
          labels: monthlyLabels,
          datasets: [
            {
              data: monthlyValues,
              borderColor: "#2e7fc0",
              backgroundColor: "rgba(46,127,192,0.2)",
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          animation: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      });

      /* ---------------------
         Payment Status
      ---------------------- */
      await initPaymentStatusChart();

      /* ---------------------
      AGING REPORT
      ---------------------- */
      await loadAgingReport();

      /* ---------------------
         TOP CLIENTS
      ---------------------- */
      const topClientsContainer = document.getElementById(
        "topClientsContainer"
      );
      topClientsContainer.innerHTML = "";

      data.clientPayments.forEach((client) => {
        const div = document.createElement("div");
        div.className =
          "d-flex align-items-center justify-content-between pt-3";

        const nameDiv = document.createElement("div");
        nameDiv.className = "d-flex flex-column";
        nameDiv.innerHTML = `<span class="fw-bold" style="font-size:1rem;">${client.client_name}</span>`;

        const valueSpan = document.createElement("span");
        valueSpan.className = "text-success fw-bold";
        valueSpan.style.fontSize = "1rem";
        valueSpan.textContent = "₱0";

        div.appendChild(nameDiv);
        div.appendChild(valueSpan);
        topClientsContainer.appendChild(div);

        animateValue(valueSpan, 0, client.total ?? 0, 1000, "₱");
      });
    } catch (err) {
      console.error(err);
      showMessage("Error loading dashboard data");
    }
  }

  /* ====================
      Payment Status Chart
  ==================== */
  async function initPaymentStatusChart() {
    try {
      const canvas = document.getElementById("payment-status-chart");
      if (!canvas) return;

      const ctx = canvas.getContext("2d");

      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/analytics/payment-status",
        { credentials: "include" }
      );
      let data = await res.json();
      if (!data || Object.keys(data).length === 0)
        data = { on_time: 0, late: 0 };

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
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${ctx.raw}`,
              },
            },
          },
        },
      });

      document.getElementById(
        "paymentCompletionDisplay"
      ).textContent = `On-Time: ${onTimeRate}% | Late: ${lateRate}%`;

      await loadPaymentDecisionAnalytics();
    } catch (err) {
      console.error("Error loading payment status chart:", err);
    }
  }

  /* ====================
      Payment Decision Analytics
  ==================== */
  async function loadPaymentDecisionAnalytics() {
    try {
      const res = await fetch(
        "https://cargosmarttsl-1.onrender.com/api/analytics/payment-decision",
        { credentials: "include" }
      );
      paymentDecisionData = await res.json();

      currentPage = 1;
      activeRenderer = renderPaymentDecisionTable;
      activeData = paymentDecisionData;
      renderPaymentDecisionTable();
    } catch (err) {
      console.error("Error loading payment decision analytics:", err);
    }
  }

  /* ====================
      Ledger
  ==================== */
  async function loadLedger(clientId, clientName) {
    try {
      const res = await fetch(
        `https://cargosmarttsl-1.onrender.com/api/accounting/clients/${clientId}/ledger`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch ledger");
      const data = await res.json();

      ledgerClientName.textContent = clientName;
      ledgerClientContact.textContent = [
        data.client.contact_name || "",
        data.client.email || "",
        data.client.contact_number || "",
      ]
        .filter(Boolean)
        .join(" | ");

      animateValue(agingCurrent, null, data.aging.current ?? 0, 1000, "₱");
      animateValue(aging1to30, null, data.aging["1-30"] ?? 0, 1000, "₱");
      animateValue(aging31to60, null, data.aging["31-60"] ?? 0, 1000, "₱");
      animateValue(aging61to90, null, data.aging["61-90"] ?? 0, 1000, "₱");
      animateValue(aging90plus, null, data.aging["90+"] ?? 0, 1000, "₱");

      ledgerInvoices.innerHTML = "";
      data.invoices.forEach((inv) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${inv.invoice_number}</td>
          <td>${formatCurrency(inv.amount_due)}</td>
          <td>${inv.status}</td>
          <td>${formatDate(inv.due_date)}</td>
          <td>${inv.tracking_number || "-"}</td>`;
        ledgerInvoices.appendChild(tr);
      });

      ledgerModal.show();
    } catch (err) {
      console.error(err);
      showMessage("Error loading client ledger");
    }
  }

  /* ====================
      EVENTS (Mark Paid / Ledger)
  ==================== */
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("pay-btn")) {
      const id = e.target.dataset.id;
      showConfirm("Mark this invoice as paid?", async () => {
        try {
          const res = await fetch(
            `https://cargosmarttsl-1.onrender.com/api/invoices/${id}/pay`,
            { method: "PUT", credentials: "include" }
          );
          if (!res.ok) throw new Error("Failed to mark invoice paid");
          await loadDashboard();
          showMessage("Invoice marked as paid!");
        } catch (err) {
          console.error(err);
          showMessage("Error marking invoice as paid");
        }
      });
    }

    if (e.target.classList.contains("ledger-link")) {
      e.preventDefault();
      const clientId = e.target.dataset.id;
      const clientName = e.target.dataset.name;
      loadLedger(clientId, clientName);
    }
  });

  /* ====================
      INIT PAGE
  ==================== */
  loadDashboard();
});

/* ==========================
   Pagination Component
========================== */
function renderPagination(totalItems, paginationId, onPageChange) {
  const pagination = document.getElementById(paginationId);
  if (!pagination) return;

  pagination.innerHTML = "";
  const totalPages = Math.ceil(totalItems / rowsPerPage);
  if (totalPages <= 1) return;

  const windowSize = 3;
  const currentWindow = Math.floor((currentPage - 1) / windowSize);
  const windowStart = currentWindow * windowSize + 1;
  const windowEnd = Math.min(windowStart + windowSize - 1, totalPages);

  const makeLi = (html, className = "", onClick = null) => {
    const li = document.createElement("li");
    li.className = `page-item ${className}`;
    li.innerHTML = html;
    if (onClick)
      li.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
    return li;
  };

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-left"></i></a>`,
      currentPage === 1 ? "disabled" : "",
      () => {
        currentPage--;
        onPageChange();
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
          onPageChange();
        }
      )
    );
  }

  pagination.appendChild(
    makeLi(
      `<a class="page-link custom-page" href="#"><i class="fas fa-chevron-right"></i></a>`,
      currentPage === totalPages ? "disabled" : "",
      () => {
        currentPage++;
        onPageChange();
      }
    )
  );
}
