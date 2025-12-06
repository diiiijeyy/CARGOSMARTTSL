const API_BASE_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5001"
    : "https://cargosmarttsl-1.onrender.com";

document.addEventListener("DOMContentLoaded", function () {
    const loginContainer = document.getElementById("login-container");
    const signupContainer = document.getElementById("signup-container");
    const resetPasswordContainer = document.getElementById("reset-password-container");
    const showSignupBtn = document.getElementById("showSignup");
    const showLoginBtn = document.getElementById("showLogin");
    const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
    const backToLoginBtn = document.getElementById("backToLogin");
    const sendResetCodeBtn = document.getElementById("resetCodeBtn");
    const resetCodeInput = document.getElementById("resetCode");
    const attemptMessage = document.getElementById("attemptMessage"); // Reference to the attempt message element
    const emailInput = document.getElementById("username"); // Reference to the email input
    const alertMessage = document.getElementById("alertMessage"); // Reference to alert message element
  

    let loginAttempts = 0; // Initialize attempt counter

    // Function to show only the selected container
    function showOnly(containerToShow) {
        document.querySelectorAll(".card.shadow.p-4").forEach(container => container.classList.add("d-none"));
        containerToShow.classList.remove("d-none");
    }

    // Hide the login attempt message initially
    if (attemptMessage) {
        attemptMessage.style.display = "none";
    }

    if (showSignupBtn) showSignupBtn.addEventListener("click", () => showOnly(signupContainer));
    if (showLoginBtn) showLoginBtn.addEventListener("click", () => showOnly(loginContainer));
    if (forgotPasswordBtn) forgotPasswordBtn.addEventListener("click", () => showOnly(resetPasswordContainer));
    if (backToLoginBtn) backToLoginBtn.addEventListener("click", () => showOnly(loginContainer));

    // Handle login form submission
    document.getElementById("loginForm").addEventListener("submit", async function (e) {
        e.preventDefault();

        const input = document.getElementById("username").value.trim(); // username or email
        const password = document.getElementById("password").value.trim();

        // Clear any previous error message
        const errorMessage = document.getElementById("loginErrorMessage");
        if (errorMessage) {
            errorMessage.remove();
        }

        // Check for empty fields
        if (!input || !password) {
            return;
        }

        // Check if max attempts reached
        if (loginAttempts === 3) {
            // Lock the UI visually, but still allow backend tracking
            showOnly(resetPasswordContainer);
            alert("Too many login attempts. Redirecting to password reset.");
        
            // OPTIONAL: Disable login form inputs to prevent more tries from the user
            document.getElementById("username").disabled = true;
            document.getElementById("password").disabled = true;
            document.getElementById("loginBtn").disabled = true; // if you have a login button
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                credentials: 'include', // ✅ important for session cookies
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input, password }) // send as "input"
            });

            const data = await response.json();

            if (response.ok) {
                // Reset attempts on successful login
                loginAttempts = 0;
                attemptMessage.style.display = "none"; // Hide the login attempts message

                // Store token only if returned (admin)
                if (data.token) {
                    localStorage.setItem('token', data.token);
                }

                localStorage.setItem('user', JSON.stringify(data.user));

                // Redirect based on role
                if (data.user.role === 'admin') {
                    window.location.href = "./admin/admin.html";
                } else if (data.user.role === 'client') {
                    window.location.href = "client/pages/clientdashboard.html";
                } else {
                    window.location.href = "dashboard.html";
                }
            } else {
                loginAttempts++; // Increment failed attempts

                // Show the alert message
                if (alertMessage) {
                    alertMessage.classList.remove("d-none");  // Remove the "d-none" class to show the alert
                }

                // Create a toast-style error message
const toast = document.createElement("div");
toast.textContent = data.error || "Invalid credentials.";
toast.style.position = "fixed";
toast.style.bottom = "20px";
toast.style.left = "50%";
toast.style.transform = "translateX(-50%)";
toast.style.backgroundColor = "#dc3545"; // Bootstrap danger color
toast.style.color = "white";
toast.style.padding = "12px 20px";
toast.style.borderRadius = "6px";
toast.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
toast.style.fontSize = "14px";
toast.style.zIndex = "9999";
toast.style.opacity = "1";
toast.style.transition = "opacity 0.5s";

// Append to body
document.body.appendChild(toast);

// Fade out after 3 seconds
setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
}, 3000);


                // Update the login attempt message
                if (attemptMessage) {
                    attemptMessage.style.display = "block"; // Show the attempt message
                    attemptMessage.textContent = `Login Attempts: ${loginAttempts}`;
                }

                if (loginAttempts >= 3) {
                    // Redirect to the forgot password page after 3 attempts
                    showOnly(resetPasswordContainer);
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            alert("An error occurred during login. Please try again.");
        }
    });

    // Handle sending reset code for password reset
    if (sendResetCodeBtn) {
        sendResetCodeBtn.addEventListener("click", async function () {
            const email = document.getElementById("resetEmail").value.trim();

            if (!email) {
                alert("Please enter your email first.");
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/send-reset-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();

                if (response.ok) {
                    alert("Reset code sent to your email.");
                    resetCodeInput.disabled = false;
                } else {
                    alert(data.error || "Failed to send reset code.");
                }
            } catch (error) {
                console.error('Reset code error:', error);
                alert("An error occurred. Please try again.");
            }
        });
    }

    // Handle reset password form submission
    document.getElementById("resetPasswordForm").addEventListener("submit", async function (e) {
        e.preventDefault();

        const email = document.getElementById("resetEmail").value.trim();
        const resetCode = document.getElementById("resetCode").value.trim();
        const newPassword = document.getElementById("resetNewPassword").value.trim();
        const confirmPassword = document.getElementById("resetConfirmPassword").value.trim();

        if (!email || !resetCode || !newPassword || !confirmPassword) {
            alert("Please fill in all fields.");
            return;
        }

        // Check password complexity
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordPattern.test(newPassword)) {
            alert("Password must contain at least one uppercase letter, one lowercase letter, one number, and one symbol.");
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, resetCode, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                alert("Password reset successful! Please login.");
                showOnly(loginContainer);
            } else {
                alert(data.error || "Failed to reset password.");
            }
        } catch (error) {
            console.error('Reset password error:', error);
            alert("An error occurred. Please try again.");
        }
    });

    // Handle signup form submission
    document.getElementById("signupForm").addEventListener("submit", async function (e) {
        e.preventDefault();

        const company_name = document.getElementById("signupCompanyName").value.trim();
        const contact_person = document.getElementById("signupContactPerson").value.trim();
        const contact_number = document.getElementById("signupContactNumber").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value.trim();
        const confirmPassword = document.getElementById("signupConfirmPassword").value.trim();
        const address = document.getElementById("signupAddress").value.trim();

        // Check if all fields are filled
        if (!company_name || !contact_person || !contact_number || !email || !password || !confirmPassword || !address) {
            alert("Please fill out all fields.");
            return;
        }

        // Check password complexity before checking if passwords match
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordPattern.test(password)) {
            alert("Password must contain at least one uppercase letter, one lowercase letter, one number, and one symbol.");
            return;
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/client/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name,
                    contact_person,
                    contact_number,
                    email,
                    password,
                    address
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert("Signup successful! You can now log in.");
                document.getElementById("signupForm").reset();
                showOnly(loginContainer); 
            } else {
                alert(data.error || "Signup failed. Please try again.");
            }
        } catch (error) {
            console.error('Signup error:', error);
            alert("An error occurred. Please try again.");
        }
    });
});
