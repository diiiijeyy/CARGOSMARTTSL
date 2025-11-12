document.addEventListener("DOMContentLoaded", () => {
  // --------------------------------
  // Chart.js variables
  // --------------------------------
  let monthlyRevenueChart;
  let clientChart;
  let agingChart;

  // Get canvas contexts
  const revenueCtx = document
    .getElementById("monthlyRevenueChart")
    .getContext("2d");
  const clientCtx = document
    .getElementById("revenueByClientChart")
    .getContext("2d");
  const agingCtx = document.getElementById("agingReportChart").getContext("2d");

  // -------------------------------
  // Helpers
  // -------------------------------
  const formatCurrency = (val) => `₱${Number(val || 0).toLocaleString()}`;

  // -------------------------------
  // Monthly Revenue Trend (Chart.js)
  // ---------------------------------
  async function fetchMonthlyRevenueTrend() {
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/revenue-trend",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch monthly revenue trend");
      return await res.json();
      // [{ month: "2025-04", label: "Apr 2025", revenue: 0 }, ...]
    } catch (err) {
      console.error("Error fetching monthly revenue trend:", err);
      return [];
    }
  }

  function renderMonthlyRevenue(labels, values) {
    if (window.monthlyRevenueChart instanceof Chart) {
      window.monthlyRevenueChart.destroy();
    }
    window.monthlyRevenueChart = new Chart(
      document.getElementById("monthlyRevenueChart").getContext("2d"),
      {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Monthly Revenue",
              data: values,
              backgroundColor: "rgba(32, 104, 169, 0.2)",
              borderColor: "#2068a9",
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: "#2068a9",
              pointRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              title: { display: true, text: "Month" },
              grid: { display: false },
            },
            y: {
              title: { display: true, text: "Revenue (₱)" },
              beginAtZero: true,
            },
          },
        },
      }
    );
  }

  async function loadMonthlyRevenue() {
    const revenueData = await fetchMonthlyRevenueTrend();
    const labels = revenueData.map((r) => r.label); // e.g. ["Apr 2025", "May 2025", ...]
    const values = revenueData.map((r) => Number(r.revenue));
    renderMonthlyRevenue(labels, values);
  }

  // Auto load
  loadMonthlyRevenue();

  // -------------------------------
  // 2️⃣ Revenue by Client (Top Clients this month)
  // -------------------------------
  async function fetchRevenueByClient() {
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/analytics/client-revenue",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch client revenue");
      return await res.json(); // [{ company_name: 'ABC', total: 15000 }, ...]
    } catch (err) {
      console.error("Error fetching revenue by client:", err);
      return [];
    }
  }

  async function loadRevenueByClient() {
    const clients = await fetchRevenueByClient();
    const labels = clients.map((c) => c.company_name);
    const values = clients.map((c) => Number(c.total));

    if (clientChart) clientChart.destroy();
    clientChart = new Chart(clientCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Revenue (₱)",
            data: values,
            backgroundColor: [
              "#03045e",
              "#0077b6",
              "#00b4d8",
              "#90e0ef",
              "#48cae4",
            ],
            borderRadius: 5,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            title: { display: true, text: "Revenue (₱)" },
            beginAtZero: true,
          },
          y: {
            title: { display: true, text: "Clients" },
            grid: { display: false },
          },
        },
      },
    });
  }

  document
    .getElementById("applyClientFilter")
    .addEventListener("click", async () => {
      const selectedClient = document.getElementById("selectClient").value;
      const clients = await fetchRevenueByClient();

      if (!selectedClient) {
        loadRevenueByClient();
      } else {
        const client = clients.find((c) => c.company_name === selectedClient);
        if (client) {
          clientChart.data.labels = [client.company_name];
          clientChart.data.datasets[0].data = [Number(client.total)];
          clientChart.update();
        }
      }
    });

  document.getElementById("exportClientChart").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = clientChart.toBase64Image();
    link.download = "RevenueByClient.png";
    link.click();
  });

  // -------------------------------
  // 3️⃣ Aging Report (Unpaid Invoices by Age)
  // -------------------------------
  async function fetchAgingReport() {
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/aging",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch aging report");
      return await res.json(); // { "0_30": 12, "31_60": 7, "61_90": 4, "90_plus": 2 }
    } catch (err) {
      console.error("Error fetching aging report:", err);
      return {};
    }
  }

  async function loadAgingReport() {
    const aging = await fetchAgingReport();
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

  document.getElementById("exportAgingChart").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = agingChart.toBase64Image();
    link.download = "AgingReport.png";
    link.click();
  });

  // -------------------------------
  // Init Load
  // -------------------------------
  loadMonthlyRevenue();
  loadRevenueByClient();
  loadAgingReport();
});

// ================================
// Fetch Invoice Status Report
// ================================
document.addEventListener("DOMContentLoaded", () => {
  async function fetchInvoiceStatus() {
    try {
      const res = await fetch(
        "https://caiden-recondite-psychometrically.ngrok-free.dev/api/reports/invoice-status",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch invoice status");
      return await res.json();
    } catch (err) {
      console.error("Error fetching invoice status:", err);
      return [];
    }
  }

  // ================================
  // Render Invoice Status Table
  // ================================
  function renderInvoiceStatusTable(invoices) {
    const tbody = document.getElementById("invoiceStatusTable");
    tbody.innerHTML = "";

    if (!invoices.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No invoices found</td></tr>`;
      return;
    }

    invoices.forEach((inv) => {
      const row = document.createElement("tr");

      let statusClass = "secondary";
      if (inv.status?.toLowerCase() === "paid") statusClass = "success";
      else if (inv.status?.toLowerCase() === "unpaid") statusClass = "danger";
      else if (inv.status?.toLowerCase() === "pending") statusClass = "warning";

      row.innerHTML = `
      <td>${inv.invoice_no || inv.invoice_number}</td>
      <td>${inv.client || inv.company_name}</td>
      <td>₱${Number(inv.amount || inv.amount_due).toLocaleString()}</td>
      <td><span class="badge bg-${statusClass}">${inv.status}</span></td>
      <td>${new Date(inv.due_date).toLocaleDateString()}</td>
    `;

      tbody.appendChild(row);
    });
  }

  // ================================
  // Init Load
  // ================================
  async function loadInvoiceStatus() {
    const invoices = await fetchInvoiceStatus();
    console.log("Fetched invoices:", invoices);
    renderInvoiceStatusTable(invoices);
  }

  loadInvoiceStatus();
});
