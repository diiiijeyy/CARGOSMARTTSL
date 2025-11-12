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

  const clientPaymentChartCanvas = document
    .getElementById("clientPaymentChart")
    ?.getContext("2d");

  let monthlyChart, clientChart;

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

  // ====================
  // Helpers
  // ====================
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

    let startTimestamp = null;
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
        el.textContent = prefix + end.toLocaleString() + suffix;
        activeAnimations.delete(el);
      }
    };

    const reqId = requestAnimationFrame(step);
    activeAnimations.set(el, reqId);
  }

  // ====================
  // Load Dashboard
  // ====================
  async function loadDashboard() {
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/accounting/dashboard",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const data = await res.json();

      // KPIs (animated)
      animateValue(totalRevenueEl, null, data.totalRevenue ?? 0, 1000, "₱");
      animateValue(outstandingAmountEl, null, data.outstandingAmount ?? 0, 1000, "₱");
      animateValue(paidInvoicesEl, null, data.paidCount ?? 0, 1000);
      animateValue(unpaidInvoicesEl, null, data.unpaidCount ?? 0, 1000);

      // ====================
      // Unpaid Invoices Table
      // ====================
      unpaidTable.innerHTML = "";
      data.unpaidInvoices.forEach((inv) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${inv.invoice_number}</td>
          <td>
            <a href="#" class="ledger-link" data-id="${inv.client_id}" data-name="${inv.client_name}">
              ${inv.client_name}
            </a>
          </td>
          <td>${formatCurrency(inv.amount_due)}</td>
          <td>${formatDate(inv.due_date)}</td>
          <td>
            <button class="btn btn-sm btn-success pay-btn" data-id="${inv.id}">
              Mark Paid
            </button>
          </td>
        `;
        unpaidTable.appendChild(tr);
      });

      // ====================
      // Paid Invoices Table
      // ====================
      paidTable.innerHTML = "";
      data.paidInvoices.forEach((inv) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${inv.invoice_number}</td>
          <td>
            <a href="#" class="ledger-link" data-id="${inv.client_id}" data-name="${inv.client_name}">
              ${inv.client_name}
            </a>
          </td>
          <td>${formatCurrency(inv.amount_due)}</td>
          <td>${formatDate(inv.updated_at)}</td>
        `;
        paidTable.appendChild(tr);
      });

      // ====================
      // Monthly Revenue Chart
      // ====================
      const monthlyLabels = data.monthlyRevenue.map((r) => r.month);
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

      // ====================
      // Payment Status Chart & Decision Analytics
      // ====================
      await initPaymentStatusChart();

      // ====================
      // Top Clients Section
      // ====================
      const topClientsContainer = document.getElementById("topClientsContainer");
      topClientsContainer.innerHTML = "";

      data.clientPayments.forEach((client) => {
        const div = document.createElement("div");
        div.className = "d-flex align-items-center justify-content-between pt-3";

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

      // ====================
      // Attach Mark Paid Actions
      // ====================
      unpaidTable.querySelectorAll(".pay-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          try {
            const res = await fetch(
              `https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices/${id}/pay`,
              { method: "PUT", credentials: "include" }
            );
            if (!res.ok) throw new Error("Failed to mark invoice as paid");
            await loadDashboard();
          } catch (err) {
            console.error("❌ Error marking invoice as paid:", err);
            showMessage("Failed to mark invoice as paid");
          }
        });
      });
    } catch (err) {
      console.error(err);
      showMessage("Error loading dashboard data");
    }
  }

  // ====================
  // Payment Status Chart & Decision Analytics
  // ====================
  async function initPaymentStatusChart() {
    try {
      const canvas = document.getElementById("payment-status-chart");
      if (!canvas) {
        console.warn("⚠️ payment-status-chart element not found in DOM.");
        return;
      }
      const ctx = canvas.getContext("2d");

      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/payment-status",
        { credentials: "include" }
      );
      let data = await res.json();

      if (!data || Object.keys(data).length === 0) data = { on_time: 0, late: 0 };

      const total = data.on_time + data.late;
      const onTimeRate = total > 0 ? ((data.on_time / total) * 100).toFixed(1) : 0;
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

      document.getElementById("paymentCompletionDisplay").textContent =
        `On-Time: ${onTimeRate}% | Late: ${lateRate}%`;

      await loadPaymentDecisionAnalytics();
    } catch (err) {
      console.error("Error loading payment status chart:", err);
    }
  }

  async function loadPaymentDecisionAnalytics() {
    const tableBody = document.getElementById("payment-decision-table-body");
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/payment-decision",
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

        let colorClass = "text-success fw-bold";
        if (decisionText.includes("require review") || decisionText.includes("removal")) {
          colorClass = "text-danger fw-bold";
        } else if (decisionText.includes("monitor")) {
          colorClass = "text-warning fw-bold";
        } else if (decisionText.includes("no available")) {
          colorClass = "text-muted fw-semibold";
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

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ====================
  // Load Ledger
  // ====================
  async function loadLedger(clientId, clientName) {
    try {
      const res = await fetch(
        `https://caiden-recondite-psychometrically.ngrok-free.dev/api/accounting/clients/${clientId}/ledger`,
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
          <td>${inv.tracking_number || "-"}</td>
        `;
        ledgerInvoices.appendChild(tr);
      });

      ledgerModal.show();
    } catch (err) {
      console.error(err);
      showMessage("Error loading client ledger");
    }
  }

  // ====================
  // Events
  // ====================
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("pay-btn")) {
      const id = e.target.dataset.id;
      showConfirm("Mark this invoice as paid?", async () => {
        try {
          const res = await fetch(
            `https://caiden-recondite-psychometrically.ngrok-free.dev/api/invoices/${id}/pay`,
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

  // ====================
  // Init Dashboard
  // ====================
  loadDashboard();
});