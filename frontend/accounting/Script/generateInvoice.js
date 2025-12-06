document.addEventListener("DOMContentLoaded", loadApprovedShipments);

async function loadApprovedShipments() {
  try {
    const res = await fetch("https://cargosmarttsl-1.onrender.com/api/accounting/approved-shipments");
    const shipments = await res.json();

    const tbody = document.getElementById("approvedShipmentsBody");
    tbody.innerHTML = "";

    shipments.forEach((s) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${s.tracking_number}</td>
        <td>${s.client_id}</td>
        <td>${s.service_type}</td>
        <td>${s.status}</td>
        <td>₱${Number(s.revenue_amount).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="generateInvoice(${s.id})">
            Generate Invoice
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    alert("Failed to load shipments.");
  }
}

async function generateInvoice(shipmentId) {
  if (!confirm("Generate invoice for this shipment?")) return;

  try {
    const res = await fetch(`https://cargosmarttsl-1.onrender.com/api/accounting/invoices/generate/${shipmentId}`, {
      method: "POST"
    });

    const data = await res.json();
    if (res.ok) {
      alert("Invoice generated!");
      loadApprovedShipments();
    } else {
      alert(data.error || "Failed to generate.");
    }
  } catch (err) {
    console.error(err);
    alert("Error generating.");
  }
}