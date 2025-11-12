// Define primary color
const primaryColor = "#2e7fc0";

// Define hover color
const hoverColor = "#0b3cc1";

// Update all buttons dynamically with the primary color
function updateButtonStyles(button) {
    button.style.backgroundColor = primaryColor;
    button.style.borderColor = primaryColor;
    button.style.color = '#fff'; // Text color white for contrast
    
    button.onmouseover = () => {
        button.style.backgroundColor = hoverColor; // Darken color on hover
        button.style.borderColor = hoverColor;
    };

    button.onmouseleave = () => {
        button.style.backgroundColor = primaryColor;
        button.style.borderColor = primaryColor;
    };
}

// Helper function to darken color for hover effect
function darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = (num >> 16) - percent;
    const g = (num >> 8 & 0x00FF) - percent;
    const b = (num & 0x0000FF) - percent;
    return `#${(0x1000000 + (Math.max(0, r) << 16) + (Math.max(0, g) << 8) + Math.max(0, b)).toString(16).slice(1)}`;
}

// Load clients and dynamically add buttons with primary color
async function loadClients() {
    const tableBody = document.getElementById("clientTableBody");
    tableBody.innerHTML = ""; // Clear table

    try {
        const response = await fetch("http://localhost:5001/api/clients"); // Adjust route if needed
        const clients = await response.json();

        clients.forEach(client => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${client.company_name}</td>
                <td>${client.contact_person || "-"}</td>
                <td>${client.email}</td>
                <td>${client.contact_number || "-"}</td>
                <td>${client.address || "-"}</td>
                <td>
                    <button class="btn btn-sm" onclick="viewShipments(${client.id})">View Shipments</button>
                </td>
            `;
            const button = row.querySelector("button");
            updateButtonStyles(button);  // Apply primary color style
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading clients:", error);
    }
}

// Merge both viewShipments functions into one
function viewShipments(clientId) {
    document.getElementById("trackingOverlay").classList.remove("d-none");

    // You can fetch real shipment data from the backend here if necessary
    // For now, I will populate with dummy data for the modal
    document.getElementById("trackNum").textContent = "TSL123456";
    document.getElementById("trackDate").textContent = "2025-04-25";
    document.getElementById("trackTime").textContent = "10:30 AM";
    document.getElementById("trackFrom").textContent = "Manila Port";
    document.getElementById("trackTo").textContent = "Laguna";
    document.getElementById("trackStatus").innerHTML = `<i class="fas fa-check-circle"></i> Delivered`;

    // Optional: You can fetch and show real bookings for the clientId from an API
    showClientBookings(clientId);
}

// Sample function to show bookings of a specific client
async function showClientBookings(clientId) {
    const bookingTableBody = document.querySelector("#tracking-result .table tbody");
    bookingTableBody.innerHTML = ""; // Clear previous data

    try {
        const response = await fetch(`http://localhost:5001/api/bookings/${clientId}`);
        const bookings = await response.json();

        bookings.forEach(booking => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${booking.booking_id}</td>
                <td>${booking.client_name}</td>
                <td>${booking.service_type}</td>
                <td>${booking.delivery_mode}</td>
                <td>${booking.port_origin}</td>
                <td>${booking.port_delivery}</td>
                <td>${booking.gross_weight} kg / ${booking.net_weight} kg</td>
                <td>${booking.num_packages}</td>
                <td><span class="badge ${booking.status === 'Delivered' ? 'bg-success' : 'bg-warning'}">${booking.status}</span></td>
                <td>${booking.created_at}</td>
            `;
            bookingTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading client bookings:", error);
    }
}

function hideTrackingCard() {
    document.getElementById('trackingStatusCard').classList.add('d-none');
}

document.addEventListener("DOMContentLoaded", () => {
    const body = document.querySelector("body"),
          sidebar = body.querySelector("nav"),
          sidebarToggle = body.querySelector(".sidebar-toggle");

    const statusKey = "sidebar-status";

    function applySidebarState(state) {
        if (state === "close") {
            sidebar.classList.add("close");
            body.classList.add("sidebar-close");
        } else {
            sidebar.classList.remove("close");
            body.classList.remove("sidebar-close");
        }
    }

    // Check if the user has already chosen a preference
    let savedStatus = localStorage.getItem(statusKey);

    // If no saved status, apply auto logic based on screen width
    if (!savedStatus) {
        if (window.innerWidth <= 768) {
            applySidebarState("close");
            localStorage.setItem(statusKey, "auto-close");
        } else {
            applySidebarState("open");
            localStorage.setItem(statusKey, "auto-open");
        }
    } else {
        applySidebarState(savedStatus.includes("close") ? "close" : "open");
    }

    // Handle manual toggle
    sidebarToggle.addEventListener("click", () => {
        const isClosing = sidebar.classList.toggle("close");
        body.classList.toggle("sidebar-close", isClosing);
        localStorage.setItem(statusKey, isClosing ? "close" : "open");
    });

    // Optional: Reset auto behavior if screen becomes larger
    window.addEventListener("resize", () => {
        const status = localStorage.getItem(statusKey);
        if (status.startsWith("auto-")) {
            if (window.innerWidth <= 768) {
                applySidebarState("close");
            } else {
                applySidebarState("open");
            }
        }
    });

    // Load clients after sidebar setup
    loadClients();
    
    // Handle Add Client Form Submission
    const addClientButton = document.querySelector(".btn-primary"); // 'Add Client' button
    const addClientForm = document.getElementById("addClientForm");
    const clientTableBody = document.getElementById("clientTableBody");

    // Show the Add Client modal when the "Add Client" button is clicked
    addClientButton.addEventListener("click", () => {
        const modal = new bootstrap.Modal(document.getElementById("addClientModal"));
        modal.show();
    });

    // Handle the form submission
    addClientForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Get form data
        const companyName = document.getElementById("companyName").value;
        const contactPerson = document.getElementById("contactPerson").value;
        const email = document.getElementById("email").value;
        const contactNumber = document.getElementById("contactNumber").value;
        const address = document.getElementById("address").value;

        // Prepare the client data
        const newClient = {
            company_name: companyName,
            contact_person: contactPerson,
            email: email,
            contact_number: contactNumber,
            address: address,
        };

        try {
            // Send the data to the server to insert the new client into the database
            const response = await fetch("http://localhost:5001/api/clients", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newClient),
            });

            const result = await response.json();

            if (response.ok) {
                // Add the new client to the client table on success
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${companyName}</td>
                    <td>${contactPerson || "-"}</td>
                    <td>${email}</td>
                    <td>${contactNumber || "-"}</td>
                    <td>${address || "-"}</td>
                    <td>
                        <button class="btn btn-sm" onclick="viewShipments(${result.id})">View Shipments</button>
                    </td>
                `;
                const button = row.querySelector("button");
                updateButtonStyles(button); // Apply primary color style
                clientTableBody.appendChild(row);

                // Close the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById("addClientModal"));
                modal.hide();

                // Reset the form
                addClientForm.reset();
            } else {
                alert("Failed to add client. Please try again.");
            }
        } catch (error) {
            console.error("Error adding client:", error);
            alert("An error occurred while adding the client.");
        }
    });
});

// Get all the nav links
const navLinks = document.querySelectorAll('.nav-links a');

// Loop through all links
navLinks.forEach(link => {
  // Check if the link's href matches the current URL
  if (link.href === window.location.href) {
    // Add the active class to the current link
    link.classList.add('active');
  }
});
