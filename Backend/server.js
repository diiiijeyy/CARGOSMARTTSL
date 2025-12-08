require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const http = require("http");
const axios = require("axios"); // Only if you use it
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const UAParser = require("ua-parser-js");
const logAction = require("./utils/auditLogger");
const pgSession = require("connect-pg-simple")(session);
const fetch = require("node-fetch");

//pinaltan ni jade

// =====================================
// ✅ Server setup
// =====================================
const PORT = process.env.PORT || 5001;
const app = express();
const server = http.createServer(app);
const WebSocket = require("ws");
const wss = new WebSocket.Server({ server });

// ==========================
// 📡 Broadcast driver GPS to Admin panels
// ==========================
function broadcastToAdmins(payload) {
  const json = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

//pinaltan ni jade

// =====================================
// 📁 Serve Frontend (Ngrok compatible)
// =====================================
app.use("/frontend", express.static(path.join(__dirname, "../frontend")));
//for frontend

app.use(express.static(path.join(__dirname, "frontend")));

// =====================================
// 🌐 CORS Configuration (Ngrok + Credentials)
// =====================================
app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] === "https") req.secure = true;
  next();
});

app.use(
  cors({
    origin: [
      "https://cargosmarttsl-1.onrender.com",
      "https://tslcargosmart.xyz",
      "https://www.tslcargosmart.xyz",
      "http://localhost:5500",
      "http://127.0.0.1:5500"
    ],
    credentials: true,
  })
);



// =====================================
// 🧩 Essential Middlewares
// =====================================
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve uploaded documents (static route for download/display)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/invoices", express.static(path.join(__dirname, "invoices")));

// TRUST NGROK / REVERSE PROXY
app.set("trust proxy", 1);



function requireDriverAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Driver not authenticated." });
  }

  if (req.session.user.type !== "driver") {
    return res.status(401).json({ error: "Driver access only." });
  }

  req.driverId = Number(req.session.user.id);

  next();
}

// Wrap the fetch call in an async function
const loginUser = async (input, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // This ensures that the session cookie is sent
      body: JSON.stringify({ input, password }),
    });

    const data = await response.json();
    console.log("Login successful:", data); // Use the data as needed
  } catch (err) {
    console.error("Error during login:", err);
  }
};

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT NOW()", (err) => {
  if (err) console.error("❌ Database connection error:", err);
  else console.log("✅ Database connected successfully");
});

app.use(
  session({
    store: new pgSession({
      pool: pool,          // Do NOT move this above the pool definition
      tableName: "session" // Render will auto-create this if needed
    }),
    secret: process.env.Session_Secret || "dev-secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);


//-----------------------//
//  CLIENT VERIFICATION //
//---------------------//

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // use TLS later if needed
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});
 

transporter.verify((err, success) => {
  if (err) console.error("❌ Mail transporter error:", err);
  else console.log("✅ Mail transporter ready");
});

/* ----------------------------------------
   🟢 STEP 1: SIGNUP - Store directly in clients
---------------------------------------- */
app.post("/api/client/signup", async (req, res) => {
  const {
    company_name,
    contact_person,
    contact_number,
    email,
    password,
    address,
  } = req.body;

  try {
    // 1️⃣ Check if already exists
    const existing = await pool.query(
      "SELECT * FROM clients WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      const client = existing.rows[0];

      if (client.is_verified) {
        return res
          .status(400)
          .json({ error: "Email already registered and verified." });
      } else {
        // Remove old unverified record
        await pool.query("DELETE FROM clients WHERE email = $1", [email]);
      }
    }

    // 2️⃣ Generate verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ Insert into DB
    await pool.query(
      `INSERT INTO clients 
        (company_name, contact_person, contact_number, email, address, password,
         failed_attempts, lockout_time, archived, role, photo,
         is_verified, verification_code, code_expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               0, NULL, false, 'client', NULL,
               false, $7, $8, NOW())`,
      [
        company_name,
        contact_person,
        contact_number,
        email,
        address,
        hashedPassword,
        verificationCode,
        codeExpiresAt,
      ]
    );

    // ================================
    // ✨ Beautiful Email HTML Template
    // ================================
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #EFF3FF;">
        
        <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: #60ADF4; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: white; font-weight: 600;">
              Welcome to TSL Freight Movers
            </h2>
            <p style="margin: 0; color: white; opacity: .9;">
              Email Verification Required
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 25px;">
            <p style="font-size: 15px; color: #333;">
              Hello ${contact_person || "there"},
              <br><br>
              Thank you for registering with <strong>TSL Freight Movers</strong>.
              Before you can access your client dashboard, please verify your email address.
            </p>

            <!-- Code Box -->
            <div style="
              background: #F3F9FF;
              border: 1px solid #60ADF4;
              padding: 18px;
              border-radius: 8px;
              margin: 25px 0;
              text-align: center;
            ">
              <p style="
                font-size: 32px;
                letter-spacing: 6px;
                margin: 0;
                font-weight: bold;
                color: #0077b6;
              ">
                ${verificationCode}
              </p>
            </div>

            <p style="font-size: 14px; color: #555;">
              This code will expire in <b>5 minutes</b>.
              For your security, please do not share this code with anyone.
            </p>

            <p style="font-size: 14px; color: #555;">
              If you did not create an account, simply ignore this email.
            </p>

            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              © ${new Date().getFullYear()} TSL Freight Movers Inc.<br/>
              All rights reserved.
            </p>
          </div>

        </div>
      </div>
    `;

    // 4️⃣ Send email
    await transporter.sendMail({
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - TSL Freight Movers",
      html: emailHTML,
    });

    res.json({ message: "Verification code sent to your email." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

/* ----------------------------------------
   🟢 STEP 2: VERIFY CODE (Now Sends Welcome Email)
---------------------------------------- */
app.post("/api/client/verify", async (req, res) => {
  const { email, code } = req.body;

  try {
    const sql = "SELECT * FROM clients WHERE email = $1";
    const result = await pool.query(sql, [email]);

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Email not found. Please sign up again." });
    }

    const client = result.rows[0];

    // Already verified
    if (client.is_verified) {
      return res
        .status(400)
        .json({ error: "This account is already verified." });
    }

    // Code mismatch
    if (client.verification_code.trim() !== code.trim()) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Code expired
    if (new Date() > new Date(client.code_expires_at)) {
      return res.status(400).json({
        error: "Verification code expired. Please request a new one.",
      });
    }

    // Update as verified
    await pool.query(
      `UPDATE clients 
       SET is_verified = true, verification_code = NULL, code_expires_at = NULL 
       WHERE email = $1`,
      [email]
    );

    // ======================================
    // ✨ Send Welcome Email Template  babaguhin link
    // ======================================
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #EFF3FF;">
        
        <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="background: #60ADF4; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: white; font-weight: 600;">
              Welcome to TSL Freight Movers
            </h2>
            <p style="margin: 0; color: white; opacity: .9;">
              Your Email Has Been Successfully Verified
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 25px;">
            <p style="font-size: 15px; color: #333;">
              Hello ${client.contact_person || client.company_name || "Client"},
              <br><br>
              Thank you for verifying your email! Your TSL Freight Movers account is now fully activated.
            </p>

            <p style="font-size: 15px; color: #333;">
              You can now log in and start managing your bookings, shipments, invoices, and real-time tracking from your client dashboard.
            </p>

            <!-- Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://tslfreightmovers.com/client/login" 
                style="
                  background: #60ADF4;
                  color: white;
                  text-decoration: none;
                  padding: 12px 28px;
                  border-radius: 6px;
                  font-size: 16px;
                  font-weight: bold;
                  display: inline-block;
                ">
                Go to Login
              </a>
            </div>

            <p style="font-size: 14px; color: #555;">
              If you have any questions or need assistance, feel free to contact us anytime.
            </p>

            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              © ${new Date().getFullYear()} TSL Freight Movers Inc.<br/>
              All rights reserved.
            </p>
          </div>

        </div>

      </div>
    `;

    // Send the email
    await transporter.sendMail({
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Email Has Been Verified - TSL Freight Movers",
      html: emailHTML,
    });

    res.json({ message: "Email verified successfully!" });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

/* ----------------------------------------
   🟢 STEP 3: RESEND CODE (Improved Email Template)
---------------------------------------- */
app.post("/api/client/resend-code", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query("SELECT * FROM clients WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No account found for this email." });
    }

    const client = result.rows[0];

    if (client.is_verified) {
      return res.status(400).json({ error: "Account already verified." });
    }

    // Generate new code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `
      UPDATE clients 
      SET verification_code = $1, code_expires_at = $2 
      WHERE email = $3
    `,
      [verificationCode, codeExpiresAt, email]
    );

    // ================================
    // Beautiful HTML Email Template
    // ================================
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #EFF3FF;">
        
        <!-- Header -->
        <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          
          <div style="background: #60ADF4; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: white; font-weight: 600;">
              TSL Freight Movers
            </h2>
            <p style="margin: 0; color: white; opacity: .9;">
              Email Verification Code
            </p>
          </div>

          <!-- Body -->
          <div style="padding: 25px;">
            <p style="font-size: 15px; color: #333;">
              Hello,
              <br><br>
              Here is your new verification code to continue accessing your TSL Freight Movers account.
            </p>

            <!-- Code Box -->
            <div style="
              background: #F3F9FF;
              border: 1px solid #60ADF4;
              padding: 18px;
              border-radius: 8px;
              margin: 25px 0;
              text-align: center;
            ">
              <p style="
                font-size: 32px;
                letter-spacing: 6px;
                margin: 0;
                font-weight: bold;
                color: #0077b6;
              ">
                ${verificationCode}
              </p>
            </div>

            <p style="font-size: 14px; color: #555;">
              This code is valid for <b>5 minutes</b>.  
              Please do not share your verification code with anyone.
            </p>

            <p style="font-size: 14px; color: #555;">
              If you did not request this code, please ignore this message.
            </p>

            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              © ${new Date().getFullYear()} TSL Freight Movers Inc.<br/>
              All rights reserved.
            </p>
          </div>

        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Verification Code - TSL Freight Movers",
      html: emailHTML,
    });

    res.json({ message: "New verification code sent to your email." });
  } catch (error) {
    console.error("Resend code error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ========================
// || CHECK RESET CODE ||
// ========================
app.post("/api/check-reset-code", async (req, res) => {
  const { email, resetCode } = req.body;

  if (!email || !resetCode) {
    return res.status(400).json({ error: "Missing email or reset code." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE email = $1 AND code = $2",
      [email, resetCode]
    );

    // If code not found
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired reset code." });
    }

    // Optional: check expiry time (within 15 minutes)
    const createdAt = new Date(result.rows[0].created_at);
    const now = new Date();
    const minutesPassed = (now - createdAt) / 60000;

    if (minutesPassed > 15) {
      await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);
      return res.status(400).json({ error: "Reset code expired." });
    }

    // ✅ Code valid
    res.json({ message: "Reset code verified." });
  } catch (err) {
    console.error("Check Reset Code Error:", err);
    res.status(500).json({ error: "Server error while verifying code." });
  }
});

// ========================
// || CHECK RESET CODE ||
// ========================
app.post("/api/check-reset-code", async (req, res) => {
  const { email, resetCode } = req.body;

  if (!email || !resetCode) {
    return res.status(400).json({ error: "Missing email or reset code." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE email = $1 AND code = $2",
      [email, resetCode]
    );

    // If code not found
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired reset code." });
    }

    // Optional: check expiry time (within 15 minutes)
    const createdAt = new Date(result.rows[0].created_at);
    const now = new Date();
    const minutesPassed = (now - createdAt) / 60000;

    if (minutesPassed > 15) {
      await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);
      return res.status(400).json({ error: "Reset code expired." });
    }

    // ✅ Code valid
    res.json({ message: "Reset code verified." });
  } catch (err) {
    console.error("Check Reset Code Error:", err);
    res.status(500).json({ error: "Server error while verifying code." });
  }
});

// ========================
// || PASSWORD RESET CODE ||
// ========================
app.post("/api/send-reset-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const result = await pool.query("SELECT * FROM clients WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No account found with that email." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date();

    // Save to password_resets table
    await pool.query(
      "INSERT INTO password_resets (email, code, created_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET code = $2, created_at = $3",
      [email, code, createdAt]
    );

    // Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "New Verification Code - TSL Freight Movers",
      html: `
        <h2>Here’s your password reset code</h2>
        <h1 style="letter-spacing: 4px;">${code}</h1>
        <p>This code will expire in <b>5 minutes</b>.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Reset code sent." });
  } catch (err) {
    console.error("Send Reset Code Error:", err);
    res.status(500).json({ error: "Failed to send reset code." });
  }
});

// ========================
// || RESET PASSWORD ||
// ========================
app.post("/api/reset-password", async (req, res) => {
  const { email, resetCode, newPassword } = req.body;

  if (!email || !resetCode || !newPassword) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE email = $1 AND code = $2",
      [email, resetCode]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code." });
    }

    const resetEntry = result.rows[0];
    const now = new Date();
    const createdAt = new Date(resetEntry.created_at);
    const minutesPassed = (now - createdAt) / 60000;

    if (minutesPassed > 15) {
      return res.status(400).json({ error: "Reset code expired." });
    }

    // ✅ Hash and update password + mark as verified
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE clients SET password = $1, is_verified = true WHERE email = $2",
      [hashedPassword, email]
    );

    // Delete reset record
    await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);

    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// ========================
// || RESET PASSWORD ||
// ========================
app.post("/api/reset-password", async (req, res) => {
  const { email, resetCode, newPassword } = req.body;

  if (!email || !resetCode || !newPassword) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE email = $1 AND code = $2",
      [email, resetCode]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset code." });
    }

    const resetEntry = result.rows[0];
    const now = new Date();
    const createdAt = new Date(resetEntry.created_at);
    const minutesPassed = (now - createdAt) / 60000;

    if (minutesPassed > 15) {
      return res.status(400).json({ error: "Reset code expired." });
    }

    // Reset password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE clients SET password = $1 WHERE email = $2",
      [hashedPassword, email]
    );

    await pool.query("DELETE FROM password_resets WHERE email = $1", [email]);

    // ================================
    // Send Confirmation Email babaguhin din link
    // ================================
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #EFF3FF;">
        
        <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; 
                    overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">

          <!-- Header -->
          <div style="background: #60ADF4; padding: 20px; text-align: center;">
            <h2 style="margin: 0; color: white; font-weight: 600;">
              Password Reset Successful
            </h2>
          </div>

          <!-- Body -->
          <div style="padding: 25px;">
            <p style="font-size: 15px; color: #333;">
              Your password has been successfully updated.
              You can now log in to your TSL Freight Movers account using your new password.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://tslfreightmovers.com/client/login"
                style="
                  background: #60ADF4;
                  color: white;
                  text-decoration: none;
                  padding: 12px 28px;
                  border-radius: 6px;
                  font-size: 16px;
                  font-weight: bold;
                  display: inline-block;
                ">
                Go to Login
              </a>
            </div>

            <p style="font-size: 14px; color: #555;">
              If you did not perform this request, please contact us immediately.
            </p>

            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
              © ${new Date().getFullYear()} TSL Freight Movers Inc.<br/>
              All rights reserved.
            </p>
          </div>

        </div>

      </div>
    `;

    await transporter.sendMail({
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Password Has Been Reset - TSL Freight Movers",
      html: emailHTML,
    });

    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// ======================
// || Google signin
// ======================

const { OAuth2Client } = require("google-auth-library");
const { error } = require("console");
const GOOGLE_CLIENT_ID =
  "722110448522-5ft0t59s11g2gg14cll3r973r3r1h3eg.apps.googleusercontent.com"; // replace with your Client ID
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper to verify Google ID token
async function verifyGoogleToken(token) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (err) {
    console.error("verifyGoogleToken error:", err);
    return null;
  }
}

// ------------------ POST /auth/google ------------------ //
app.post("/auth/google", async (req, res) => {
  const { token } = req.body;

  // 1. Verify the Google token
  const userInfo = await verifyGoogleToken(token);
  if (!userInfo) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid Google token" });
  }

  try {
    // 2. Check if client exists
    const { rows } = await pool.query(
      "SELECT * FROM clients WHERE email = $1",
      [userInfo.email]
    );
    let clientData;

    if (rows.length > 0) {
      const client = rows[0];
      if (client.archived) {
        return res.status(403).json({
          success: false,
          error: "Your account has been archived. Please contact support.",
        });
      }
      clientData = client;
    } else {
      // 3. Insert a new client
      const insertQuery = `
        INSERT INTO clients 
          (company_name, contact_person, contact_number, email, address, created_at, password, failed_attempts, lockout_time, archived, photo, role)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const insertValues = [
        "N/A", // company_name
        userInfo.name, // contact_person
        "", // contact_number
        userInfo.email, // email
        "", // address
        null, // password
        0, // failed_attempts
        null, // lockout_time
        false, // archived
        userInfo.picture || "", // photo
        "client", // role
      ];

      const result = await pool.query(insertQuery, insertValues);
      clientData = result.rows[0];
    }

    // 4. Create unified session object
    req.session.user = {
      id: clientData.id,
      role: clientData.role || "client",
      type: "client",
      company_name: clientData.company_name,
      contact_person: clientData.contact_person,
      contact_number: clientData.contact_number,
      email: clientData.email,
      address: clientData.address,
      photo: clientData.photo || userInfo.picture || null,
    };

    // 5. Return JSON response
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ======================
// || UNIFIED LOGIN (Account-Based Lockout) ||
// ======================
const LOCKOUT_THRESHOLD = 5; // max wrong attempts
const LOCKOUT_DURATION_MINUTES = 1; // lockout duration (1 minute)

app.post("/api/login", async (req, res) => {
  try {
    const { input, password } = req.body;
    let user = null;
    let isAdminUser = false;

    //  Try admin/staff first (username IS email)
    let result = await pool.query("SELECT * FROM users WHERE username = $1", [
      input,
    ]);
    if (result.rows.length > 0) {
      user = result.rows[0];
      isAdminUser = true;
    }

    //  Try client (email-based login)
    if (!user) {
      result = await pool.query(
        `SELECT id, email, password, archived, is_verified, failed_attempts, lockout_time, 
                company_name, contact_person, contact_number, address, photo
         FROM clients 
         WHERE email = $1`,
        [input]
      );

      if (result.rows.length > 0) {
        user = result.rows[0];

        // ⚠️ Handle archived flag safely (varchar or boolean)
        if (user.archived === true || user.archived === "true") {
          return res.status(403).json({
            error: "Your account has been archived. Please contact support.",
          });
        }

        // ✅ Handle verification check (allow admin-created OR verified)
        if (
          (user.verified === false ||
            user.verified === "false" ||
            user.verified === 0) &&
          (user.created_by_admin === false ||
            user.created_by_admin === "false" ||
            !user.created_by_admin)
        ) {
          return res.status(403).json({
            error:
              "Your account is not verified. Please verify your email or contact admin support.",
          });
        }
      }
    }

    // Try driver (email-based login)
    if (!user) {
      const driverRes = await pool.query(
        `SELECT id, first_name, last_name, email, phone, password,
            failed_attempts, lockout_time, driver_status
     FROM drivers 
     WHERE LOWER(email) = LOWER($1)`,
        [input]
      );

      console.log("Driver query result:", driverRes.rows);

      if (driverRes.rows.length > 0) {
        user = driverRes.rows[0];
        isAdminUser = false;
        user.isDriver = true;

        console.log("Driver found:", {
          id: user.id,
          email: user.email,
          status: user.driver_status,
          hasPassword: !!user.password,
          passwordLength: user.password?.length || 0,
        });

        // 🚫 HARD BLOCK ARCHIVED DRIVER
        if (user.driver_status === "archived") {
          return res.status(403).json({
            error: "Your driver account is archived. Please contact the admin.",
          });
        }

        // continue with normal login: password check etc. happens AFTER this
      }
    }

    //  If user not found
    if (!user) {
      return res.status(400).json({ error: "Wrong username or password." });
    }

    //  Check if account is locked
    if (user.lockout_time && new Date(user.lockout_time) > new Date()) {
      const remainingSec = Math.ceil(
        (new Date(user.lockout_time) - new Date()) / 1000
      );
      return res.status(429).json({
        error: `Account locked. Try again in ${remainingSec} seconds.`,
      });
    }

    //  Check password
    const isMatch =
      user.password && (await bcrypt.compare(password, user.password));
    if (!isMatch) {
      const newAttempts = (user.failed_attempts || 0) + 1;

      if (newAttempts >= LOCKOUT_THRESHOLD) {
        const lockUntil = new Date(
          Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
        );
        await pool.query(
          `UPDATE ${
            isAdminUser ? "users" : user.isDriver ? "drivers" : "clients"
          }
           SET failed_attempts = 0, lockout_time = $1
           WHERE id = $2`,
          [lockUntil, user.id]
        );

        return res.status(429).json({
          error: `Account locked for ${LOCKOUT_DURATION_MINUTES} minute(s).`,
        });
      } else {
        await pool.query(
          `UPDATE ${
            isAdminUser ? "users" : user.isDriver ? "drivers" : "clients"
          }
           SET failed_attempts = $1
           WHERE id = $2`,
          [newAttempts, user.id]
        );

        return res.status(400).json({
          error: `Please check Email and Password. Attempts left: ${
            LOCKOUT_THRESHOLD - newAttempts
          }`,
        });
      }
    }

    //  Reset failed_attempts & lock on success
    await pool.query(
      `UPDATE ${isAdminUser ? "users" : user.isDriver ? "drivers" : "clients"}
       SET failed_attempts = 0, lockout_time = NULL
       WHERE id = $1`,
      [user.id]
    );

    // 7️⃣ Create session object (supports admin | client | driver)
    // ==========================
    //  ASSIGN ROLE + SESSION DATA
    // ==========================
    let role = "client";
    let type = "client";

    // ADMIN
    if (isAdminUser) {
      role = user.role || "admin";
      type = "admin";
    }

    // DRIVER
    else if (user.isDriver) {
      role = "driver";
      type = "driver";

      // REQUIRED — driver API authentication depends on this
      req.session.driverId = user.id;
    }

    // CLIENT (default)
    else {
      role = "client";
      type = "client";
    }

    // DRIVER FULL NAME
    const driverFullName = user.isDriver
      ? `${user.first_name} ${user.last_name}`.trim()
      : null;

    // SAVE SESSION DATA (GLOBAL USER SESSION)
    req.session.user = {
      id: user.id,
      role,
      type,
      company_name: isAdminUser
        ? user.username
        : user.isDriver
        ? driverFullName
        : user.company_name,

      contact_person: user.contact_person || driverFullName || user.username,

      contact_number: user.contact_number || user.phone || "",
      email: user.email || user.username,
      address: user.address || "",
      photo: user.photo || null,
    };

    // ==========================
    //  CLIENT-SPECIFIC SESSION (needed for /api/bookings)
    // ==========================
    if (type === "client") {
      req.session.client = {
        id: user.id,
        email: user.email,
        contact_person: user.contact_person,
        company_name: user.company_name,
      };
    }

    // ==========================
    //  SAVE SESSION BEFORE REPLY
    // ==========================
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({ error: "Failed to save session" });
      }

      console.log("🔥 SESSION SAVED:", req.session);

     const allowedOrigins = [
  "https://cargosmarttsl-5.onrender.com",
  "https://your-frontend-domain.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

if (allowedOrigins.includes(origin)) {
  res.setHeader("Access-Control-Allow-Origin", origin);
}

res.setHeader("Access-Control-Allow-Credentials", "true");


      // SUCCESS RESPONSE
      return res.status(200).json({
        message: "Login successful",
        user: req.session.user,
      });
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================
// || Shipment Creation Protection (Client only) ||
// ======================
app.post("/api/shipments", async (req, res) => {
  try {
    const {
      client_id,
      tracking_number,
      port_origin,
      port_delivery,
      service_type,
      delivery_mode,
      expected_delivery_date,
    } = req.body;

    // 🧭 Step 1: Convert addresses to coordinates
    const originCoords = await geocodeAddress(port_origin);
    const destCoords = await geocodeAddress(port_delivery);

    // 🧭 Step 2: Insert with coordinates
    const query = `
      INSERT INTO shipments (
        client_id,
        tracking_number,
        service_type,
        delivery_mode,
        port_origin,
        port_delivery,
        origin_latitude,
        origin_longitude,
        delivery_latitude,
        delivery_longitude,
        status,
        expected_delivery_date,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11,NOW())
      RETURNING *;
    `;

    const values = [
      client_id,
      tracking_number,
      service_type,
      delivery_mode,
      port_origin,
      port_delivery,
      originCoords?.lat,
      originCoords?.lon,
      destCoords?.lat,
      destCoords?.lon,
      expected_delivery_date,
    ];

    const result = await pool.query(query, values);
    res.status(201).json({
      message: "Shipment created successfully!",
      shipment: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error creating shipment:", err);
    res.status(500).json({ error: "Failed to create shipment" });
  }
});

//----------------------------------//
//       History in clients        //
//--------------------------------//
// GET route to fetch booking history for logged-in client
app.get("/api/bookings/history", async (req, res) => {
  try {
    // 🔑 Make sure the client is logged in
    if (!req.session?.user) {
      console.error("❌ No session client found");
      return res
        .status(401)
        .json({ message: "Unauthorized: Client not logged in" });
    }

    const clientSession = req.session.user;

    // ✅ Make sure it’s really a client
    if (clientSession.role !== "client") {
      console.error("❌ Unauthorized role:", clientSession.role);
      return res
        .status(403)
        .json({ message: "Forbidden: Only clients can view history" });
    }

    // ✅ Validate clientId
    const clientId = Number(clientSession.id);
    if (isNaN(clientId)) {
      console.error("❌ Invalid clientId from session:", clientSession.id);
      return res.status(400).json({ message: "Invalid client ID" });
    }

    // ✅ Query shipments for this client (include decline_reason!)
    const result = await pool.query(
      `
      SELECT 
        id,
        tracking_number,
        delivery_type,
        service_type,
        shipment_type,
        delivery_mode,
        port_origin,
        port_delivery,
        gross_weight,
        net_weight,
        gross_weight_unit,
        net_weight_unit,
        num_packages,
        packing_list,
        commercial_invoice,
        status,
        decline_reason,   -- ✅ added this field
        created_at
      FROM shipments
      WHERE client_id = $1
      ORDER BY created_at DESC
      `,
      [clientId]
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("🔥 Error fetching booking history:", err.message, err.stack);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ===============================//
//        ADMIN DASHBOARD         //
// ===============================//

// -------------------------------
// 1️⃣ KPI Cards (Fixed Completed)
// -------------------------------
app.get("/api/analytics/kpis", async (req, res) => {
  try {
    const { rows: currentBookings } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM shipments
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    // Pending
    const { rows: pendingBookings } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM shipments
      WHERE LOWER(status) = 'pending'
    `);

    // Active = Approved / Shipping / In Transit
    const { rows: activeShipments } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM shipments
      WHERE LOWER(status) IN ('approved', 'shipping', 'in transit')
    `);

    // COMPLETED = any status containing completed/delivered
    const { rows: completedDeliveries } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM shipments
      WHERE LOWER(status) LIKE '%completed%'
         OR LOWER(status) LIKE '%delivered%'
    `);

    const { rows: monthlyRevenue } = await pool.query(`
      SELECT COALESCE(SUM(amount_due),0) AS total
      FROM invoices
      WHERE status='paid'
        AND DATE_TRUNC('month', created_at)=DATE_TRUNC('month', CURRENT_DATE)
    `);

    res.json({
      current_bookings: Number(currentBookings[0].count),
      pending_bookings: Number(pendingBookings[0].count),
      active_shipments: Number(activeShipments[0].count),
      completed_deliveries: Number(completedDeliveries[0].count),
      monthly_revenue: Number(monthlyRevenue[0].total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch KPI data" });
  }
});

// -------------------------------
// 2️⃣ Revenue Trend Chart
// -------------------------------
app.get("/api/analytics/revenue", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at,'Mon') AS month,
             SUM(amount_due) AS total
      FROM invoices
      WHERE status='paid'
      GROUP BY month, DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch revenue data" });
  }
});

// ===============================
// 2️⃣ Payment Status (for Chart)
// ===============================
app.get("/api/analytics/payment-status", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        SUM(
          CASE 
            WHEN status = 'paid' AND updated_at <= due_date THEN 1
            ELSE 0 
          END
        ) AS on_time,
        SUM(
          CASE 
            WHEN status = 'paid' AND updated_at > due_date THEN 1
            ELSE 0
          END
        ) AS late
      FROM invoices;
    `);

    // Safeguard: return empty defaults if no data
    res.json(rows[0] || { on_time: 0, late: 0 });
  } catch (err) {
    console.error("Error fetching payment status data:", err);
    res.status(500).json({ error: "Failed to fetch payment status data" });
  }
});

app.get("/api/analytics/payment-decision", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id AS client_id,
        c.company_name,
        COUNT(i.id) AS total_invoices,
        SUM(CASE WHEN i.status = 'paid' AND i.updated_at <= i.due_date THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN i.status = 'paid' AND i.updated_at > i.due_date THEN 1 ELSE 0 END) AS late,
        ROUND(
          (SUM(CASE WHEN i.status = 'paid' AND i.updated_at <= i.due_date THEN 1 ELSE 0 END)::numeric
          / NULLIF(COUNT(i.id), 0)) * 100, 2
        ) AS on_time_rate,
        ROUND(
          (SUM(CASE WHEN i.status = 'paid' AND i.updated_at > i.due_date THEN 1 ELSE 0 END)::numeric
          / NULLIF(COUNT(i.id), 0)) * 100, 2
        ) AS late_rate,
        CASE
          WHEN COUNT(i.id) = 0 THEN 'No available payment records for this client.'
          WHEN (SUM(CASE WHEN i.status = 'paid' AND i.updated_at > i.due_date THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(i.id), 0)) >= 0.5
            THEN 'Client frequently pays invoices late (over 50% of total) and may require review or possible removal.'
          WHEN (SUM(CASE WHEN i.status = 'paid' AND i.updated_at > i.due_date THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(i.id), 0)) BETWEEN 0.3 AND 0.49
            THEN 'Client occasionally pays late (30–49% of total) and should be monitored for consistency.'
          ELSE 'Client consistently pays on time and is in good financial standing.'
        END AS status_flag
      FROM clients c
      LEFT JOIN invoices i ON c.id = i.client_id
      GROUP BY c.id, c.company_name
      ORDER BY on_time_rate DESC NULLS LAST;
    `);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching payment decision analytics:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch payment decision analytics" });
  }
});

// -------------------------------
// 4️⃣ Client Revenue Chart
// -------------------------------
app.get("/api/analytics/client-revenue", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.company_name, TO_CHAR(i.created_at,'Mon') AS month, SUM(i.amount_due) AS total
      FROM invoices i
      JOIN shipments s ON s.id=i.shipment_id
      JOIN clients c ON c.id=s.client_id
      WHERE i.status='paid'
      GROUP BY c.company_name, month, DATE_TRUNC('month', i.created_at)
      ORDER BY c.company_name, DATE_TRUNC('month', i.created_at)
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client revenue data" });
  }
});

// -------------------------------
// 5️⃣ Booking Status Chart
// -------------------------------
app.get("/api/analytics/booking-status", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM shipments
      GROUP BY status
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch booking status data" });
  }
});

// ==============================
// Admin Dashboard: Shipment Volume (Current Month)
// ==============================
app.get("/api/dashboard/shipment-volume", async (req, res) => {
  try {
    const query = `
      WITH week_ranges AS (
        SELECT unnest(ARRAY[
          'Week 1 (1–7)',
          'Week 2 (8–14)',
          'Week 3 (15–21)',
          'Week 4 (22–31)'
        ]) AS week_label
      ),
      weekly_shipments AS (
        SELECT 
          CASE
            WHEN EXTRACT(DAY FROM created_at) BETWEEN 1 AND 7 THEN 'Week 1 (1–7)'
            WHEN EXTRACT(DAY FROM created_at) BETWEEN 8 AND 14 THEN 'Week 2 (8–14)'
            WHEN EXTRACT(DAY FROM created_at) BETWEEN 15 AND 21 THEN 'Week 3 (15–21)'
            ELSE 'Week 4 (22–31)'
          END AS week_label,
          COUNT(*) AS total
        FROM shipments
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY 1
      )
      SELECT wr.week_label,
             COALESCE(ws.total, 0) AS total
      FROM week_ranges wr
      LEFT JOIN weekly_shipments ws ON wr.week_label = ws.week_label
      ORDER BY wr.week_label;
    `;

    const { rows } = await pool.query(query);

    // keep the same format for frontend
    const formatted = rows.map((r) => ({
      month: r.week_label,
      total: Number(r.total),
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching shipment volume for current month:", err);
    res.status(500).json({ error: "Failed to fetch shipment volume data" });
  }
});

// ==============================
// Enhanced Shipment Volume Analytics (Improved)
// ==============================
app.get("/api/analytics/shipment-volume", async (req, res) => {
  try {
    const { filter = "this_month", start, end } = req.query;
    let query = "";
    const params = [];

    if (filter === "this_month" || filter === "last_month") {
      const monthOffset =
        filter === "last_month" ? " - INTERVAL '1 month'" : "";

      query = `
        WITH week_ranges AS (
          SELECT unnest(ARRAY['1–7', '8–14', '15–21', '22–31']) AS label
        ),
        shipment_counts AS (
          SELECT 
            CASE
              WHEN EXTRACT(DAY FROM created_at) BETWEEN 1 AND 7 THEN '1–7'
              WHEN EXTRACT(DAY FROM created_at) BETWEEN 8 AND 14 THEN '8–14'
              WHEN EXTRACT(DAY FROM created_at) BETWEEN 15 AND 21 THEN '15–21'
              ELSE '22–31'
            END AS label,
            COUNT(*) AS total
          FROM shipments
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE${monthOffset})
          GROUP BY label
        )
        SELECT w.label, COALESCE(s.total, 0) AS total
        FROM week_ranges w
        LEFT JOIN shipment_counts s USING(label)
        ORDER BY 
          CASE 
            WHEN w.label = '1–7' THEN 1
            WHEN w.label = '8–14' THEN 2
            WHEN w.label = '15–21' THEN 3
            ELSE 4
          END;
      `;
    } else if (filter === "this_year") {
      query = `
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS label,
               COUNT(*) AS total
        FROM shipments
        WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY label, DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at);
      `;
    } else if (filter === "custom" && start && end) {
      query = `
        SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') AS label,
               COUNT(*) AS total
        FROM shipments
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY label, DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at);
      `;
      params.push(start, end);
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching shipment volume:", err);
    res.status(500).json({ error: "Failed to fetch shipment volume data" });
  }
});

// -------------------------------
// 7️⃣ Top Clients
// -------------------------------
app.get("/api/analytics/top-clients", async (req, res) => {
  try {
    const { rows } = await pool.query(`
          SELECT c.company_name AS name, COALESCE(SUM(i.amount_due),0) AS revenue
          FROM clients c
          LEFT JOIN shipments s ON c.id = s.client_id
          LEFT JOIN invoices i ON i.shipment_id = s.id AND i.status='paid'
          GROUP BY c.id, c.company_name
          ORDER BY revenue DESC
          LIMIT 5
        `);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching top clients:", err);
    res.status(500).json({ error: "Failed to fetch top clients" });
  }
});

// -------------------------------
// Recent Shipments (for Admin Dashboard)
// -------------------------------
app.get("/api/analytics/recent-shipments", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        s.id AS shipment_id,
        s.tracking_number,
        c.company_name AS client_name,
        s.port_origin,
        s.port_delivery,
        s.created_at,
        s.status
      FROM shipments s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.created_at DESC
      LIMIT 5
    `);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching recent shipments:", err);
    res.status(500).json({ error: "Failed to fetch recent shipments" });
  }
});

// ===============================//
//      END ADMIN DASHBOARD        //
// ===============================//

// ===============================
// || CLIENT MANAGEMENT IN ADMIN ||
// ===============================

// 1️⃣ Fetch clients (with shipment count)
app.get("/api/admin/clients", async (req, res) => {
  try {
    const { includeArchived } = req.query;

    let query = `
      SELECT c.*,
             COUNT(s.id) AS total_shipments
      FROM clients c
      LEFT JOIN shipments s ON c.id = s.client_id
    `;

    if (includeArchived === "true") {
      query += " GROUP BY c.id ORDER BY c.id DESC";
    } else {
      query += " WHERE c.archived = FALSE GROUP BY c.id ORDER BY c.id DESC";
    }

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2️⃣ Add a new client (always starts as Active & Verified)
app.post("/api/admin/clients", async (req, res) => {
  try {
    const {
      company_name,
      contact_person,
      email,
      contact_number,
      address,
      password,
    } = req.body;

    // ✅ 1. Validate required fields
    if (!email || !password || !company_name) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // Normalize email (case-insensitive)
    const normalizedEmail = email.trim().toLowerCase();

    // ✅ 2. Insert new client (auto-verified)
    const insertQuery = `
  INSERT INTO clients (
    company_name, contact_person, email, contact_number, address, password,
    archived, verified, created_by_admin
  )
  VALUES ($1, $2, $3, $4, $5, $6, FALSE, TRUE, TRUE)
  RETURNING *;
`;
    const result = await pool.query(insertQuery, [
      company_name,
      contact_person,
      normalizedEmail,
      contact_number,
      address,
      password,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("❌ Error adding client:", error);

    // ✅ Handle duplicate email constraint
    if (error.code === "23505" && error.detail.includes("email")) {
      return res.status(409).json({ message: "Email already exists" });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 3️⃣ Archive a client
app.patch("/api/admin/clients/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE clients SET archived = TRUE WHERE id = $1", [id]);
    res.json({ message: "Client archived successfully!" });
  } catch (err) {
    console.error("Error archiving client:", err);
    res.status(500).json({ message: "Server error!" });
  }
});

// 4️⃣ Unarchive a client
app.patch("/api/admin/clients/:id/unarchive", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE clients SET archived = FALSE WHERE id = $1", [id]);
    res.json({ message: "Client unarchived successfully!" });
  } catch (err) {
    console.error("Error unarchiving client:", err);
    res.status(500).json({ message: "Server error!" });
  }
});

// 5️⃣ Update client details
app.put("/api/admin/clients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, contact_person, email, contact_number, address } =
      req.body;

    const updateQuery = `
      UPDATE clients
      SET company_name = $1,
          contact_person = $2,
          email = $3,
          contact_number = $4,
          address = $5
      WHERE id = $6
      RETURNING *;
    `;

    const { rows } = await pool.query(updateQuery, [
      company_name,
      contact_person,
      email,
      contact_number,
      address,
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json({ message: "Client updated successfully!", client: rows[0] });
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});

app.get("/api/admin/clients/search", async (req, res) => {
  try {
    const { q } = req.query;
    const query = `
      SELECT * FROM clients
      WHERE company_name ILIKE $1 OR email ILIKE $1
      ORDER BY id DESC;
    `;
    const { rows } = await pool.query(query, [`%${q}%`]);
    res.json(rows);
  } catch (err) {
    console.error("Error searching clients:", err);
    res.status(500).json({ message: "Search failed" });
  }
});

// 7 Get shipments of a specific client
app.get("/api/admin/clients/:id/shipments", async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        id, 
        tracking_number, 
        service_type, 
        status, 
        created_at,
        num_packages  -- ✅ include number of packages
      FROM shipments
      WHERE client_id = $1
      ORDER BY created_at DESC;
    `;
    const { rows } = await pool.query(query, [id]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching client shipments:", error);
    res.status(500).json({ error: "Failed to fetch client shipments" });
  }
});
// =======================================
// || END OF CLIENT MANAGEMENT IN ADMIN ||
// =======================================

// ===============================
// || BOOKINGS PER CLIENT        ||
// ===============================

app.get("/api/bookings/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    if (isNaN(Number(clientId))) {
      return res.status(400).json({ error: "clientId must be numeric" });
    }

    const query = `
      SELECT 
        s.id AS booking_id,
        c.company_name AS client_name,
        s.service_type,
        s.delivery_mode,
        s.port_origin,
        s.port_delivery,
        s.gross_weight,
        s.gross_weight_unit,
        s.net_weight,
        s.net_weight_unit,
        s.num_packages,
        s.consignee,
        s.remarks,
        s.packing_list,
        s.commercial_invoice,
        s.status,
        TO_CHAR(s.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
      FROM shipments s
      INNER JOIN clients c ON s.client_id = c.id
      WHERE s.client_id = $1
      ORDER BY s.created_at DESC;
    `;

    const { rows } = await pool.query(query, [clientId]);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch client bookings" });
  }
});

// ==================================
// || ADMIN: BOOKINGS MANAGEMENT   ||
// ==================================
app.get("/api/admin/bookings", async (req, res) => {
  const { clientId, search } = req.query;

  try {
    let baseQuery = `
      SELECT 
        s.id,
        s.client_id,
        c.company_name AS client_name,

        -- IDENTIFIERS
        s.tracking_number,

        -- MAIN BOOKING INFO
        s.service_type,
        s.shipment_type,
        s.delivery_mode,
        s.delivery_type,

        -- NEW FIELD
        s.container_size,  -- ADD THIS

        -- PARTIES
        s.shipper,
        s.consignee,

        -- LOCATIONS
        s.port_origin,
        s.port_delivery,
        s.specific_address,
        s.specific_location,

        -- WEIGHTS
        s.gross_weight,
        s.gross_weight_unit,
        s.net_weight,
        s.net_weight_unit,
        s.num_packages,

        -- FILE UPLOADS
        s.packing_list,
        s.commercial_invoice,

        -- GPS
        s.origin_lat,
        s.origin_lon,
        s.delivery_lat,
        s.delivery_lon,
        s.specific_lat,
        s.specific_lon,

        -- META
        s.remarks,
        s.status,
        s.decline_reason,
        s.expected_delivery_date,
        s.created_at

      FROM shipments s
      JOIN clients c ON c.id = s.client_id
    `;

    const conditions = [];
    const values = [];

    // FILTER BY CLIENT
    if (clientId) {
      values.push(clientId);
      conditions.push(`s.client_id = $${values.length}`);
    }

    // UNIVERSAL SEARCH
    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(s.tracking_number) LIKE $${values.length}
        OR LOWER(s.service_type) LIKE $${values.length}
        OR LOWER(c.company_name) LIKE $${values.length}
      )`);
    }

    if (conditions.length > 0) {
      baseQuery += " WHERE " + conditions.join(" AND ");
    }

    baseQuery += " ORDER BY s.created_at DESC";

    const result = await pool.query(baseQuery, values);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ===============================
// || ADMIN: CREATE NEW BOOKING  ||
// ===============================
app.post("/api/admin/bookings", async (req, res) => {
  try {
    const {
      tracking_number,
      client_id,
      service_type,
      delivery_mode,
      port_origin,
      port_delivery,
      packing_list,
      commercial_invoice,
      status,
    } = req.body;

    const query = `
      INSERT INTO shipments
      (tracking_number, client_id, service_type, delivery_mode, port_origin, port_delivery, packing_list, commercial_invoice, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      tracking_number,
      client_id,
      service_type,
      delivery_mode,
      port_origin,
      port_delivery,
      packing_list || null,
      commercial_invoice || null,
      status || "Pending",
    ]);

    res
      .status(201)
      .json({ message: "Booking created successfully", booking: rows[0] });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// ===============================================
// ADMIN: UPDATE STATUS USING BOOKING ID RUDY
// ===============================================
// =====================================================
// ADMIN: UPDATE BOOKING STATUS (FINAL FIXED VERSION)
// =====================================================

app.put("/api/admin/bookings/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, decline_reason } = req.body;

    // Allowed statuses
    const allowedStatuses = [
      "Pending",
      "Approved",
      "Declined",
      "Cancelled by Client",
      "Completed",
    ];

    const normalized = status.trim().toLowerCase();

    if (!allowedStatuses.map((s) => s.toLowerCase()).includes(normalized)) {
      return res.status(400).json({
        error: "Invalid status. Allowed: " + allowedStatuses.join(", "),
      });
    }

    // ===========================================================
    // 1. UPDATE BOOKING
    // ===========================================================
    const result = await pool.query(
      `
      UPDATE shipments 
      SET status = $1,
          decline_reason = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [status, normalized === "declined" ? decline_reason || null : null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const shipment = result.rows[0];
    const tn = shipment.tracking_number || shipment.id;

    // ===========================================================
    // 2. FETCH CLIENT
    // ===========================================================
    const clientRes = await pool.query(
      `SELECT id, company_name, contact_person, email FROM clients WHERE id = $1`,
      [shipment.client_id]
    );

    const client = clientRes.rows[0];
    const clientName =
      client?.contact_person || client?.company_name || "Client";

    // ===========================================================
    // 3. EMAIL TEMPLATES
    // ===========================================================
    let emailHTML = "";
    let title = "";
    let message = "";

    // ---------- APPROVED ----------
    if (normalized === "approved") {
      title = "Booking Approved";
      message = `Your booking #${tn} has been approved and is now being prepared.`;

      emailHTML = `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color: #0077b6;">Booking Approved</h2>

          <p>Dear ${clientName},</p>
          <p>Your booking <strong>#${tn}</strong> has been approved and is now being prepared.</p>

          <h3 style="margin-top:20px;">Booking Information</h3>
          <table style="border-collapse: collapse; line-height:1.6;">
            <tr><td><strong>Tracking Number:</strong></td><td>${shipment.tracking_number || "N/A"}</td></tr>
            <tr><td><strong>Status:</strong></td><td>${shipment.status}</td></tr>

            <tr><td><strong>Service Type:</strong></td><td>${shipment.service_type || "N/A"}</td></tr>
            <tr><td><strong>Shipment Type:</strong></td><td>${shipment.shipment_type || "N/A"}</td></tr>
            <tr><td><strong>Delivery Mode:</strong></td><td>${shipment.delivery_mode || "N/A"}</td></tr>
            <tr><td><strong>Container Size:</strong></td><td>${shipment.container_size || "N/A"}</td></tr>

            <tr><td><strong>Origin Port:</strong></td><td>${shipment.port_origin || "N/A"}</td></tr>
            <tr><td><strong>Destination Port:</strong></td><td>${shipment.port_delivery || "N/A"}</td></tr>

            <tr><td><strong>Specific Address:</strong></td><td>${shipment.specific_address || "N/A"}</td></tr>
            <tr><td><strong>Specific Location:</strong></td><td>${shipment.specific_location || "N/A"}</td></tr>

            <tr><td><strong>Shipper:</strong></td><td>${shipment.shipper || "N/A"}</td></tr>
            <tr><td><strong>Consignee:</strong></td><td>${shipment.consignee || "N/A"}</td></tr>

            <tr><td><strong>Gross Weight:</strong></td><td>${shipment.gross_weight || "N/A"} ${shipment.gross_weight_unit || ""}</td></tr>
            <tr><td><strong>Net Weight:</strong></td><td>${shipment.net_weight || "N/A"} ${shipment.net_weight_unit || ""}</td></tr>
            <tr><td><strong>No. of Packages:</strong></td><td>${shipment.num_packages || "N/A"}</td></tr>

            <tr><td><strong>Expected Delivery:</strong></td><td>${shipment.expected_delivery_date || "N/A"}</td></tr>
            <tr><td><strong>Created At:</strong></td><td>${shipment.created_at}</td></tr>

            <tr><td><strong>Remarks:</strong></td><td>${shipment.remarks || "N/A"}</td></tr>
          </table>

          <br/>
          <p>Thank you for choosing <strong>TSL Freight Movers</strong>.</p>
        </div>
      `;
    }

    // ---------- DECLINED ----------
    if (normalized === "declined") {
      title = "Booking Declined";
      message = `Your booking #${tn} was declined. Reason: ${
        decline_reason || "Not specified"
      }`;
      emailHTML = `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:red;">Booking Declined</h2>
          <p>Dear ${clientName},</p>
          <p>${message}</p>
        </div>
      `;
    }

    // ---------- COMPLETED ----------
    if (normalized === "completed") {
      title = "Booking Completed";
      message = `Your booking #${tn} has been delivered successfully.`;
      emailHTML = `
        <div style="font-family: Arial; padding: 20px;">
          <h2>Booking Completed</h2>
          <p>${message}</p>
        </div>
      `;
    }

    // ---------- CANCELLED ----------
    if (normalized === "cancelled by client") {
      title = "Booking Cancelled";
      message = `Your booking #${tn} has been cancelled by the client.`;
      emailHTML = `
        <div style="font-family: Arial; padding: 20px;">
          <h2>Booking Cancelled</h2>
          <p>${message}</p>
        </div>
      `;
    }

    // ===========================================================
    // 4. IN-APP NOTIFICATION
    // ===========================================================
    if (client && title) {
      await pool.query(
        `
        INSERT INTO client_notifications 
        (client_id, shipment_id, title, message, type, is_read, created_at)
        VALUES ($1, $2, $3, $4, 'booking', FALSE, NOW())
      `,
        [client.id, shipment.id, title, message]
      );
    }

    // ===========================================================
    // 5. SEND EMAIL
    // ===========================================================
    if (client?.email) {
      await transporter.sendMail({
        from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
        to: client.email,
        subject: title,
        html: emailHTML,
      });
    }

    // ===========================================================
    // 6. RESPONSE
    // ===========================================================
    res.json({
      message: "Status updated and email sent.",
      shipment,
    });

  } catch (err) {
    console.error("❌ ERROR updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

//edited ni jade
// -------------------------------
// ADMIN: UPDATE EXPECTED DELIVERY
// -------------------------------
app.put("/api/admin/bookings/:id/expected-delivery", async (req, res) => {
  try {
    const { id } = req.params;
    const { expected_delivery_date } = req.body; // ✅ Match frontend key

    if (!expected_delivery_date) {
      return res
        .status(400)
        .json({ error: "Expected delivery date is required" });
    }

    const query = `
      UPDATE shipments
      SET expected_delivery_date = $1
      WHERE id = $2
      RETURNING id, expected_delivery_date;
    `;
    const { rows } = await pool.query(query, [expected_delivery_date, id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Booking not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating expected delivery:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =======================================
// || END OF BOOKING MANAGEMENT IN ADMIN ||
// =======================================

// ======================
// || SHIPMENT TRACKING ||
// ======================
app.post("/api/add-shipment", async (req, res) => {
  const {
    client_name,
    tracking_number,
    product,
    quantity,
    origin,
    destination,
  } = req.body;
  if (
    !client_name ||
    !tracking_number ||
    !product ||
    !quantity ||
    !origin ||
    !destination
  ) {
    return res.status(400).json({ message: "All fields are required!" });
  }

  try {
    await pool.query(
      `INSERT INTO shipments (client_name, tracking_number, product, quantity, origin, destination)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [client_name, tracking_number, product, quantity, origin, destination]
    );
    res.status(201).json({ message: "Shipment added successfully!" });
  } catch (err) {
    console.error("Error adding shipment:", err);
    res
      .status(500)
      .json({ message: "Error adding shipment. Please try again." });
  }
});

app.get("/api/shipment/:trackingNumber", async (req, res) => {
  const { trackingNumber } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM shipments WHERE tracking_number = $1",
      [trackingNumber]
    );
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ message: "Shipment not found." });
    }
  } catch (err) {
    console.error("Error fetching shipment:", err);
    res.status(500).json({ message: "Error fetching shipment details." });
  }
});

// Fetch tracking number for client
app.get("/api/shipments/latest-tracking/:clientId", async (req, res) => {
  const { clientId } = req.params;

  try {
    // Query the latest shipment based on client_id
    const result = await pool.query(
      "SELECT tracking_number FROM shipments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1",
      [clientId]
    );

    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]); // Return the latest tracking number
    } else {
      res.status(404).json({ message: "No shipments found for this client." });
    }
  } catch (err) {
    console.error("Error fetching latest tracking number:", err);
    res.status(500).json({ message: "Error fetching shipment details." });
  }
});

// Serve your frontend files from /frontend
app.use(express.static(path.join(__dirname, "frontend")));

// Body parsers
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("packingList"), (req, res) => {
  res.json({ file: req.file });
});

// DEBUG MIDDLEWARE - Log all requests to the bookings endpoint
app.use("/api/bookings", (req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} request to /api/bookings`
  );
  console.log("Headers:", req.headers);
  next();
});

// ==============================================
// SINGLE WEBSOCKET SERVER WITH ENDPOINT ROUTING
// ==============================================

let adminClients = [];
let clientSubscribers = [];

// Shared WebSocket server
wss.on("connection", async (ws, req) => {
  const url = req.url;
  console.log("WS connected on route:", url);

  // ================================
  // 1) ADMIN NOTIFICATION WEBSOCKET
  // ================================
  if (url === "/admin") {
    console.log("Admin connected");
    adminClients.push(ws);

    ws.on("close", () => {
      adminClients = adminClients.filter((c) => c !== ws);
    });

    return; // IMPORTANT: stop here
  }

  // ================================
  // 2) CLIENT TRACKING WEBSOCKET
  // ================================
  if (url === "/client") {
    console.log("Client tracking connected");
    clientSubscribers.push(ws);

    // 1) Fetch ALL ACTIVE shipments
    const result = await pool.query(`
      SELECT 
        id,
        tracking_number,
        specific_lat AS latitude,
        specific_lon AS longitude,
        driver_id,
        delivery_lat,
        delivery_lon
      FROM shipments
      WHERE LOWER(status) IN ('shipping', 'in transit')
    `);

    // 2) Build INIT packet
    const initPacket = {
      type: "init",
      data: result.rows,
    };

    // 3) Send INIT to the client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(initPacket));
    }

    ws.on("close", () => {
      clientSubscribers = clientSubscribers.filter((c) => c !== ws);
    });

    return;
  }
  // ================================
  // 3) DRIVER GPS WEBSOCKET
  // ================================
  if (url === "/driver") {
    console.log("Driver GPS connected");

    ws.on("message", async (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type !== "driver_gps") return;

        const { driverId, lat, lng } = data;

        // Validate GPS data
        if (!driverId || !isFinite(lat) || !isFinite(lng)) return;

        // 1) Update driver coordinates
        await pool.query(
          `UPDATE drivers
         SET current_lat=$1, current_lng=$2, gps_update_at=NOW()
         WHERE id=$3`,
          [lat, lng, driverId]
        );

        // 2) Fetch driver's active shipmentId
        const shipmentRes = await pool.query(
          `SELECT id, tracking_number 
         FROM shipments 
         WHERE driver_id = $1 
         AND LOWER(status) NOT IN ('delivered', 'completed')
         ORDER BY id DESC
         LIMIT 1`,
          [driverId]
        );

        const shipmentId = shipmentRes.rows[0]?.id || null;
        const tracking = shipmentRes.rows[0]?.tracking_number || null;

        // 3) Update shipment live GPS (if assigned)
        if (shipmentId) {
          await pool.query(
            `UPDATE shipments
           SET specific_lat=$1, specific_lon=$2
           WHERE id=$3`,
            [lat, lng, shipmentId]
          );
        }

        // 3A — Broadcast to Admin Dashboards (NOW WITH shipmentId)
        adminClients.forEach((adminWS) => {
          if (adminWS.readyState === 1) {
            adminWS.send(
              JSON.stringify({
                type: "driver_location",
                driverId,
                shipmentId, // <<< IMPORTANT
                lat,
                lng,
                timestamp: Date.now(),
              })
            );
          }
        });

        // 3B — Broadcast to Client Tracking Page
        if (tracking) {
          clientSubscribers.forEach((clientWS) => {
            if (clientWS.readyState === 1) {
              clientWS.send(
                JSON.stringify({
                  type: "update",
                  tracking_number: tracking,
                  shipmentId, // <<< ALSO IMPORTANT
                  latitude: lat,
                  longitude: lng,
                  timestamp: Date.now(),
                })
              );
            }
          });
        }
      } catch (err) {
        console.error("Driver GPS WS error:", err);
      }
    });

    return;
  }

  console.log("Unknown WebSocket route:", url);
});

function notifyAdmins(notification) {
  const message = JSON.stringify({
    type: "newBooking",
    payload: notification,
  });

  adminClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

app.get("/api/admin/notifications", async (req, res) => {
  console.log("📩 GET /api/admin/notifications hit");
  try {
    const result = await pool.query(`
      SELECT n.id,
             COALESCE(c.company_name, 'Unknown') AS client,
             n.booking_id,
             n.message,
             n.is_read,
             n.created_at
      FROM notifications n
      LEFT JOIN clients c ON n.client_id = c.id
      WHERE n.recipient_type = 'admin'
      ORDER BY n.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching admin notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/notifications", async (req, res) => {
  const clientId = req.session.client?.id;
  if (!clientId) return res.status(401).json({ error: "Not authenticated" });

  try {
    const result = await pool.query(
      `SELECT id, shipment_id, title, message, type, is_read, created_at
       FROM notifications
       WHERE client_id = $1
       ORDER BY created_at DESC`,
      [clientId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching client notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ==================================================
// 🔽 MARK NOTIFICATION AS READ
// ==================================================
app.put("/api/admin/notifications/mark-read/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE notifications SET is_read = true WHERE id = $1", [
      id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.put("/api/notifications/mark-all-read", async (req, res) => {
  const clientId = req.session.client?.id;
  if (!clientId) return res.status(401).json({ error: "Not authenticated" });

  try {
    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE client_id = $1",
      [clientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all as read:", err);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// ==================================================
// 🔽 END OF ADMIN NOTIFICATIONS
// ==================================================

/*
// ==================================================
// 📦 CREATE BOOKING (CLIENT SIDE)
// ==================================================
// ==================================================
// 📦 CREATE BOOKING (CLIENT SIDE)
// ==================================================
app.post(
  "/api/bookings",
  upload.fields([
    { name: "packingList", maxCount: 1 },
    { name: "commercialInvoice", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("Processing booking request...");

      // ✅ Use req.session.client instead of req.session.user
      const clientSession = req.session.client;
      if (!clientSession || clientSession.role !== "client") {
        return res.status(401).json({ message: "Unauthorized - Client access required" });
      }

      const clientId = clientSession.id;

      const {
        service_type,
        delivery_mode,
        port_origin,
        port_delivery,
        gross_weight,
        gross_weight_unit,
        net_weight,
        net_weight_unit,
        num_packages,
        delivery_type,
        consignee,
        remarks,
      } = req.body;

      // ---- Validation ----
      const missingFields = [];
      if (!service_type) missingFields.push("service_type");
      if (!port_origin) missingFields.push("port_origin");
      if (!port_delivery) missingFields.push("port_delivery");
      if ((delivery_type === "Sea" || delivery_type === "Air") && !delivery_mode) {
        missingFields.push("delivery_mode");
      }
      if (missingFields.length > 0) {
        return res.status(400).json({ message: "Missing required fields", missing: missingFields });
      }
      if (gross_weight_unit && net_weight_unit && gross_weight_unit !== net_weight_unit) {
        return res.status(400).json({ message: "Gross and Net weight units must match" });
      }

      // ---- Handle Files ----
      const packingList = req.files?.packingList?.[0]?.filename || null;
      const commercialInvoice = req.files?.commercialInvoice?.[0]?.filename || null;

      // ---- Get Shipper ----
      const clientResult = await pool.query(
        "SELECT company_name FROM clients WHERE id = $1",
        [clientId]
      );
      if (clientResult.rows.length === 0) {
        return res.status(404).json({ message: "Client not found" });
      }
      const shipper = clientResult.rows[0].company_name || "Unknown";

      // ---- Generate Tracking Number ----
      const trackingNumber =
        "TSL" + Date.now().toString().slice(-6) + Math.floor(1000 + Math.random() * 9000);

      // ---- Insert into Shipments ----
      const insertShipmentQuery = `
        INSERT INTO shipments (
          client_id, shipper, consignee, service_type, delivery_mode,
          port_origin, port_delivery, gross_weight, net_weight, num_packages,
          packing_list, commercial_invoice, status, created_at, delivery_type,
          tracking_number, remarks
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pending',NOW(),$13,$14,$15)
        RETURNING id, tracking_number
      `;
      const values = [
        clientId, shipper, consignee, service_type, delivery_mode || null,
        port_origin, port_delivery, gross_weight, net_weight, num_packages,
        packingList, commercialInvoice, delivery_type, trackingNumber, remarks || null
      ];
      const { rows } = await pool.query(insertShipmentQuery, values);
      const shipment = rows[0];

      console.log("✅ Booking created successfully:", shipment);

      // ---- Insert Admin Notification ----
      const notifTitle = "New Booking Created";
      const notifMessage = `${shipper} created a new booking (Tracking: ${shipment.tracking_number})`;

      await pool.query(
        `INSERT INTO notifications 
          (client_id, shipment_id, title, message, type, is_read, delivery_method, recipient_type, created_at)
        VALUES ($1,$2,$3,$4,'booking',FALSE,'system','admin',NOW())`,
        [clientId, shipment.id, notifTitle, notifMessage]
      );

      // ---- Broadcast to Admins via WebSocket ----
      notifyAdmins({
        id: shipment.id,
        client: shipper,
        bookingId: shipment.tracking_number,
        message: notifMessage,
        date: new Date().toLocaleString(),
        is_read: false,
      });

      // ---- Response ----
      res.status(201).json({
        message: "Booking created successfully",
        booking: shipment
      });

    } catch (error) {
      console.error("❌ Error creating booking:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);



// ==================================================
// 🔽 Booking submission route IN CLIENT SIDE
// ==================================================


 */

// ==================================================
// 🔽 UPDATED: Booking submission route (Client Side)
// ==================================================
app.post(
  "/api/bookings",
  upload.fields([
    { name: "packingList", maxCount: 1 },
    { name: "commercialInvoice", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("Processing booking request...");
      const client_id = req.session?.client?.id;

      if (!client_id) {
        return res
          .status(401)
          .json({ message: "Unauthorized: Client not logged in" });
      }

      // ============================
      // Extract ALL fields
      // ============================
      const {
        deliveryType,
        serviceType,
        shipmentType,
        deliveryMode,
        portOrigin,
        portDelivery,
        grossWeight,
        netWeight,
        grossWeightUnit,
        netWeightUnit,
        numPackages,
        specificLocation,
        specificAddress,
        shipper,
        consignee,
        remarks,

        origin_lat,
        origin_lon,
        delivery_lat,
        delivery_lon,

        containerSize, // ⭐ NEW FIELD
      } = req.body;

      // ============================
      // Basic Validation
      // ============================
      if (
        !deliveryType ||
        !serviceType ||
        !shipmentType ||
        !portOrigin ||
        !portDelivery ||
        !grossWeight ||
        !netWeight ||
        !numPackages ||
        !grossWeightUnit ||
        !netWeightUnit
      ) {
        return res
          .status(400)
          .json({ message: "Missing required booking fields" });
      }

      // ============================
      // Validate containerSize (FCL/LCL only)
      // ============================
      let finalContainerSize = null;

      if (deliveryMode === "FCL" || deliveryMode === "LCL") {
        if (!containerSize) {
          return res.status(400).json({
            message: "Container size is required for FCL or LCL bookings.",
          });
        }
        finalContainerSize = containerSize;
      }

      // Land mode has NO deliveryMode selector
      const finalDeliveryMode = deliveryType === "Land" ? "Land" : deliveryMode;

      // ============================
      // File uploads
      // ============================
      const packingListFile = req.files?.["packingList"]?.[0]?.filename || null;
      const commercialInvoiceFile =
        req.files?.["commercialInvoice"]?.[0]?.filename || null;

      // ============================
      // INSERT FULL BOOKING
      // ============================
      const result = await pool.query(
        `
      INSERT INTO shipments (
        client_id, 

        delivery_type, 
        service_type, 
        shipment_type, 
        delivery_mode,

        container_size, -- ⭐ NEW COLUMN

        port_origin, 
        port_delivery,

        gross_weight, 
        net_weight,
        gross_weight_unit, 
        net_weight_unit,
        num_packages,

        packing_list, 
        commercial_invoice,

        shipper,
        consignee,
        specific_location,
        specific_address,
        remarks,

        origin_lat,
        origin_lon,
        delivery_lat,
        delivery_lon,

        status, 
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,          -- container_size

        $7,$8,

        $9,$10,$11,$12,$13,

        $14,$15,

        $16,$17,$18,$19,$20,

        $21,$22,$23,$24,

        'Pending',NOW()
      )
      RETURNING *;
      `,
        [
          client_id,

          deliveryType,
          serviceType,
          shipmentType,
          finalDeliveryMode,

          finalContainerSize, // ⭐ container_size

          portOrigin,
          portDelivery,

          grossWeight,
          netWeight,
          grossWeightUnit,
          netWeightUnit,
          numPackages,

          packingListFile,
          commercialInvoiceFile,

          shipper || null,
          consignee || null,
          specificLocation || null,
          specificAddress || null,
          remarks || null,

          origin_lat || null,
          origin_lon || null,
          delivery_lat || null,
          delivery_lon || null,
        ]
      );

      // Audit log
      await logAction(
        req.session.client?.email || "Unknown client",
        "Booking created",
        req.ip,
        req.headers["user-agent"],
        "Client Portal"
      );

      res.status(201).json({
        message: "Booking submitted successfully",
        data: result.rows[0],
      });
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      res.status(500).json({
        message: "Internal server error",
        error: err.message,
      });
    }
  }
);

// ===============================
// Get current logged-in user (Admin or Client)
// ===============================
// ==================================================
// 🟢 Auth: Get Current Logged-in User (Admin or Client)
// ==================================================
app.get("/api/auth/me", async (req, res) => {
  try {
    console.log("📌 Incoming /api/auth/me request");
    console.log("📦 Current session:", req.session); // 👈 show full session

    // 1️⃣ Check if Admin is logged in
    if (req.session.admin) {
      const adminId = req.session.admin.id;

      const { rows } = await pool.query(
        `SELECT id, username, username AS email, role 
         FROM users 
         WHERE id = $1`,
        [adminId]
      );

      if (rows.length === 0) {
        console.log("❌ Admin not found in DB");
        return res.status(404).json({ error: "Admin not found" });
      }

      const admin = rows[0];
      console.log("🔎 /api/auth/me result:", { type: "admin", ...admin });

      return res.json({
        type: "admin",
        id: admin.id,
        username: admin.username,
        email: admin.email, // alias of username
        role: admin.role,
      });
    }

    // 2️⃣ Check if User (Client) is logged in
    if (req.session.user && req.session.user.role === "client") {
      const clientId = req.session.user.id;

      const { rows } = await pool.query(
        `SELECT id, email, company_name 
     FROM clients 
     WHERE id = $1`,
        [clientId]
      );

      if (rows.length === 0) {
        console.log("❌ Client not found in DB");
        delete req.session.user;
        return res.status(404).json({ error: "Client not found" });
      }

      const client = rows[0];
      console.log("🔎 /api/auth/me result:", { type: "client", ...client });

      return res.json({
        type: "client",
        id: client.id,
        email: client.email,
        company_name: client.company_name,
        role: "client",
      });
    }

    // 3️⃣ If neither admin nor client is logged in
    console.log("⚠️ No admin/client in session");
    return res.status(401).json({ error: "Not authenticated" });
  } catch (error) {
    console.error("❌ Error in /api/auth/me:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------------
// 📦 Booking API (files optional) with Notifications integrated for admin
// ---------------------------------------------------------------------------------

// ==================================================
// 🟢 Middleware: Require Logged-in Client OR Admin
// ==================================================
// ==================================================
// 🟢 Middleware: Require Logged-in Client
// ==================================================
async function requireClient(req, res, next) {
  try {
    const sessionUser = req.session.user;

    if (!sessionUser || sessionUser.role !== "client") {
      return res.status(401).json({
        message:
          "Unauthorized - You must be logged in as a client to access this page.",
      });
    }

    // Fetch client info from DB
    const { rows } = await pool.query(
      `SELECT id, company_name, email 
       FROM clients 
       WHERE id = $1`,
      [sessionUser.id]
    );

    if (rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(404).json({ message: "Client not found" });
    }

    const client = rows[0];

    // Keep session minimal + consistent
    req.session.user = {
      id: client.id,
      role: "client",
      email: client.email,
    };

    req.client = client; // attach DB client row
    next();
  } catch (err) {
    console.error("❌ requireClient middleware error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// ==================================================
// 📍 LocationIQ Reverse Geocoding
// ==================================================
async function reverseLocationIQ(lat, lon) {
  try {
    const apiKey = "";
    const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lon}&format=json`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error("LocationIQ API error:", res.statusText);
      return null;
    }

    const data = await res.json();
    return {
      display_name: data.display_name,
      address: data.address || {},
      city:
        data.address?.city || data.address?.town || data.address?.village || "",
      region: data.address?.state || "",
      country: data.address?.country || "",
    };
  } catch (err) {
    console.error("reverseLocationIQ error:", err);
    return null;
  }
}

// ==================================================
// 🌍 Geoapify Forward Geocoding Validator
// ==================================================
async function validateGeoapifyLocation(address) {
  if (!address || !address.trim()) return null;
  try {
    const apiKey = "pk.cb06d9dc8a074f0eab5d70fb8a492649";
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
      address
    )}&filter=countrycode:ph&limit=1&apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Geoapify error:", res.statusText);
      return null;
    }
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const f = data.features[0];
      return {
        lat: parseFloat(f.geometry.coordinates[1]),
        lon: parseFloat(f.geometry.coordinates[0]),
        display_name: f.properties.formatted,
      };
    }
  } catch (err) {
    console.error("validateGeoapifyLocation error:", err);
  }
  return null;
}

// ==================================================
// 🌍 LocationIQ + Geoapify Forward Geocoding Validator (Improved Fallback)
// ==================================================
async function validateLocationIQ(address) {
  if (!address || !address.trim()) return null;

  const LOCATIONIQ_KEY = "pk.cb06d9dc8a074f0eab5d70fb8a492649"; // 🔑 LocationIQ key
  const GEOAPIFY_KEY = "e5e95eba533c4eb69344256d49166905"; // 🔑 Geoapify fallback key

  // 1️⃣ Try LocationIQ first
  const locIQUrl = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(
    address
  )}&countrycodes=ph&format=json&limit=1`;

  try {
    const res = await fetch(locIQUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const loc = data[0];
        console.log(`✅ LocationIQ matched: ${loc.display_name}`);
        return {
          lat: parseFloat(loc.lat),
          lon: parseFloat(loc.lon),
          display_name: loc.display_name,
          provider: "LocationIQ",
        };
      } else {
        console.warn(`⚠️ LocationIQ found no results for: ${address}`);
      }
    } else {
      console.warn(`⚠️ LocationIQ error ${res.status} for: ${address}`);
    }
  } catch (err) {
    console.error(`❌ LocationIQ request failed for: ${address}`, err);
  }

  // 2️⃣ Fallback to Geoapify if LocationIQ failed or returned nothing
  try {
    console.log(`🔁 Fallback to Geoapify for: ${address}`);
    const geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
      address
    )}&filter=countrycode:ph&limit=1&apiKey=${GEOAPIFY_KEY}`;
    const geoRes = await fetch(geoUrl);
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.features && geoData.features.length > 0) {
        const f = geoData.features[0];
        console.log(`✅ Geoapify matched: ${f.properties.formatted}`);
        return {
          lat: parseFloat(f.geometry.coordinates[1]),
          lon: parseFloat(f.geometry.coordinates[0]),
          display_name: f.properties.formatted,
          provider: "Geoapify",
        };
      } else {
        console.warn(`⚠️ Geoapify found no results for: ${address}`);
      }
    } else {
      console.warn(`⚠️ Geoapify error ${geoRes.status} for: ${address}`);
    }
  } catch (geoErr) {
    console.error(`❌ Geoapify fallback failed for: ${address}`, geoErr);
  }

  // 3️⃣ No valid result
  console.error(`❌ No geocode match found for: ${address}`);
  return null;
}

// ==================================================
// 📦 CREATE BOOKING ENDPOINT (NO TRACKING NUMBER)
// ==================================================

app.put("/api/client/bookings/:id", upload.none(), async (req, res) => {
  try {
    const bookingId = req.params.id;
    const clientId = req.session.client?.id; // adjust based on your auth

    if (!clientId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if booking exists & belongs to client
    const check = await pool.query(
      `SELECT id FROM shipments WHERE id = $1 AND client_id = $2`,
      [bookingId, clientId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }

    // MAPPING: convert frontend fields → DB columns
    const {
      service_type,
      shipment_type,
      delivery_mode,
      port_origin,
      port_delivery,
      gross_weight,
      net_weight,
      num_packages,
      remarks,
      shipper,
      consignee,
      delivery_type,
      gross_weight_unit,
      net_weight_unit,
      specific_location,
      origin_lat,
      origin_lon,
      delivery_lat,
      delivery_lon,
    } = req.body;

    // UPDATE QUERY
    const updateQuery = `
      UPDATE shipments SET
        service_type = COALESCE($1, service_type),
        shipment_type = COALESCE($2, shipment_type),
        delivery_mode = COALESCE($3, delivery_mode),
        port_origin = COALESCE($4, port_origin),
        port_delivery = COALESCE($5, port_delivery),
        gross_weight = COALESCE($6, gross_weight),
        net_weight = COALESCE($7, net_weight),
        num_packages = COALESCE($8, num_packages),
        remarks = COALESCE($9, remarks),
        shipper = COALESCE($10, shipper),
        consignee = COALESCE($11, consignee),
        delivery_type = COALESCE($12, delivery_type),
        gross_weight_unit = COALESCE($13, gross_weight_unit),
        net_weight_unit = COALESCE($14, net_weight_unit),
        specific_location = COALESCE($15, specific_location),
        origin_lat = COALESCE($16, origin_lat),
        origin_lon = COALESCE($17, origin_lon),
        delivery_lat = COALESCE($18, delivery_lat),
        delivery_lon = COALESCE($19, delivery_lon),
        updated_at = NOW()
      WHERE id = $20 AND client_id = $21
      RETURNING *;
    `;

    const updated = await pool.query(updateQuery, [
      service_type,
      shipment_type,
      delivery_mode,
      port_origin,
      port_delivery,
      gross_weight,
      net_weight,
      num_packages,
      remarks,
      shipper,
      consignee,
      delivery_type,
      gross_weight_unit,
      net_weight_unit,
      specific_location,
      origin_lat,
      origin_lon,
      delivery_lat,
      delivery_lon,
      bookingId,
      clientId,
    ]);

    return res.status(200).json({
      message: "Booking updated successfully",
      booking: updated.rows[0],
    });
  } catch (err) {
    console.error("EDIT BOOKING ERROR:", err);
    res.status(500).json({ error: "Server error editing booking." });
  }
});

// ==================================================
// ADMIN SET BL NUMBER (Tracking Number / Bill of Lading)
// ==================================================
app.put(
  "/api/admin/bookings/:id/tracking-number",
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { tracking_number } = req.body;

      if (!tracking_number || tracking_number.trim() === "") {
        return res.status(400).send("BL Number (tracking_number) is required.");
      }

      const cleanBL = tracking_number.trim();

      // Check booking exists
      const check = await pool.query(
        "SELECT tracking_number, client_id FROM shipments WHERE id = $1",
        [id]
      );

      if (check.rows.length === 0) {
        return res.status(404).send("Booking not found.");
      }

      const booking = check.rows[0];

      // If tracking_number is NOT NULL or NOT empty → reject overwrite
      if (booking.tracking_number && booking.tracking_number.trim() !== "") {
        return res
          .status(400)
          .send("BL Number is already assigned to this booking.");
      }

      // Save BL Number + auto-approve booking
      await pool.query(
        `
          UPDATE shipments
          SET tracking_number = $1,
              status = 'Approved'
          WHERE id = $2
        `,
        [cleanBL, id]
      );

      // Insert notification for client
      await pool.query(
        `
          INSERT INTO notifications (
            client_id, booking_id, tracking_number, title, message,
            type, is_read, delivery_method, recipient_type, created_at
          )
          VALUES (
            $1, $2, $3,
            'Booking Approved',
            $4,
            'booking', FALSE, 'system', 'client', NOW()
          )
        `,
        [
          booking.client_id,
          id,
          cleanBL,
          `Your booking has been approved. BL Number: ${cleanBL}`,
        ]
      );

      return res.status(200).json({
        message: "BL Number assigned successfully",
        booking_id: id,
        tracking_number: cleanBL,
        status: "Approved",
      });
    } catch (err) {
      console.error("BL Number Error:", err);
      return res.status(500).send("Server Error while assigning BL Number.");
    }
  }
);

async function sendEmail({ to, subject, html, attachments = [] }) {
  if (!transporter) {
    console.error("sendEmail: transporter missing!");
    return null;
  }
  try {
    return await transporter.sendMail({
      from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
  } catch (err) {
    console.error("sendEmail error:", err);
    return null;
  }
}

//Lei
// ==================================================
// PUT /api/bookings/:bookingId/cancel
// Client can cancel Pending or Approved bookings
// ==================================================
app.put("/api/bookings/:bookingId/cancel", requireClient, async (req, res) => {
  try {
    const client = req.client;
    const bookingId = parseInt(req.params.bookingId, 10);
    const { reason } = req.body;

    // Validate ID
    if (!bookingId || isNaN(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    // Get existing shipment
    const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [
      bookingId,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const shipment = rows[0];

    // Ownership check
    if (shipment.client_id !== client.id) {
      return res.status(403).json({
        message: "Not authorized to cancel this booking",
      });
    }

    // Only pending or approved
    const allowed = ["pending", "approved"];
    if (!allowed.includes(shipment.status.toLowerCase())) {
      return res.status(400).json({
        message: "Only 'Pending' or 'Approved' bookings can be cancelled",
      });
    }

    // =====================================================
    // UPDATE SHIPMENT (aligns with your REAL DB columns)
    // =====================================================
    await pool.query(
      `UPDATE shipments SET
        status            = 'Cancelled by Client',
        decline_reason    = $1,
        declined_at       = NOW(),
        updated_at        = NOW()
       WHERE id = $2`,
      [reason || "Cancelled by client", bookingId]
    );

    // =====================================================
    // SYSTEM NOTIFICATION TO ADMIN
    // =====================================================
    const notifTitle = "Booking Cancelled by Client";
    const notifMessage = `${client.company_name} cancelled booking ${
      shipment.tracking_number || bookingId
    }`;

    await pool.query(
      `INSERT INTO notifications
        (client_id, booking_id, tracking_number, title, message, type, is_read, delivery_method, recipient_type, created_at)
       VALUES ($1,$2,$3,$4,$5,'booking',FALSE,'system','admin',NOW())`,
      [
        client.id,
        shipment.id,
        shipment.tracking_number,
        notifTitle,
        notifMessage,
      ]
    );

    // =====================================================
    // EMAIL ADMIN
    // =====================================================
    try {
      const adminEmail = "tslhead@gmail.com";

      const html = `
        <div style="font-family: Arial; color:#333;">
          <h2 style="color:#dc3545;">Booking Cancelled</h2>
          <p>Hello Admin,</p>
          <p><strong>${
            client.company_name
          }</strong> has cancelled a booking.</p>

          <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
            <tr><td><strong>Booking ID:</strong></td><td>${
              shipment.id
            }</td></tr>
            <tr><td><strong>Tracking #:</strong></td><td>${
              shipment.tracking_number || "Not assigned"
            }</td></tr>
            <tr><td><strong>Reason:</strong></td><td>${
              reason || "Cancelled by client"
            }</td></tr>
            <tr><td><strong>Cancelled At:</strong></td><td>${new Date().toLocaleString()}</td></tr>
          </table>

          <hr style="margin:20px 0;">
          <p>Please check this cancellation in your Admin Dashboard.</p>
        </div>
      `;

      await sendEmail({
        to: adminEmail,
        subject: `Booking Cancelled: ${shipment.tracking_number || bookingId}`,
        html,
      });

      console.log(`📧 Cancellation email sent to admin (${adminEmail})`);
    } catch (emailErr) {
      console.error("⚠️ Email sending failed:", emailErr);
    }

    // =====================================================
    // WEBSOCKET NOTIFICATION
    // =====================================================
    notifyAdmins({
      type: "bookingCancelled",
      payload: {
        client: client.company_name,
        bookingId: shipment.id,
        trackingNumber: shipment.tracking_number,
        message: notifMessage,
        date: new Date().toLocaleString(),
      },
    });

    return res.json({ message: "Booking cancelled successfully" });
  } catch (err) {
    console.error("Error cancelling booking:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// PUT /api/bookings/id/:id/edit
// Client edits a booking WITHOUT a tracking number
// (Allowed: pending + approved)
// Sends: DB Update + System notif + Email + WebSocket
// ==================================================
// ==================================================
// PUT /api/bookings/id/:id/edit  (Pending bookings)
// ==================================================
app.put("/api/bookings/id/:id/edit", requireClient, async (req, res) => {
  try {
    const client = req.client;
    const id = parseInt(req.params.id, 10);

    if (!id) return res.status(400).json({ message: "Invalid booking ID" });

    // Load booking
    const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [
      id,
    ]);

    if (!rows.length)
      return res.status(404).json({ message: "Booking not found" });

    const shipment = rows[0];

    // Ownership check
    if (shipment.client_id !== client.id)
      return res.status(403).json({ message: "Unauthorized" });

    // Allow only Pending or Approved
    const allowed = ["pending", "approved"];
    if (!allowed.includes(shipment.status.toLowerCase()))
      return res
        .status(400)
        .json({ message: "Only Pending or Approved bookings can be edited" });

    // ============================
    // Extract updated fields
    // ============================
    const {
      service_type,
      shipment_type,
      delivery_type,
      delivery_mode,
      port_origin,
      port_delivery,
      shipper,
      consignee,
      num_packages,
      gross_weight,
      gross_weight_unit,
      net_weight,
      net_weight_unit,
      specific_location,
      specific_address,
      remarks,
      expected_delivery_date,
      origin_lat,
      origin_lon,
      delivery_lat,
      delivery_lon,
      specific_lat,
      specific_lon,
    } = req.body;

    // ============================
    // Perform update
    // ============================
    const updateQuery = `
      UPDATE shipments SET
        service_type = COALESCE(NULLIF($1,''), service_type),
        shipment_type = COALESCE(NULLIF($2,''), shipment_type),
        delivery_type = COALESCE(NULLIF($3,''), delivery_type),
        delivery_mode = COALESCE(NULLIF($4,''), delivery_mode),

        port_origin = COALESCE(NULLIF($5,''), port_origin),
        port_delivery = COALESCE(NULLIF($6,''), port_delivery),

        shipper = COALESCE(NULLIF($7,''), shipper),
        consignee = COALESCE(NULLIF($8,''), consignee),

        num_packages = COALESCE(NULLIF($9,'')::int, num_packages),
        gross_weight = COALESCE(NULLIF($10,'')::numeric, gross_weight),
        gross_weight_unit = COALESCE(NULLIF($11,''), gross_weight_unit),
        net_weight = COALESCE(NULLIF($12,'')::numeric, net_weight),
        net_weight_unit = COALESCE(NULLIF($13,''), net_weight_unit),

        specific_location = COALESCE(NULLIF($14,''), specific_location),
        specific_address = COALESCE(NULLIF($15,''), specific_address),
        remarks = COALESCE(NULLIF($16,''), remarks),

        expected_delivery_date = COALESCE(NULLIF($17,'')::date, expected_delivery_date),

        origin_lat = COALESCE(NULLIF($18,'')::numeric, origin_lat),
        origin_lon = COALESCE(NULLIF($19,'')::numeric, origin_lon),
        delivery_lat = COALESCE(NULLIF($20,'')::numeric, delivery_lat),
        delivery_lon = COALESCE(NULLIF($21,'')::numeric, delivery_lon),
        specific_lat = COALESCE(NULLIF($22,'')::numeric, specific_lat),
        specific_lon = COALESCE(NULLIF($23,'')::numeric, specific_lon),

        updated_at = NOW()
      WHERE id = $24
      RETURNING *;
    `;

    await pool.query(updateQuery, [
      service_type,
      shipment_type,
      delivery_type,
      delivery_mode,
      port_origin,
      port_delivery,
      shipper,
      consignee,

      num_packages,
      gross_weight,
      gross_weight_unit,
      net_weight,
      net_weight_unit,

      specific_location,
      specific_address,
      remarks,

      expected_delivery_date,

      origin_lat,
      origin_lon,
      delivery_lat,
      delivery_lon,
      specific_lat,
      specific_lon,

      id,
    ]);

    return res.json({ message: "Booking updated successfully" });
  } catch (err) {
    console.error("Error updating booking:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// PUT /api/bookings/:trackingNumber/edit (Approved bookings)
// ==================================================
app.put(
  "/api/bookings/:trackingNumber/edit",
  requireClient,
  async (req, res) => {
    try {
      const client = req.client;
      const trackingNumber = req.params.trackingNumber;

      if (!trackingNumber)
        return res.status(400).json({ message: "Missing tracking number" });

      // Fetch booking
      const { rows } = await pool.query(
        `SELECT * FROM shipments WHERE tracking_number = $1`,
        [trackingNumber]
      );

      if (!rows.length)
        return res.status(404).json({ message: "Booking not found" });

      const shipment = rows[0];

      // Ownership check
      if (shipment.client_id !== client.id)
        return res.status(403).json({ message: "Unauthorized" });

      // Allow only Pending or Approved
      const allowed = ["pending", "approved"];
      if (!allowed.includes(shipment.status.toLowerCase()))
        return res
          .status(400)
          .json({ message: "Only Pending or Approved bookings can be edited" });

      // Extract fields
      const {
        service_type,
        delivery_mode,
        port_origin,
        port_delivery,
        gross_weight,
        net_weight,
        num_packages,
        remarks,
        expected_delivery_date,
        specific_address,
        specific_location,
      } = req.body;

      // ============================
      // GEO lookups
      // ============================
      let originGeo = null;
      let deliveryGeo = null;
      let specificGeo = null;

      if (port_origin && port_origin !== shipment.port_origin)
        originGeo = await validateLocationIQ(port_origin);

      if (port_delivery && port_delivery !== shipment.port_delivery)
        deliveryGeo = await validateLocationIQ(port_delivery);

      if (specific_address && specific_address !== shipment.specific_address)
        specificGeo = await validateLocationIQ(specific_address);

      // ============================
      // Perform update
      // ============================
      const updateQuery = `
      UPDATE shipments SET
        service_type = COALESCE(NULLIF($1,''), service_type),
        delivery_mode = COALESCE(NULLIF($2,''), delivery_mode),
        port_origin = COALESCE(NULLIF($3,''), port_origin),
        port_delivery = COALESCE(NULLIF($4,''), port_delivery),

        gross_weight = COALESCE(NULLIF($5,'')::numeric, gross_weight),
        net_weight = COALESCE(NULLIF($6,'')::numeric, net_weight),
        num_packages = COALESCE(NULLIF($7,'')::int, num_packages),

        remarks = COALESCE(NULLIF($8,''), remarks),
        expected_delivery_date = COALESCE(NULLIF($9,'')::date, expected_delivery_date),
        specific_address = COALESCE(NULLIF($10,''), specific_address),
        specific_location = COALESCE(NULLIF($11,''), specific_location),

        origin_lat = COALESCE($12, origin_lat),
        origin_lon = COALESCE($13, origin_lon),

        delivery_lat = COALESCE($14, delivery_lat),
        delivery_lon = COALESCE($15, delivery_lon),

        specific_lat = COALESCE($16, specific_lat),
        specific_lon = COALESCE($17, specific_lon),

        updated_at = NOW()
      WHERE tracking_number = $18
    `;

      await pool.query(updateQuery, [
        service_type,
        delivery_mode,
        port_origin,
        port_delivery,

        gross_weight,
        net_weight,
        num_packages,

        remarks,
        expected_delivery_date,
        specific_address,
        specific_location,

        originGeo?.lat ?? null,
        originGeo?.lon ?? null,
        deliveryGeo?.lat ?? null,
        deliveryGeo?.lon ?? null,
        specificGeo?.lat ?? null,
        specificGeo?.lon ?? null,

        trackingNumber,
      ]);

      return res.json({ message: "Booking updated successfully" });
    } catch (err) {
      console.error("Error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

app.get("/api/autocomplete", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") return res.json([]);

    const apiKey = "e5e95eba533c4eb69344256d49166905";

    const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
      q
    )}&filter=countrycode:ph&limit=5&apiKey=${apiKey}`;

    const geo = await fetch(url);
    const data = await geo.json();

    const suggestions = data.features.map((f) => ({
      display_name: f.properties.formatted,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    }));

    res.json(suggestions);
  } catch (err) {
    console.error("Autocomplete error:", err);
    res.status(500).json([]);
  }
});

// ==================================================
// GET /api/bookings/id/:id
// ==================================================
app.get("/api/bookings/id/:id", requireClient, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM shipments WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (!rows.length)
      return res.status(404).json({ message: "Booking not found" });

    const booking = rows[0];

    booking.gross_weight = booking.gross_weight
      ? Number(booking.gross_weight)
      : null;
    booking.net_weight = booking.net_weight ? Number(booking.net_weight) : null;
    booking.num_packages = booking.num_packages
      ? Number(booking.num_packages)
      : null;

    if (booking.expected_delivery_date) {
      booking.expected_delivery_date = booking.expected_delivery_date
        .toISOString()
        .split("T")[0];
    }

    if (booking.delivered_at) {
      booking.delivered_at = booking.delivered_at.toISOString().split("T")[0];
    }

    res.json(booking);
  } catch (err) {
    console.error("GET /api/bookings/id/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// GET /api/bookings/tracking/:trackingNumber
// ==================================================
app.get(
  "/api/bookings/tracking/:trackingNumber",
  requireClient,
  async (req, res) => {
    try {
      const client = req.client;
      const { trackingNumber } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM shipments WHERE tracking_number = $1`,
        [trackingNumber]
      );

      if (!rows.length)
        return res.status(404).json({ message: "Booking not found" });

      const booking = rows[0];

      // Ownership
      if (booking.client_id !== client.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      booking.gross_weight = booking.gross_weight
        ? Number(booking.gross_weight)
        : null;
      booking.net_weight = booking.net_weight
        ? Number(booking.net_weight)
        : null;
      booking.num_packages = booking.num_packages
        ? Number(booking.num_packages)
        : null;

      if (booking.expected_delivery_date) {
        booking.expected_delivery_date = booking.expected_delivery_date
          .toISOString()
          .split("T")[0];
      }

      if (booking.delivered_at) {
        booking.delivered_at = booking.delivered_at.toISOString().split("T")[0];
      }

      res.json(booking);
    } catch (err) {
      console.error("GET /api/bookings/tracking/:trackingNumber error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ==================================================
// GET /api/bookings/id/:id
// Fetch booking using numeric ID
// ==================================================
app.get("/api/bookings/id/:id", requireClient, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ message: "Missing booking ID" });

    const { rows } = await pool.query(
      `SELECT * FROM shipments WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = rows[0];

    // 🟦 Normalize numeric fields
    booking.gross_weight = booking.gross_weight
      ? Number(booking.gross_weight)
      : null;
    booking.net_weight = booking.net_weight ? Number(booking.net_weight) : null;
    booking.num_packages = booking.num_packages
      ? Number(booking.num_packages)
      : null;

    // 🟩 Fix date format for HTML <input type="date">
    if (booking.expected_delivery_date) {
      booking.expected_delivery_date = booking.expected_delivery_date
        .toISOString()
        .split("T")[0];
    }

    if (booking.delivered_at) {
      booking.delivered_at = booking.delivered_at.toISOString().split("T")[0];
    }

    res.json(booking);
  } catch (err) {
    console.error("GET /api/bookings/id/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// GET /api/bookings/tracking/:trackingNumber
// Fetch booking using tracking number
// =pp=================================================
app.get(
  "/api/bookings/tracking/:trackingNumber",
  requireClient,
  async (req, res) => {
    try {
      const client = req.client;
      const { trackingNumber } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM shipments WHERE tracking_number = $1`,
        [trackingNumber]
      );

      if (!rows.length) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const booking = rows[0];

      // 🔐 Ownership check
      if (booking.client_id !== client.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // 🟦 Convert numeric fields
      booking.gross_weight = booking.gross_weight
        ? Number(booking.gross_weight)
        : null;
      booking.net_weight = booking.net_weight
        ? Number(booking.net_weight)
        : null;
      booking.num_packages = booking.num_packages
        ? Number(booking.num_packages)
        : null;

      // 🟩 Convert dates to YYYY-MM-DD for edit modal
      if (booking.expected_delivery_date) {
        booking.expected_delivery_date = booking.expected_delivery_date
          .toISOString()
          .split("T")[0];
      }

      if (booking.delivered_at) {
        booking.delivered_at = booking.delivered_at.toISOString().split("T")[0];
      }

      res.json(booking);
    } catch (err) {
      console.error("GET /api/bookings/tracking/:trackingNumber error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ===================== Dashboard (client view) ===================== //
app.get("/api/client/dashboard", async (req, res) => {
  try {
    if (!req.session?.user || req.session.user.role !== "client") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientId = Number(req.session.user.id);
    if (isNaN(clientId)) {
      return res.status(400).json({ error: "Invalid client ID" });
    }

    // =========================
    // FIXED FREIGHT KPI QUERY
    // =========================
    const { rows: statsRows } = await pool.query(
      `
      SELECT 
  -- THIS MONTH: ALL BOOKINGS
  COUNT(*) FILTER (
    WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  )::int AS "totalBookings",

  -- THIS MONTH: LAND FREIGHT
  COUNT(*) FILTER (
    WHERE (
      lower(service_type) LIKE '%trucking%'
      OR lower(service_type) LIKE '%warehousing%'
      OR lower(service_type) LIKE '%door to door%'
      OR lower(service_type) LIKE '%rigging%'
    )
    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  )::int AS "landFreight",

  -- THIS MONTH: AIR FREIGHT
  COUNT(*) FILTER (
    WHERE lower(service_type) LIKE '%air%'
    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  )::int AS "airFreight",

  -- THIS MONTH: SEA FREIGHT
  COUNT(*) FILTER (
    WHERE lower(service_type) LIKE '%sea%'
    AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  )::int AS "seaFreight",

  -- THIS MONTH: PENDING BOOKINGS
  COUNT(*) FILTER (
    WHERE lower(status) = 'pending'
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
  )::int AS "pendingShipments",

  -- THIS MONTH: REVENUE
  COALESCE(SUM(
    CASE 
      WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      THEN revenue_amount 
      ELSE 0 
    END
  ), 0)::float AS "totalRevenue"

FROM shipments
WHERE client_id = $1;
      `,
      [clientId]
    );

    const stats = statsRows[0];

    // Most Common Freight
    let mostCommonFreight = "Equal";
    if (
      stats.airFreight > stats.seaFreight &&
      stats.airFreight > stats.landFreight
    )
      mostCommonFreight = "Air Freight";
    else if (
      stats.seaFreight > stats.airFreight &&
      stats.seaFreight > stats.landFreight
    )
      mostCommonFreight = "Sea Freight";
    else if (
      stats.landFreight > stats.airFreight &&
      stats.landFreight > stats.seaFreight
    )
      mostCommonFreight = "Land Freight";

    // Monthly Bookings
    const currentYear = new Date().getFullYear();
    const { rows: monthlyRows } = await pool.query(
      `
      SELECT 
        EXTRACT(MONTH FROM created_at)::int AS month,
        COUNT(*)::int AS count
      FROM shipments 
      WHERE client_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
      GROUP BY month ORDER BY month
      `,
      [clientId, currentYear]
    );

    const monthlyBookings = Array(12).fill(0);
    monthlyRows.forEach((row) => {
      monthlyBookings[row.month - 1] = row.count;
    });

    // Recent bookings
    const { rows: recentBookings } = await pool.query(
      `
      SELECT 
        id, tracking_number, port_origin, port_delivery,
        service_type, status, created_at, decline_reason
      FROM shipments
      WHERE client_id = $1
      ORDER BY created_at DESC
      `,
      [clientId]
    );

    res.json({
      totalBookings: stats.totalBookings,
      landFreight: stats.landFreight,
      airFreight: stats.airFreight,
      seaFreight: stats.seaFreight,
      pendingShipments: stats.pendingShipments,
      totalRevenue: stats.totalRevenue,
      mostCommonFreight,
      monthlyBookings,
      bookings: recentBookings,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== User Profile (client) ===================== //
app.get("/api/v1/user/profile", async (req, res) => {
  try {
    if (!req.session?.user || req.session.user.role !== "client") {
      return res
        .status(401)
        .json({ error: "Unauthorized: Not authenticated as client" });
    }

    const clientId = Number(req.session.user.id);
    if (isNaN(clientId)) {
      return res.status(400).json({ error: "Invalid client ID in session" });
    }

    // ✅ Fetch complete client profile (including photo)
    const { rows } = await pool.query(
      `
        SELECT 
          id,
          company_name AS company_name,
          contact_person AS contact_person,
          contact_number AS contact_number,
          email,
          address,
          photo, -- ✅ make sure this column exists in your 'clients' table
          created_at AS created_at
        FROM clients 
        WHERE id = $1
      `,
      [clientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const profile = rows[0];
    res.json(profile);

    // 📝 Audit Log (same as before)
    setImmediate(async () => {
      try {
        const ipAddress = req.ip || "Unknown";
        const userAgent = req.headers["user-agent"] || "Unknown";
        const UAParser = require("ua-parser-js");
        const parser = new UAParser(userAgent);
        const uaResult = parser.getResult();

        const deviceInfo = uaResult.device.model
          ? `${uaResult.device.vendor || ""} ${uaResult.device.model}`.trim()
          : uaResult.device.type || "Desktop";

        const actionSource =
          uaResult.device.type === "mobile" ? "Mobile App" : "Web";

        await pool.query(
          `INSERT INTO audit_logs (client_id, user_email, action, ip_address, device_info, action_source, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            clientId,
            profile.email,
            "View Profile",
            ipAddress,
            deviceInfo,
            actionSource,
          ]
        );
      } catch (err) {
        console.error("Audit log error:", err);
      }
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ===================== Dashboard Statistics ===================== //
app.get("/api/v1/dashboard/statistics", async (req, res) => {
  const clientId =
    req.session?.user?.role === "client" ? req.session.user.id : null;

  if (!clientId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { rows } = await pool.query(
      `
            SELECT 
                COUNT(*)::int AS "totalBookings",
                COUNT(*) FILTER (WHERE service_type ILIKE '%air%')::int AS "airFreight",
                COUNT(*) FILTER (WHERE service_type ILIKE '%sea%')::int AS "seaFreight",
                COUNT(*) FILTER (WHERE status = 'Pending')::int AS "pendingShipments"
            FROM shipments 
            WHERE client_id = $1
        `,
      [clientId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Statistics error:", err);
    res.status(500).json({ error: "Failed to load statistics" });
  }
});

// ===================== Recent Bookings ===================== //
app.get("/api/v1/bookings/recent", async (req, res) => {
  const clientId =
    req.session?.user?.role === "client" ? req.session.user.id : null;

  if (!clientId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 records

  try {
    const { rows } = await pool.query(
      `
            SELECT 
                tracking_number AS "trackingNumber",
                port_origin AS origin,
                port_delivery AS destination,
                service_type AS "freightType",
                status,
                created_at AS "createdDate",
                revenue_amount AS value,
                gross_weight AS weight
            FROM shipments 
            WHERE client_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `,
      [clientId, limit]
    );

    res.json(rows);
  } catch (err) {
    console.error("Recent bookings error:", err);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

// ===================== Recent Notifications ===================== //
app.get("/api/v1/notifications/recent", async (req, res) => {
  const clientId =
    req.session?.user?.role === "client" ? req.session.user.id : null;

  if (!clientId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 5, 50); // Max 20 notifications

  try {
    const { rows } = await pool.query(
      `
            SELECT 
                id,
                type,
                title,
                description,
                created_at,
                (read = false) AS "isNew"
            FROM notifications 
            WHERE client_id = $1 
            ORDER BY created_at Asc 
            LIMIT $2
        `,
      [clientId, limit]
    );

    res.json(rows);
  } catch (err) {
    console.error("Notifications error:", err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

// ===================== Booking Trends ===================== //
app.get("/api/v1/dashboard/trends", async (req, res) => {
  const clientId =
    req.session?.user?.role === "client" ? req.session.user.id : null;

  if (!clientId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const year = parseInt(req.query.year) || new Date().getFullYear();

  // Validate year (reasonable range)
  if (year < 2020 || year > 2030) {
    return res.status(400).json({ error: "Invalid year parameter" });
  }

  try {
    const { rows } = await pool.query(
      `
            SELECT 
                EXTRACT(MONTH FROM created_at)::int AS month,
                COUNT(*)::int AS count
            FROM shipments 
            WHERE client_id = $1 
                AND EXTRACT(YEAR FROM created_at) = $2
            GROUP BY month 
            ORDER BY month
        `,
      [clientId, year]
    );

    const data = Array(12).fill(0);
    rows.forEach((row) => {
      if (row.month >= 1 && row.month <= 12) {
        data[row.month - 1] = parseInt(row.count);
      }
    });

    res.json(data);
  } catch (err) {
    console.error("Trends error:", err);
    res.status(500).json({ error: "Failed to load booking trends" });
  }
});

// ===================== Error Handling Middleware ===================== //
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.get("/api/admin/clients", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, company_name AS username FROM clients ORDER BY company_name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Failed to fetch clients:", err);
    res.status(500).json({ error: "Server error" });
  }
});

//===========================================//
//    Data Analytics  IN ADMIN DASHBOARD    //
//=========================================//

//==========================================//
//       ADMIN REPORTS: BOOKINGS & OPS      //
//==========================================//

// Middleware (admin only)
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized: Please log in" });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access only" });
  }
  next();
}

// =======================================================
// 📦 Operational Manager Analytics
// 🚚 Shipment Volume: This Month vs Last Month (Weekly)
// =======================================================
app.get("/api/om/analytics/shipment-volume-compare", async (req, res) => {
  try {
    // 🗓️ Shipments created this month (grouped by week 1–4)
    const { rows: thisMonth } = await pool.query(`
      SELECT 
        ((EXTRACT(DAY FROM created_at) - 1) / 7 + 1)::INT AS week,
        COUNT(*) AS total
      FROM shipments
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY week
      ORDER BY week;
    `);

    // 📆 Shipments created last month (grouped by week 1–4)
    const { rows: lastMonth } = await pool.query(`
      SELECT 
        ((EXTRACT(DAY FROM created_at) - 1) / 7 + 1)::INT AS week,
        COUNT(*) AS total
      FROM shipments
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - interval '1 month')
      GROUP BY week
      ORDER BY week;
    `);

    // 🧩 Format data into fixed 4-week structure
    const formatData = (rows) =>
      [1, 2, 3, 4].map((w) => {
        const row = rows.find((r) => r.week === w);
        return row ? Number(row.total) : 0;
      });

    // 🧾 Return structured response for chart.js
    res.json({
      labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
      thisMonth: formatData(thisMonth),
      lastMonth: formatData(lastMonth),
    });
  } catch (err) {
    console.error("❌ OM shipment volume compare error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch OM shipment volume comparison" });
  }
});

// =============================
// Total Shipments This Quarter
// =============================
app.get("/api/analytics/shipments-quarter", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS total
      FROM shipments
      WHERE DATE_TRUNC('quarter', created_at) = DATE_TRUNC('quarter', CURRENT_DATE)
    `);

    res.json(rows[0]); // { total: 450 }
  } catch (err) {
    console.error("❌ Error fetching quarterly shipments:", err);
    res.status(500).json({ error: "Failed to fetch quarterly shipments" });
  }
});

app.get("/api/admin/reports/on-time-vs-delayed", async (req, res) => {
  try {
    const { filter, start, end } = req.query;

    // Use delivered_at → updated_at → created_at
    const dateCol = `COALESCE(delivered_at, updated_at, created_at)`;

    let dateWhere = "";
    const params = [];

    // === FILTERS ===
    if (filter === "this_month") {
      dateWhere = `AND DATE_TRUNC('month', ${dateCol}) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (filter === "last_month") {
      dateWhere = `AND DATE_TRUNC('month', ${dateCol}) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`;
    } else if (filter === "this_year") {
      dateWhere = `AND DATE_TRUNC('year', ${dateCol}) = DATE_TRUNC('year', CURRENT_DATE)`;
    } else if (filter === "custom" && start && end) {
      params.push(start, end);
      dateWhere = `AND ${dateCol}::date BETWEEN $1::date AND $2::date`;
    }

    const sql = `
      SELECT 
        COUNT(*) FILTER (
          WHERE expected_delivery_date IS NOT NULL
          AND (
               LOWER(status) LIKE '%completed%'
               OR LOWER(status) LIKE '%delivered%'
              )
          AND COALESCE(delivered_at, updated_at)::date <= expected_delivery_date
          ${dateWhere}
        ) AS on_time,

        COUNT(*) FILTER (
          WHERE expected_delivery_date IS NOT NULL
          AND (
               LOWER(status) LIKE '%completed%'
               OR LOWER(status) LIKE '%delivered%'
              )
          AND COALESCE(delivered_at, updated_at)::date > expected_delivery_date
          ${dateWhere}
        ) AS delayed
      FROM shipments
      WHERE LOWER(status) LIKE '%completed%' OR LOWER(status) LIKE '%delivered%';
    `;

    const { rows } = await pool.query(sql, params);

    res.json({
      on_time: Number(rows[0].on_time) || 0,
      delayed: Number(rows[0].delayed) || 0,
    });
  } catch (err) {
    console.error("On-Time vs Delayed ERROR:", err);
    res.status(500).json({ error: "Failed to fetch on-time vs delayed" });
  }
});

// 📊 Utilization (% of completed shipments)
app.get("/api/admin/reports/utilization", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ROUND(
          (SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(*), 0)) * 100, 2
        ) AS utilization
      FROM shipments
    `);
    res.json(rows[0] || { utilization: 0 });
  } catch (err) {
    console.error("Utilization error:", err);
    res.status(500).json({ error: "Failed to fetch utilization" });
  }
});

// 📊 Cancelled (Declined) Shipments per Month
app.get("/api/admin/reports/cancelled", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Mon') AS month, COUNT(*) AS total
      FROM shipments
      WHERE status = 'Declined'
      GROUP BY 1
      ORDER BY MIN(created_at)
    `);
    res.json(rows);
  } catch (err) {
    console.error("Cancelled shipments error:", err);
    res.status(500).json({ error: "Failed to fetch cancelled shipments" });
  }
});

// 📊 Booking Trends per Month
app.get("/api/admin/reports/booking-trends", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Mon') AS month, COUNT(*) AS total
      FROM shipments
      GROUP BY 1
      ORDER BY MIN(created_at)
    `);
    res.json(rows);
  } catch (err) {
    console.error("Booking trends error:", err);
    res.status(500).json({ error: "Failed to fetch booking trends" });
  }
});

app.get("/api/analytics/shipment-status", async (req, res) => {
  try {
    const { filter, start, end } = req.query;
    const params = [];

    const buildDateFilter = (column) => {
      switch (filter) {
        case "this_month":
          return `DATE_TRUNC('month', ${column}) = DATE_TRUNC('month', CURRENT_DATE)`;
        case "last_month":
          return `DATE_TRUNC('month', ${column}) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`;
        case "this_year":
          return `DATE_TRUNC('year', ${column}) = DATE_TRUNC('year', CURRENT_DATE)`;
        case "custom":
          if (start && end) {
            params.push(start, end);
            return `${column}::date BETWEEN $${params.length - 1} AND $${
              params.length
            }`;
          }
      }
      return "1=1";
    };

    const sql = `
      SELECT
        -- bookings created & approved last month
        (SELECT COUNT(*) FROM shipments 
         WHERE LOWER(status)='approved'
         AND ${buildDateFilter("created_at")}) AS approved,

        -- bookings created with pending status last month
        (SELECT COUNT(*) FROM shipments 
         WHERE LOWER(status)='pending'
         AND ${buildDateFilter("created_at")}) AS pending,

        -- delivered shipments by delivery date
        (SELECT COUNT(*) FROM shipments 
         WHERE LOWER(status)='delivered'
         AND ${buildDateFilter("delivered_at")}) AS completed,

        -- declined shipments based on decline date
        (SELECT COUNT(*) FROM shipments 
         WHERE LOWER(status)='declined'
         AND ${buildDateFilter("declined_at")}) AS declined
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching shipment status:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------
// Top Clients by Booking
// -------------------------------
app.get("/api/analytics/top-clients-bookings", async (req, res) => {
  try {
    let { filter, start, end } = req.query;

    let dateWhere = "";
    const params = [];

    // Use your shipment date column
    const dateCol = "s.created_at";

    if (filter === "this_month") {
      dateWhere = `AND ${dateCol} >= date_trunc('month', CURRENT_DATE)`;
    } else if (filter === "last_month") {
      dateWhere = `
        AND ${dateCol} >= date_trunc('month', CURRENT_DATE - interval '1 month')
        AND ${dateCol} < date_trunc('month', CURRENT_DATE)
      `;
    } else if (filter === "this_year") {
      dateWhere = `AND ${dateCol} >= date_trunc('year', CURRENT_DATE)`;
    } else if (filter === "custom" && start && end) {
      dateWhere = `AND ${dateCol} BETWEEN $1 AND $2`;
      params.push(start, end);
    }

    const sql = `
      SELECT 
        c.company_name AS name,
        COUNT(s.id) AS total_bookings
      FROM clients c
      LEFT JOIN shipments s 
        ON c.id = s.client_id
        ${dateWhere ? dateWhere : ""}
      GROUP BY c.id, c.company_name
      ORDER BY total_bookings DESC
      LIMIT 5
    `;

    const { rows } = await pool.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching top clients by bookings:", err);
    res.status(500).json({ error: "Failed to fetch top clients by bookings" });
  }
});

// ===========================================
//  CLIENT SHIPMENT HISTORY (safe filtering)
// ===========================================
app.get("/api/analytics/client-history", async (req, res) => {
  try {
    let { client_name, client_id } = req.query;

    console.log("📦 Fetching Client Shipment History:", req.query);

    let where = "";
    const params = [];

    // ======================================================
    // 1. PRIORITY: Filter by client_id only if it is valid
    // ======================================================
    if (client_id && client_id !== "all" && client_id !== "undefined") {
      where = "WHERE s.client_id = $1";
      params.push(Number(client_id));
    }
    // ======================================================
    // 2. Otherwise, filter by client_name (safe string)
    // ======================================================
    else if (
      client_name &&
      client_name !== "all" &&
      client_name !== "undefined"
    ) {
      where = "WHERE LOWER(c.company_name) = LOWER($1)";
      params.push(client_name);
    }

    // ======================================================
    // 3. Otherwise, no filter → return ALL shipments
    // ======================================================
    else {
      console.log("➡ No client filter applied — returning ALL shipments.");
    }

    // ======================================================
    // SQL Query
    // ======================================================
    const sql = `
      SELECT
        c.company_name AS client_name,
        s.tracking_number,
        s.service_type,
        s.port_origin AS origin,
        s.port_delivery AS destination,
        s.status,
        s.created_at AS shipment_date
      FROM shipments s
      INNER JOIN clients c ON s.client_id = c.id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT 500;
    `;

    console.log("Executing query:", sql, "Params:", params);

    const { rows } = await pool.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching client shipment history:", err);
    res.status(500).json({
      error: "Failed to fetch client shipment history",
    });
  }
});

// ===========================================
//  CLIENTS WHO HAVE SHIPMENTS ONLY
// ===========================================
app.get("/api/reports/clients-with-shipments", async (req, res) => {
  try {
    const sql = `
      SELECT DISTINCT
        c.id,
        c.company_name
      FROM clients c
      INNER JOIN shipments s 
        ON s.client_id = c.id
      ORDER BY c.company_name ASC;
    `;

    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching clients with shipments:", err);
    res.status(500).json({ error: "Failed to fetch clients with shipments" });
  }
});

//==========================================//
//         ACCOUNTING SIDE REPORTS         //
//========================================//

// Revenue trend (per month)
app.get(
  "/api/reports/revenue",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Mon') AS month,
             SUM(CASE WHEN status='paid' THEN amount_due ELSE 0 END) AS revenue
      FROM invoices
      GROUP BY 1
      ORDER BY MIN(created_at)
    `);
      res.json(rows);
    } catch (err) {
      console.error("Revenue error:", err);
      res.status(500).json({ error: "Failed to fetch revenue" });
    }
  }
);

// Single month (latest)
app.get(
  "/api/analytics/client-revenue",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT c.company_name,
             SUM(i.amount_due) AS total
      FROM clients c
      JOIN shipments s ON c.id = s.client_id
      JOIN invoices i ON i.shipment_id = s.id
      WHERE i.status = 'paid'
        AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY c.company_name
      ORDER BY total DESC
      LIMIT 10
    `);
      res.json(rows);
    } catch (err) {
      console.error("❌ Error fetching single-month revenue:", err);
      res.status(500).json({ error: "Failed to fetch revenue" });
    }
  }
);

app.get(
  "/api/analytics/client-revenue-trend",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { filter, start, end } = req.query;

      let dateWhere = "";
      let params = [];

      if (filter === "this_month") {
        dateWhere = `
          AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
        `;
      } else if (filter === "last_month") {
        dateWhere = `
          AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        `;
      } else if (filter === "this_year") {
        dateWhere = `
          AND DATE_TRUNC('year', i.created_at) = DATE_TRUNC('year', CURRENT_DATE)
        `;
      } else if (filter === "custom" && start && end) {
        dateWhere = `
          AND i.created_at BETWEEN $1 AND $2
        `;
        params = [start, end];
      } else {
        dateWhere = `
          AND i.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 month')
        `;
      }

      const sql = `
        WITH months AS (
          SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * g) AS month_start
          FROM generate_series(0,5) g
        )
        SELECT 
          TO_CHAR(m.month_start, 'Mon YYYY') AS label,       -- ✔ renamed
          c.company_name,
          COALESCE(SUM(i.amount_due), 0) AS revenue          -- ✔ renamed
        FROM months m
        CROSS JOIN clients c
        LEFT JOIN shipments s ON c.id = s.client_id
        LEFT JOIN invoices i 
            ON i.shipment_id = s.id
           AND DATE_TRUNC('month', i.created_at) = m.month_start
           AND i.status = 'paid'
        WHERE 1=1
          ${dateWhere}
        GROUP BY m.month_start, c.company_name
        ORDER BY m.month_start, c.company_name;
      `;

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      console.error("❌ Error fetching revenue trend:", err);
      res.status(500).json({ error: "Failed to fetch client revenue trend" });
    }
  }
);

// Payment status distribution
app.get(
  "/api/reports/payment-status",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { filter = "this_month", start, end } = req.query;

      const dateCol = "due_date";
      let where = "";
      const params = [];

      /* ---------------------------------------------
         FILTERING
      --------------------------------------------- */
      if (filter === "this_month") {
        where = `
          EXTRACT(MONTH FROM ${dateCol}) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE)
        `;
      } else if (filter === "last_month") {
        where = `
          EXTRACT(MONTH FROM ${dateCol}) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
          AND EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
        `;
      } else if (filter === "this_year") {
        where = `
          EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE)
        `;
      } else if (filter === "custom" && start && end) {
        params.push(start, end);
        where = `${dateCol} BETWEEN $1 AND $2`;
      } else {
        where = "TRUE"; // fallback
      }

      /* ---------------------------------------------
         PAYMENT STATUS LOGIC
      --------------------------------------------- */
      const query = `
        SELECT
          -- Paid on or before due date
          SUM(CASE WHEN status = 'paid' AND updated_at <= due_date THEN 1 ELSE 0 END) AS on_time,

          -- Paid after due date
          SUM(CASE WHEN status = 'paid' AND updated_at > due_date THEN 1 ELSE 0 END) AS late,

          -- Unpaid or no status
          SUM(CASE WHEN status IS NULL OR status = 'unpaid' THEN 1 ELSE 0 END) AS pending

        FROM invoices
        WHERE ${where};
      `;

      const { rows } = await pool.query(query, params);

      res.json(rows[0]);
    } catch (err) {
      console.error("Payment status error:", err);
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  }
);

// Invoice reports (counts per month)
app.get(
  "/api/reports/invoices",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Mon') AS month, COUNT(*) AS total
      FROM invoices
      GROUP BY 1
      ORDER BY MIN(created_at)
    `);
      res.json(rows);
    } catch (err) {
      console.error("Invoices error:", err);
      res.status(500).json({ error: "Failed to fetch invoice reports" });
    }
  }
);

// ===========================
// Aging Report API
// ===========================
app.get(
  "/api/reports/aging",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT
        SUM(CASE WHEN status = 'unpaid' AND NOW() - due_date <= interval '30 days' THEN 1 ELSE 0 END) AS "0_30",
        SUM(CASE WHEN status = 'unpaid' AND NOW() - due_date > interval '30 days' AND NOW() - due_date <= interval '60 days' THEN 1 ELSE 0 END) AS "31_60",
        SUM(CASE WHEN status = 'unpaid' AND NOW() - due_date > interval '60 days' AND NOW() - due_date <= interval '90 days' THEN 1 ELSE 0 END) AS "61_90",
        SUM(CASE WHEN status = 'unpaid' AND NOW() - due_date > interval '90 days' THEN 1 ELSE 0 END) AS "90_plus"
      FROM invoices;
    `);

      res.json(rows[0]);
    } catch (err) {
      console.error("❌ Aging Report SQL error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ===============================
// 👥 Get Client List (for dropdowns)
// ===============================
app.get("/api/reports/client-list", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, company_name AS client_name
      FROM clients 
      ORDER BY company_name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching clients:", err.message);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// ===========================
// Clients Overview API (Analytics)
// ===========================
app.get(
  "/api/reports/analytics/clients",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT 
        c.company_name AS client_name,

        -- Total bookings
        (SELECT COUNT(*) 
         FROM shipments s 
         WHERE s.client_id = c.id) AS total_bookings,

        -- Total revenue (all invoices)
        (SELECT COALESCE(SUM(i.amount_due), 0) 
         FROM invoices i 
         WHERE i.client_id = c.id) AS total_revenue,

        (
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        (
          SUM(
            CASE 
              WHEN expected_delivery_date IS NOT NULL
                AND (LOWER(status) LIKE '%completed%' OR LOWER(status) LIKE '%delivered%')
                AND COALESCE(delivered_at, updated_at)::date <= expected_delivery_date
              THEN 1 ELSE 0 END
            )::decimal 
          / COUNT(*)
        ) * 100,
      2)
    END
  FROM shipments s 
  WHERE s.client_id = c.id
) AS on_time_percent

      FROM clients c
      ORDER BY total_bookings DESC;
    `);

      res.json(rows);
    } catch (err) {
      console.error("❌ Clients Report error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

//==========================================//
//            CLIENT SIDE REPORTS          //
//=========================================//

// Shipment summary by service type
app.get("/api/reports/shipment-summary", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT service_type, COUNT(*) AS total
      FROM shipments
      GROUP BY service_type
    `);
    res.json(rows);
  } catch (err) {
    console.error("Shipment summary error:", err);
    res.status(500).json({ error: "Failed to fetch shipment summary" });
  }
});

app.get("/api/analytics/client-revenue", async (req, res) => {
  try {
    const { filter, start, end } = req.query;

    // ----------------------
    // 1. DATE FILTER BUILDER
    // ----------------------
    let dateWhere = "";

    if (filter === "this_month") {
      dateWhere = `AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (filter === "last_month") {
      dateWhere = `AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`;
    } else if (filter === "this_year") {
      dateWhere = `AND DATE_TRUNC('year', i.created_at) = DATE_TRUNC('year', CURRENT_DATE)`;
    } else if (filter === "custom" && start && end) {
      dateWhere = `AND i.created_at::date BETWEEN '${start}' AND '${end}'`;
    }
    // else: no filter = all time

    // ----------------------
    // 2. MAIN QUERY
    // ----------------------
    const query = `
      SELECT 
        c.company_name,
        TO_CHAR(i.created_at, 'Mon YYYY') AS month,
        SUM(i.amount_due) AS total
      FROM invoices i
      JOIN shipments s ON s.id = i.shipment_id
      JOIN clients c ON c.id = s.client_id
      WHERE i.status = 'paid'
      ${dateWhere}
      GROUP BY c.company_name, month, DATE_TRUNC('month', i.created_at)
      ORDER BY DATE_TRUNC('month', i.created_at), c.company_name
    `;

    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error("❌ client-revenue error:", err);
    res.status(500).json({ error: "Failed to fetch client revenue data" });
  }
});

//=======================//
// END OF ADMIN REPORTS //
//=====================//

// ========================
//    USERS PROFILE API
// ========================

// ========================
// GET PROFILE
// ========================
app.get("/api/profile", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    let row;

    if (user.role === "client") {
      const { rows } = await pool.query(
        `
        SELECT id, company_name, contact_person, contact_number, email, address, photo, role
        FROM clients
        WHERE id = $1 AND archived = false
      `,
        [user.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Client not found" });
      }

      row = rows[0];
    } else if (user.role === "admin") {
      const { rows } = await pool.query(
        `
        SELECT id, username, role
        FROM users
        WHERE id = $1
      `,
        [user.id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Normalize fields for frontend compatibility
      row = {
        id: rows[0].id,
        company_name: rows[0].username || "",
        contact_person: rows[0].username || "",
        contact_number: "",
        email: "", // no email column in users table
        address: "",
        photo: null,
        role: rows[0].role,
      };
    }

    res.json(row);
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========================
// UPDATE PROFILE (CLIENT ONLY)
// ========================
app.put("/api/profile", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "client") {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const {
    company_name,
    contact_person,
    contact_number,
    email,
    address,
    password,
  } = req.body;

  if (!password) {
    return res
      .status(400)
      .json({ error: "Password is required to update profile" });
  }

  try {
    // 1. Verify current password
    const { rows: pwRows } = await pool.query(
      "SELECT password FROM clients WHERE id = $1",
      [user.id]
    );

    if (pwRows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const isMatch = await bcrypt.compare(password, pwRows[0].password);
    if (!isMatch) {
      return res.status(403).json({ error: "Incorrect password" });
    }

    // 2. Update DB
    await pool.query(
      `
      UPDATE clients SET
        company_name = COALESCE($1, company_name),
        contact_person = COALESCE($2, contact_person),
        contact_number = COALESCE($3, contact_number),
        email = COALESCE($4, email),
        address = COALESCE($5, address)
      WHERE id = $6
    `,
      [company_name, contact_person, contact_number, email, address, user.id]
    );

    // 3. Fetch updated record
    const { rows } = await pool.query(
      `
      SELECT id, company_name, contact_person, contact_number, email, address, photo, role
      FROM clients
      WHERE id = $1
    `,
      [user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Client not found after update" });
    }

    const updatedUser = rows[0];

    // 4. Refresh session
    req.session.user = {
      ...req.session.user,
      id: updatedUser.id,
      company_name: updatedUser.company_name,
      contact_person: updatedUser.contact_person,
      contact_number: updatedUser.contact_number,
      email: updatedUser.email,
      address: updatedUser.address,
      photo: updatedUser.photo,
      role: updatedUser.role || "client",
    };

    // 5. Respond
    res.json({ message: "Profile updated", user: req.session.user });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========================
// UPLOAD PHOTO
// ========================
app.post("/api/profile/photo", upload.single("photo"), async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "client")
    return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    await pool.query("UPDATE clients SET photo = $1 WHERE id = $2", [
      req.file.filename,
      user.id,
    ]);

    // refresh session with new photo
    req.session.user = {
      ...req.session.user,
      photo: req.file.filename,
    };

    res.json({ message: "Photo uploaded", user: req.session.user });
  } catch (err) {
    console.error("Upload photo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========================
// REMOVE PHOTO
// ========================
app.delete("/api/profile/photo", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "client")
    return res.status(401).json({ error: "Not authenticated" });

  try {
    await pool.query("UPDATE clients SET photo = NULL WHERE id = $1", [
      user.id,
    ]);

    // refresh session
    req.session.user = {
      ...req.session.user,
      photo: null,
    };

    res.json({ message: "Photo removed", user: req.session.user });
  } catch (err) {
    console.error("Remove photo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========================
// CHANGE PASSWORD
// ========================
app.put("/api/profile/password", async (req, res) => {
  const user = req.session.user;
  if (!user || user.role !== "client")
    return res.status(401).json({ error: "Not authenticated" });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Both passwords required" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT password FROM clients WHERE id = $1",
      [user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Client not found" });

    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match)
      return res.status(400).json({ error: "Incorrect old password" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE clients SET password = $1 WHERE id = $2", [
      hashed,
      user.id,
    ]);

    // refresh session stays same (photo intact)
    res.json({ message: "Password changed", user: req.session.user });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========================
//       AUDIT LOGS
// ========================

app.get("/api/audit-logs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(a.timestamp, 'YYYY-MM-DD') AS date,
        TO_CHAR(a.timestamp, 'HH24:MI:SS') AS time,
        a.user_email AS user_identifier,
        COALESCE(u.role, c.role, 'Unknown') AS role,
        a.ip_address,
        a.action,
        CONCAT_WS(' | ', a.device_info, a.action_source) AS details,
        COALESCE(u.username, c.contact_person, a.user_email) AS user
      FROM audit_logs a
      LEFT JOIN users u ON a.user_email = u.username OR a.user_email = u.id::text
      LEFT JOIN clients c ON a.user_email = c.email OR a.user_email = c.id::text
      ORDER BY a.timestamp DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ========================
//       NOTIFICATIONS
// ========================

// ==========================================
//      ADMIN CREATE/SEND NOTIFICATIONS
// ==========================================

// Enhanced notifications fetch with better error handling
app.get("/api/notifications", async (req, res) => {
  const clientId = req.session.client?.id;

  if (!clientId) {
    console.log("Client not authenticated");
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT id, title, message, type, is_read, delivery_method, created_at
      FROM notifications
      WHERE client_id = $1
      ORDER BY created_at DESC
    `,
      [clientId]
    );

    // ✅ Log audit trail
    await logAction(
      req.session.client?.email || "Unknown client",
      "Viewed notifications",
      req.ip,
      req.headers["user-agent"],
      "Client Dashboard"
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch notifications", details: err.message });
  }
});

app.put("/api/notifications/:id/read", async (req, res) => {
  const clientId = req.session.client?.id;
  const notifId = req.params.id;

  if (!clientId) return res.status(401).json({ error: "Not authenticated" });

  try {
    // 🔍 Fetch notification details before updating
    const notifDetails = await pool.query(
      "SELECT title FROM notifications WHERE id = $1 AND client_id = $2",
      [notifId, clientId]
    );

    if (notifDetails.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const title = notifDetails.rows[0]?.title || "Untitled Notification";

    // ✅ Mark as read
    await pool.query(
      `
      UPDATE notifications SET is_read = TRUE WHERE id = $1 AND client_id = $2
    `,
      [notifId, clientId]
    );

    // ✅ Log audit action
    await logAction(
      req.session.client?.email || "Unknown client",
      `Marked notification "${title}" as read`,
      req.ip,
      req.headers["user-agent"],
      "Client Portal"
    );

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

app.put("/api/bookings/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log(`📦 Updating booking ID ${id} to status: ${status}`);

  try {
    // 1. Fetch client_id and tracking number from shipment
    const shipmentResult = await pool.query(
      `SELECT client_id, tracking_number FROM shipments WHERE id = $1`,
      [id]
    );

    if (shipmentResult.rows.length === 0) {
      console.log("❌ No shipment found for that ID.");
      return res.status(404).json({ error: "Booking not found" });
    }

    const clientId = shipmentResult.rows[0].client_id;
    const trackingNumber =
      shipmentResult.rows[0].tracking_number || `TSL-${id}`;
    console.log(
      `✅ Found client ID: ${clientId}, Tracking #: ${trackingNumber}`
    );

    // 2. Update booking status
    const updateResult = await pool.query(
      `UPDATE shipments SET status = $1 WHERE id = $2`,
      [status, id]
    );
    console.log(
      `📝 Booking status updated. Rows affected: ${updateResult.rowCount}`
    );

    // 3. Prepare notification
    let title = "",
      message = "";
    const normalizedStatus = status.trim().toLowerCase();

    if (normalizedStatus === "approved") {
      title = "Booking Approved";
      message = `Your booking #${trackingNumber} has been approved.`;
    } else if (normalizedStatus === "declined") {
      title = "Booking Declined";
      message = `Your booking #${trackingNumber} was declined.`;
    } else {
      return res.status(400).json({ error: "Invalid status" });
    }

    console.log("📢 Preparing to insert client notification:", {
      clientId,
      shipmentId: id,
      title,
      message,
    });

    // 4. Insert into CLIENT notifications
    const notifResult = await pool.query(
      `INSERT INTO client_notifications (client_id, title, message, type, is_read, created_at)
       VALUES ($1, $2, $3, 'booking', FALSE, NOW())
       RETURNING id`,
      [clientId, title, message]
    );

    const notifId = notifResult.rows[0]?.id;
    console.log(`✅ Client notification inserted with ID: ${notifId}`);

    return res.json({
      message: `Booking updated and client notified.`,
      notificationId: notifId,
    });
  } catch (err) {
    console.error(
      "❌ Server error while updating booking or inserting client notification:",
      err
    );
    return res
      .status(500)
      .json({ error: "Server error", details: err.message });
  }
});

// Additional helper endpoint to check notifications for debugging
app.get("/api/notifications/debug/:clientId", async (req, res) => {
  const { clientId } = req.params;

  try {
    const notifications = await pool.query(
      `
      SELECT id, client_id, shipment_id, title, message, type, is_read, 
             delivery_method, created_at
      FROM notifications 
      WHERE client_id = $1 
      ORDER BY created_at DESC 
      LIMIT 10
    `,
      [clientId]
    );

    res.json({
      clientId: clientId,
      notificationCount: notifications.rows.length,
      notifications: notifications.rows,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.get("/api/debug/notifications-table", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'notifications'
      ORDER BY ordinal_position
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error checking table structure:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add this endpoint to manually test notification creation
app.post("/api/debug/test-notification", async (req, res) => {
  const { client_id, message } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO notifications (client_id, title, message, type, is_read, delivery_method, created_at)
      VALUES ($1, $2, $3, $4, FALSE, $5, NOW())
      RETURNING *
    `,
      [
        client_id,
        "Test Notification",
        message || "This is a test notification",
        "info",
        "system",
      ]
    );

    res.json({
      message: "Test notification created",
      notification: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating test notification:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
//      CLIENT NOTIFICATIONS
// ==========================================

// Get client notifications
app.get("/api/client/notifications", async (req, res) => {
  const clientId = req.session.user?.id;
  if (!clientId || req.session.user?.role !== "client") {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT id, title, message, type, is_read, created_at
      FROM client_notifications
      WHERE client_id = $1
      ORDER BY created_at DESC
    `,
      [clientId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching client notifications:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch notifications", details: err.message });
  }
});

// Mark notification as read
app.put("/api/client/notifications/:id/read", async (req, res) => {
  const clientId = req.session.user?.id;
  const notifId = req.params.id;

  if (!clientId || req.session.user?.role !== "client") {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE client_notifications SET is_read = TRUE WHERE id = $1 AND client_id = $2`,
      [notifId, clientId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

//-----------------------------//
//      SHARED INVOICE API     //
//  For Admin & Accounting     //
//-----------------------------//

// Middleware to check role
function checkInvoiceAccess(req, res, next) {
  const user = req.session.user; // Assuming you store logged-in user in session
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!["admin", "accounting"].includes(user.role)) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

// GET /api/invoices (ALL bookings/shipments + invoice info + client name)
app.get("/api/invoices", checkInvoiceAccess, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id AS shipment_id,
        s.tracking_number,
        s.client_id,
        c.company_name AS client_name,
        c.contact_person,
        c.contact_number,
        c.email AS client_email,
        s.service_type,
        s.delivery_mode,
        s.port_origin,
        s.port_delivery,
        s.gross_weight,
        s.net_weight,
        s.num_packages,
        s.delivery_type,
        s.status AS shipment_status,
        s.created_at,

        -- Invoice (if exists)
        i.id AS invoice_id,
        i.invoice_number,
        i.status AS invoice_status,
        i.amount_due,
        i.due_date,
        i.paid_at
      FROM shipments s
      JOIN clients c ON s.client_id = c.id
      LEFT JOIN invoices i ON i.shipment_id = s.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching invoices/bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===============================
// POST /api/invoices/generate/:shipmentId
// Generate Invoice + Notify Client (in-app + Gmail)
// ===============================
app.post(
  "/api/invoices/generate/:shipmentId",
  checkInvoiceAccess,
  async (req, res) => {
    const { shipmentId } = req.params;
    const {
      amount_due,
      tax_rate,
      accountant_name,
      accountant_signature,
      notes,
    } = req.body;

    try {
      const amountDue = Number(amount_due);
      const taxRate = Number(tax_rate) || 0;

      if (!amountDue || isNaN(amountDue) || amountDue <= 0) {
        return res.status(400).json({ error: "Invalid amount provided" });
      }

      if (taxRate < 0 || taxRate > 100) {
        return res.status(400).json({ error: "Invalid tax rate (0–100%)" });
      }

      // 💰 Calculate tax and total
      const taxAmount = (amountDue * taxRate) / 100;
      const totalAmount = amountDue + taxAmount;

      // 1️⃣ Get shipment + client
      const shipmentRes = await pool.query(
        `
      SELECT s.*, c.company_name, c.contact_person, c.contact_number, c.email, c.address
      FROM shipments s
      JOIN clients c ON s.client_id = c.id
      WHERE s.id = $1
    `,
        [shipmentId]
      );

      const shipment = shipmentRes.rows[0];
      if (!shipment)
        return res.status(400).json({ error: "Shipment not found" });

      // 2️⃣ Prevent duplicate invoice
      const checkInvoice = await pool.query(
        "SELECT * FROM invoices WHERE shipment_id = $1",
        [shipmentId]
      );
      if (checkInvoice.rows.length > 0) {
        return res
          .status(400)
          .json({ error: "Invoice already generated for this shipment" });
      }

      // 3️⃣ Generate random invoice number
      let newInvoiceNumber;
      let exists = true;
      while (exists) {
        const randomDigits = Math.floor(
          Math.random() * (10 ** 12 - 10 ** 6) + 10 ** 6
        );
        newInvoiceNumber = `INV-${randomDigits}`;
        const checkDup = await pool.query(
          "SELECT 1 FROM invoices WHERE invoice_number = $1",
          [newInvoiceNumber]
        );
        exists = checkDup.rows.length > 0;
      }

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);

      // 🧾 Create PDF
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]); // A4
      const { height } = page.getSize();

      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Logo
      const logoPath = path.join(__dirname, "invoices", "logo.png");
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoBytes);
        const scaledLogo = logoImage.scale(0.39);
        page.drawImage(logoImage, {
          x: 50,
          y: height - 100,
          width: scaledLogo.width,
          height: scaledLogo.height,
        });
      }

      // Header
      page.drawText("TSL Freight Movers INC.", {
        x: 200,
        y: height - 60,
        size: 18,
        font: boldFont,
      });
      page.drawText("Official Invoice", {
        x: 200,
        y: height - 80,
        size: 14,
        font: normalFont,
      });

      // Divider line
      page.drawLine({
        start: { x: 50, y: height - 110 },
        end: { x: 545, y: height - 110 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      // Invoice Info
      page.drawText(`Invoice No: ${newInvoiceNumber}`, {
        x: 400,
        y: height - 130,
        size: 12,
        font: normalFont,
      });
      page.drawText(`Date Issued: ${new Date().toLocaleDateString()}`, {
        x: 400,
        y: height - 150,
        size: 12,
        font: normalFont,
      });
      page.drawText(`Due Date: ${dueDate.toLocaleDateString()}`, {
        x: 400,
        y: height - 170,
        size: 12,
        font: normalFont,
      });

      // Bill To
      page.drawText("Bill To:", {
        x: 50,
        y: height - 140,
        size: 12,
        font: boldFont,
      });
      page.drawText(`${shipment.company_name || ""}`, {
        x: 50,
        y: height - 160,
        size: 12,
        font: normalFont,
      });
      page.drawText(`${shipment.contact_person || ""}`, {
        x: 50,
        y: height - 175,
        size: 12,
        font: normalFont,
      });
      page.drawText(`${shipment.contact_number || ""}`, {
        x: 50,
        y: height - 190,
        size: 12,
        font: normalFont,
      });
      page.drawText(`${shipment.email || ""}`, {
        x: 50,
        y: height - 205,
        size: 12,
        font: normalFont,
      });
      page.drawText(`${shipment.address || ""}`.substring(0, 90), {
        x: 50,
        y: height - 220,
        size: 12,
        font: normalFont,
      });

      // Divider line
      page.drawLine({
        start: { x: 50, y: height - 250 },
        end: { x: 545, y: height - 250 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });

      // Shipment Details
      let yPos = height - 270;
      page.drawText("Shipment Details:", {
        x: 50,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      yPos -= 20;

      const shipmentFields = [
        `Tracking #: ${shipment.tracking_number || ""}`,
        `Service: ${shipment.service_type || ""}`,
        `Mode: ${shipment.delivery_mode || ""}`,
        `Origin: ${shipment.port_origin || ""}`,
        `Destination: ${shipment.port_delivery || ""}`,
      ];

      shipmentFields.forEach((line) => {
        page.drawText(line, { x: 50, y: yPos, size: 12, font: normalFont });
        yPos -= 15;
      });

      // =======================================
      // 💰 AMOUNT SECTION (correctly placed)
      // =======================================

      // Add spacing after shipment details
      yPos -= 20;

      // Subtotal
      page.drawText("Subtotal:", {
        x: 380,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      page.drawText(
        `PHP ${amountDue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`,
        { x: 460, y: yPos, size: 12, font: normalFont }
      );
      yPos -= 20;

      // Tax
      page.drawText(`Tax (${taxRate}%):`, {
        x: 380,
        y: yPos,
        size: 12,
        font: boldFont,
      });
      page.drawText(
        `PHP ${taxAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`,
        { x: 460, y: yPos, size: 12, font: normalFont }
      );
      yPos -= 20;

      // Total Due
      page.drawText("Total Due:", {
        x: 380,
        y: yPos,
        size: 13,
        font: boldFont,
      });
      page.drawText(
        `PHP ${totalAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })}`,
        { x: 460, y: yPos, size: 13, font: boldFont }
      );
      yPos -= 40; // space before footer

      // Footer
      page.drawLine({
        start: { x: 50, y: 80 },
        end: { x: 545, y: 80 },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawText("Thank you for your business!", {
        x: 200,
        y: 60,
        size: 12,
        font: normalFont,
      });

      // Save PDF
      const invoicesDir = path.join(__dirname, "invoices");
      if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir);
      const pdfPath = path.join(invoicesDir, `${newInvoiceNumber}.pdf`);
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(pdfPath, pdfBytes);

      // 5️⃣ Save to DB
      const insert = await pool.query(
        `INSERT INTO invoices 
       (shipment_id, client_id, invoice_number, amount_due, tax_rate, tax_amount, total_due, currency, due_date, status, accountant_name, accountant_signature, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PHP', $8, $9, $10, $11, $12) RETURNING *`,
        [
          shipmentId,
          shipment.client_id,
          newInvoiceNumber,
          amountDue,
          taxRate,
          taxAmount,
          totalAmount,
          dueDate,
          "unpaid",
          accountant_name || null,
          accountant_signature || null,
          notes || null,
        ]
      );

      const invoice = insert.rows[0];

      // 6️⃣ Notify Client (in-app)
      await pool.query(
        `INSERT INTO client_notifications (client_id, title, message, type, is_read, created_at)
       VALUES ($1, $2, $3, 'invoice', FALSE, NOW())`,
        [
          shipment.client_id,
          "New Invoice Generated",
          `Invoice ${newInvoiceNumber} has been generated for your shipment #${shipment.tracking_number}.`,
        ]
      );

      // 7️⃣ Send Gmail Notification
      try {
        const mailOptions = {
          from: `"TSL Freight Movers INC." <tslhead@gmail.com>`,
          to: shipment.email,
          subject: `Your Invoice ${newInvoiceNumber} is ready`,
          html: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color:#60adf4;">TSL Freight Movers INC.</h2>
            <p>Dear <strong>${shipment.contact_person}</strong>,</p>
            <p>Your invoice <strong>${newInvoiceNumber}</strong> has been generated for your shipment:</p>

            <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
              <tr><td><strong>Tracking #:</strong></td><td>${
                shipment.tracking_number
              }</td></tr>
              <tr><td><strong>Origin:</strong></td><td>${
                shipment.port_origin
              }</td></tr>
              <tr><td><strong>Destination:</strong></td><td>${
                shipment.port_delivery
              }</td></tr>
              <tr><td><strong>Service Type:</strong></td><td>${
                shipment.service_type
              }</td></tr>
              <tr><td><strong>Delivery Mode:</strong></td><td>${
                shipment.delivery_mode
              }</td></tr>
            </table>

            <hr style="margin: 15px 0;">

            <p><strong>Subtotal:</strong> PHP ${amountDue.toLocaleString(
              undefined,
              { minimumFractionDigits: 2 }
            )}</p>
            <p><strong>Tax (${taxRate}%):</strong> PHP ${taxAmount.toLocaleString(
            undefined,
            { minimumFractionDigits: 2 }
          )}</p>
            <p><strong>Total Due:</strong> <span style="font-size: 16px;">PHP ${totalAmount.toLocaleString(
              undefined,
              { minimumFractionDigits: 2 }
            )}</span></p>
            <p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>

            <p>Thank you for choosing <strong>TSL Freight Movers INC.</strong></p>
            <p style="color: gray; font-size: 12px;">This is an automated email. Please do not reply directly.</p>
          </div>
        `,
          attachments: [
            {
              filename: `${newInvoiceNumber}.pdf`,
              path: path.join(__dirname, "invoices", `${newInvoiceNumber}.pdf`),
            },
          ],
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Invoice email sent to ${shipment.email}`);
      } catch (mailErr) {
        console.error("⚠️ Email sending failed:", mailErr);
      }

      // ✅ Done
      res.json({
        message: "Invoice generated with tax & client notified!",
        invoice,
        pdf_url: `/invoices/${invoice.invoice_number}.pdf`,
      });
    } catch (err) {
      console.error("Invoice Error:", err.stack || err);
      res.status(500).json({ error: err.message });
    }
  }
);

app.put("/api/invoices/:id/pay", checkInvoiceAccess, async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE invoices
      SET status = 'paid',   -- ✅ lowercase
          paid_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(rows[0]); // return updated invoice
  } catch (err) {
    console.error("❌ Error updating invoice:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/invoices/:id/undo
app.delete("/api/invoices/:id/undo", checkInvoiceAccess, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await pool.query(
      "DELETE FROM invoices WHERE id = $1 RETURNING *",
      [id]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json({ message: "Invoice undone successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// ADMIN: Fetch all shipments WITH driver details + GPS fallback
// ============================================================
app.get("/api/admin/shipments", async (req, res) => {
  try {
    const query = `
      SELECT 
        s.id,
        s.tracking_number,
        s.service_type,
        s.delivery_mode,
        s.port_origin AS origin,
        s.port_delivery AS destination,
        s.origin_lat,
        s.origin_lon,
        s.delivery_lat,
        s.delivery_lon,
        s.specific_lat,
        s.specific_lon,
        s.status,
        s.expected_delivery_date,
        s.created_at,
        c.company_name,
        d.id AS driver_id,
        d.first_name AS driver_first_name,
        d.last_name AS driver_last_name,
        d.phone AS driver_phone,
        d.current_lat AS driver_lat,
        d.current_lng AS driver_lng
      FROM shipments s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN drivers d ON s.driver_id = d.id
      ORDER BY s.created_at DESC;
    `;

    const result = await pool.query(query);
    const shipments = result.rows;

    // Fetch destination coordinates if missing
    for (const shipment of shipments) {
      if (!shipment.delivery_lat || !shipment.delivery_lon) {
        // Fetch coordinates using geocoding service (using port_delivery address)
        const coordinates = await validateLocationIQ(shipment.port_delivery);
        if (coordinates) {
          // Update the shipment with new destination coordinates
          await pool.query(
            `
            UPDATE shipments
            SET delivery_lat = $1, delivery_lon = $2
            WHERE id = $3
          `,
            [coordinates.lat, coordinates.lon, shipment.id]
          );

          // Update the shipment object in the response with the new coordinates
          shipment.delivery_lat = coordinates.lat;
          shipment.delivery_lon = coordinates.lon;
        }
      }
    }

    res.json(shipments);
  } catch (err) {
    console.error("❌ Error fetching admin shipments:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// 📡 Broadcast driver GPS to Admin dashboards
// ==========================
function broadcastToAdmins(payload) {
  const json = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

/*// ==============================
// Update shipment status + notify client
// ==============================
async function broadcastUpdate(shipmentId) {
  const data = latestGPSData[shipmentId];
  if (!data) return;

  // 1️⃣ Get tracking_number
  let tn = null;
  try {
    const r = await pool.query(
      `SELECT tracking_number FROM shipments WHERE id = $1`,
      [shipmentId]
    );
    tn = r.rows[0]?.tracking_number || null;
  } catch (err) {
    console.error("❌ Failed to get tracking_number:", err);
  }

  // 2️⃣ Get assigned device
  let deviceId = null;
  try {
    const result = await pool.query(
      `SELECT device_id FROM gps_assignments
       WHERE shipment_id = $1 AND released_at IS NULL
       ORDER BY assigned_at DESC LIMIT 1`,
      [shipmentId]
    );
    deviceId = result.rows[0]?.device_id || null;
  } catch (err) {
    console.error("❌ Error fetching device_id for broadcast:", err);
  }

  // 3️⃣ Final broadcast packet
  const payload = {
    type: "gps_update",
    shipmentId: Number(shipmentId),
    tracking_number: tn, // ⭐ REQUIRED FOR CLIENT
    deviceId: deviceId,
    latitude: data.latitude,
    longitude: data.longitude,
    timestamp: data.timestamp,
  };

  // 4️⃣ Broadcast to all clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
} */

// ==============================
// 🌍 Geocoding Helper (Geoapify)
// ==============================

async function geocodeAddress(address) {
  if (!address) return null;
  const apiKey = "e5e95eba533c4eb69344256d49166905"; // replace with your real key
  const res = await fetch(
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
      address
    )}&apiKey=${apiKey}`
  );
  const data = await res.json();
  const coords = data.features?.[0]?.geometry?.coordinates;
  return coords ? { lon: coords[0], lat: coords[1] } : null;
}

// ===============================
// Middleware for authentication & roles
// ===============================

// Require any logged-in user
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized: Please log in" });
  }
  next();
}

// Generic role-based middleware
function requireRole(allowedRoles = []) {
  return function (req, res, next) {
    if (!req.session.user) {
      return res.status(401).json({ error: "Unauthorized: Please log in" });
    }

    const role = req.session.user.role?.toLowerCase();

    if (!allowedRoles.includes(role)) {
      return res
        .status(403)
        .json({ error: `Forbidden: ${role || "unknown"} not allowed` });
    }

    next();
  };
}

module.exports = { requireLogin, requireRole };

// ===============================
// ACCOUNTING Dashboard Route
// ===============================
app.get(
  "/api/accounting/dashboard",
  requireRole(["accounting", "admin"]), // allow accounting + admin
  async (req, res) => {
    try {
      // 1) KPI totals (count NULL as unpaid)
      const kpiQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_due ELSE 0 END), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN i.status <> 'paid' OR i.status IS NULL THEN i.amount_due ELSE 0 END), 0) AS outstanding_amount,
          COALESCE(SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_count,
          COALESCE(SUM(CASE WHEN i.status <> 'paid' OR i.status IS NULL THEN 1 ELSE 0 END), 0) AS unpaid_count
        FROM invoices i;
      `;
      const kpiRes = await pool.query(kpiQuery);
      const kpi = kpiRes.rows[0];

      // 2) Unpaid invoices
      const unpaidQuery = `
        SELECT i.id, i.invoice_number, i.amount_due, i.due_date, i.created_at,
               COALESCE(i.status, 'unpaid') AS status,
               c.id AS client_id, c.company_name AS client_name,
               s.id AS shipment_id, s.tracking_number
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        LEFT JOIN shipments s ON s.id = i.shipment_id
        WHERE i.status <> 'paid' OR i.status IS NULL
        ORDER BY i.due_date ASC NULLS LAST, i.created_at DESC
        LIMIT 200;
      `;
      const unpaidRes = await pool.query(unpaidQuery);

      // 3) Paid invoices
      const paidQuery = `
        SELECT i.id, i.invoice_number, i.amount_due, i.updated_at, i.created_at,
               COALESCE(i.status, 'paid') AS status,
               c.id AS client_id, c.company_name AS client_name,
               s.id AS shipment_id, s.tracking_number
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        LEFT JOIN shipments s ON s.id = i.shipment_id
        WHERE i.status = 'paid'
        ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC
        LIMIT 200;
      `;
      const paidRes = await pool.query(paidQuery);

      // 4) Monthly revenue (last 12 months, only paid invoices)
      const monthlyQuery = `
        SELECT to_char(date_trunc('month', COALESCE(i.updated_at, i.created_at)), 'YYYY-MM') AS month,
               to_char(date_trunc('month', COALESCE(i.updated_at, i.created_at)), 'Mon YYYY') AS label,
               COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_due ELSE 0 END),0)::numeric::float8 AS total
        FROM invoices i
        WHERE (i.updated_at IS NOT NULL OR i.created_at IS NOT NULL)
          AND i.status = 'paid'
          AND date_trunc('month', COALESCE(i.updated_at, i.created_at)) >= date_trunc('month', CURRENT_DATE) - INTERVAL '11 months'
        GROUP BY 1,2
        ORDER BY 1;
      `;
      const monthlyRes = await pool.query(monthlyQuery);

      // Build continuous 12-month series
      const months = [];
      for (let m = 11; m >= 0; m--) {
        const d = new Date();
        d.setMonth(d.getMonth() - m);
        const label = d.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        });
        const monthKey = `${d.getFullYear()}-${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
        months.push({ monthKey, label });
      }

      const monthlyMap = {};
      monthlyRes.rows.forEach(
        (r) => (monthlyMap[r.month] = Number(r.total || 0))
      );
      const monthlyData = months.map((m) => ({
        month: m.label,
        total: monthlyMap[m.monthKey] || 0,
      }));

      // 5) Client payments summary
      const clientQuery = `
        SELECT c.id AS client_id, c.company_name AS client_name,
               COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount_due ELSE 0 END),0)::numeric::float8 AS total
        FROM clients c
        LEFT JOIN invoices i ON i.client_id = c.id
        GROUP BY c.id, c.company_name
        ORDER BY total DESC
        LIMIT 5;
      `;
      const clientRes = await pool.query(clientQuery);

      // 6) On-Time vs Late Payments
      const paymentStatusQuery = `
        SELECT
          SUM(CASE WHEN i.status = 'paid' AND i.updated_at <= i.due_date THEN 1 ELSE 0 END) AS on_time,
          SUM(CASE WHEN i.status = 'paid' AND i.updated_at > i.due_date THEN 1 ELSE 0 END) AS late
        FROM invoices i;
      `;
      const paymentStatusRes = await pool.query(paymentStatusQuery);
      const paymentStatus = paymentStatusRes.rows[0];

      // ✅ Response payload
      res.json({
        totalRevenue: Number(kpi.total_revenue || 0),
        outstandingAmount: Number(kpi.outstanding_amount || 0),
        paidCount: Number(kpi.paid_count || 0),
        unpaidCount: Number(kpi.unpaid_count || 0),
        unpaidInvoices: unpaidRes.rows,
        paidInvoices: paidRes.rows,
        monthlyRevenue: monthlyData,
        clientPayments: clientRes.rows,
        paymentStatus: {
          onTime: Number(paymentStatus.on_time || 0),
          late: Number(paymentStatus.late || 0),
        },
      });
    } catch (err) {
      console.error("Accounting dashboard error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ===============================
// Ledger Route
// ===============================
app.get(
  "/api/accounting/clients/:clientId/ledger",
  requireRole(["accounting", "admin"]), // allow accounting + admin
  async (req, res) => {
    const { clientId } = req.params;

    try {
      // Client info
      const clientRes = await pool.query(
        `SELECT 
            id, 
            company_name, 
            contact_person AS contact_name, 
            contact_number, 
            email
         FROM clients 
         WHERE id = $1`,
        [clientId]
      );
      if (clientRes.rows.length === 0) {
        return res.status(404).json({ error: "Client not found" });
      }
      const client = clientRes.rows[0];

      // Invoices
      const invoicesRes = await pool.query(
        `
        SELECT i.id, i.invoice_number, i.amount_due, i.status,
               i.created_at, i.due_date, i.updated_at,
               s.tracking_number
        FROM invoices i
        LEFT JOIN shipments s ON s.id = i.shipment_id
        WHERE i.client_id = $1
        ORDER BY i.due_date ASC NULLS LAST, i.created_at DESC
      `,
        [clientId]
      );

      const invoices = invoicesRes.rows;

      // Aging buckets
      const today = new Date();
      let aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

      invoices.forEach((inv) => {
        const dueDate = inv.due_date ? new Date(inv.due_date) : null;
        if (inv.status !== "paid" && dueDate) {
          const diffDays = Math.floor(
            (today - dueDate) / (1000 * 60 * 60 * 24)
          );
          const amount = Number(inv.amount_due || 0);
          if (diffDays <= 0) aging.current += amount;
          else if (diffDays <= 30) aging["1-30"] += amount;
          else if (diffDays <= 60) aging["31-60"] += amount;
          else if (diffDays <= 90) aging["61-90"] += amount;
          else aging["90+"] += amount;
        }
      });

      res.json({ client, aging, invoices });
    } catch (err) {
      console.error("Client ledger error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ===============================
// PUT /api/invoices/:id/approve
// ===============================
app.put("/api/invoices/:id/approve", checkInvoiceAccess, async (req, res) => {
  const { id } = req.params;
  const { accountant_name, accountant_signature, notes } = req.body;

  try {
    const query = `
      UPDATE invoices
      SET accountant_name = $1,
          accountant_signature = $2,
          notes = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      accountant_name || null,
      accountant_signature || null,
      notes || null,
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({
      message: "Invoice updated with accountant signature",
      invoice: rows[0],
    });
  } catch (err) {
    console.error("❌ Error updating invoice:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===============================
// Invoice Payment Action
// ===============================
app.put(
  "/api/invoices/:id/pay",
  requireRole(["accounting", "admin"]), // allow accounting + admin to mark paid
  async (req, res) => {
    const { id } = req.params;
    try {
      const updateRes = await pool.query(
        `UPDATE invoices SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      if (updateRes.rowCount === 0) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      res.json({
        message: "Invoice marked as paid",
        invoice: updateRes.rows[0],
      });
    } catch (err) {
      console.error("Mark invoice paid error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ✅ Get single shipment with client info (for Accounting)
app.get("/api/admin/shipments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const shipmentRes = await pool.query(
      `SELECT s.*, c.company_name, c.contact_person, c.contact_number, c.email, c.address
       FROM shipments s
       JOIN clients c ON s.client_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (shipmentRes.rows.length === 0)
      return res.status(404).json({ error: "Shipment not found" });

    res.json(shipmentRes.rows[0]);
  } catch (err) {
    console.error("Error fetching shipment:", err);
    res.status(500).json({ error: "Server error fetching shipment" });
  }
});

// ======================
// CLIENT INVOICE ROUTES
// ======================

// ---------------------------
// GET /api/client/invoices
// ---------------------------
app.get("/api/client/invoices", async (req, res) => {
  try {
    const user = req.session.user; // Assuming session stores client
    if (!user || user.role !== "client") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientId = user.id; // ✅ use logged-in client ID

    const result = await pool.query(
      `
      SELECT 
        s.id AS shipment_id,
        s.tracking_number,
        s.service_type,
        s.status AS shipment_status,
        i.id AS invoice_id,
        i.invoice_number,
        i.status AS invoice_status,
        i.amount_due,
        i.due_date,
        i.created_at AS date_issued
      FROM shipments s
      LEFT JOIN invoices i ON i.shipment_id = s.id
      WHERE s.client_id = $1
      ORDER BY COALESCE(i.created_at, s.created_at) DESC
    `,
      [clientId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------
// GET /api/client/invoice/:invoiceNumber/pdf
// ---------------------------
app.get("/api/client/invoice/:invoiceNumber/pdf", async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const pdfPath = path.join(__dirname, "invoices", `${invoiceNumber}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).send("PDF not found");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="invoice_${invoiceNumber}.pdf"`
    );
    res.sendFile(pdfPath);
  } catch (err) {
    console.error("Error serving PDF:", err);
    res.status(500).send("Server error");
  }
});

// ---------------------------
// Test invoices folder
// ---------------------------
app.get("/api/test/invoices-dir", (req, res) => {
  const invoicesDir = path.join(__dirname, "invoices");
  const exists = fs.existsSync(invoicesDir);
  const files = exists
    ? fs.readdirSync(invoicesDir).filter((f) => f.endsWith(".pdf"))
    : [];
  res.json({ exists, files });
});

//=====================//
// ACCOUNTING REPORTS  //
//=====================//
// ===========================
// Revenue Trend (All History with 0 months)
// ===========================
app.get(
  "/api/reports/revenue-trend",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      let { filter = "this_month", start, end } = req.query;
      let where = `i.status = 'paid'`;
      let params = [];

      const dateCol = "i.created_at";

      if (filter === "this_month") {
        where += ` AND EXTRACT(MONTH FROM ${dateCol}) = EXTRACT(MONTH FROM CURRENT_DATE)
                   AND EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE)`;
      } else if (filter === "last_month") {
        where += ` AND EXTRACT(MONTH FROM ${dateCol}) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
                   AND EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')`;
      } else if (filter === "this_year") {
        where += ` AND EXTRACT(YEAR FROM ${dateCol}) = EXTRACT(YEAR FROM CURRENT_DATE)`;
      } else if (filter === "custom" && start && end) {
        where += ` AND ${dateCol} BETWEEN $1 AND $2`;
        params.push(start);
        params.push(end);
      }

      const { rows } = await pool.query(
        `
        SELECT 
          TO_CHAR(DATE_TRUNC('month', ${dateCol}), 'YYYY-MM') AS month,
          TO_CHAR(DATE_TRUNC('month', ${dateCol}), 'Mon YYYY') AS label,
          SUM(i.amount_due) AS revenue
        FROM invoices i
        WHERE ${where}
        GROUP BY DATE_TRUNC('month', ${dateCol})
        ORDER BY DATE_TRUNC('month', ${dateCol})
        `,
        params
      );

      res.json(rows);
    } catch (err) {
      console.error("Revenue Trend API error:", err);
      res.status(500).json({ error: "Failed to fetch revenue trend" });
    }
  }
);

// ===========================
// Invoice Status Report
// ===========================
app.get(
  "/api/reports/invoice-status",
  requireRole(["admin", "accounting"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`
      SELECT
        i.invoice_number AS invoice_no,
        c.company_name AS client,
        i.amount_due AS amount,
        i.status,
        i.due_date
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.due_date ASC;
    `);
      res.json(rows);
    } catch (err) {
      console.error("Invoice Status API error: ", err);
      res.status(500).json({ error: "Failed to fetch invoice status" });
    }
  }
);

// ===========================//
// Operational Manager Side  //
// =========================//

// ============================
// APIs for Charts
// ============================

// 2. Operational Manager: Shipment Status
app.get("/api/analytics/operational/shipment-status", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT LOWER(status) AS status, COUNT(*) AS total
      FROM shipments
      GROUP BY LOWER(status)
    `);

    const categories = ["approved", "pending", "completed", "declined"];
    const data = categories.map((cat) => {
      const row = rows.find((r) => r.status === cat);
      return row ? Number(row.total) : 0;
    });

    res.json({
      labels: ["Approved", "Pending", "Completed", "Declined"],
      data,
    });
  } catch (err) {
    console.error("❌ Operational Manager shipment status error:", err);
    res.status(500).json({ error: "Failed to fetch shipment status" });
  }
});

// 📊 Operational Manager: Top 5 Clients by Bookings/Shipments
// 📊 Operational Manager: Top 5 Clients by Bookings
app.get("/api/analytics/operational/top-clients", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.company_name AS name, COUNT(s.id) AS total_bookings
      FROM shipments s
      JOIN clients c ON s.client_id = c.id
      GROUP BY c.company_name
      ORDER BY total_bookings DESC
      LIMIT 5;
    `);

    res.json({
      labels: rows.map((r) => r.name),
      data: rows.map((r) => Number(r.total_bookings)),
    });
  } catch (err) {
    console.error("❌ Error fetching top clients:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch top clients", details: err.message });
  }
});

// 5. On-time vs Late (Pie Chart)
app.get("/api/analytics/on-time-vs-late", async (req, res) => {
  try {
    // ✅ Get month and year from query params (or default to current)
    const { month, year } = req.query;
    const selectedMonth = month ? Number(month) : new Date().getMonth() + 1; // 1–12
    const selectedYear = year ? Number(year) : new Date().getFullYear();

    // ✅ Query: count on-time vs late deliveries for selected month & year
    const { rows } = await pool.query(
      `
      SELECT
        CASE 
          WHEN delivered_at <= expected_delivery_date THEN 'On-time'
          ELSE 'Late'
        END AS category,
        COUNT(*) AS count
      FROM shipments
      WHERE 
        delivered_at IS NOT NULL
        AND EXTRACT(MONTH FROM delivered_at) = $1
        AND EXTRACT(YEAR FROM delivered_at) = $2
      GROUP BY category;
    `,
      [selectedMonth, selectedYear]
    );

    // ✅ Ensure we always return both categories (even if 0)
    const categories = ["On-time", "Late"];
    const data = categories.map((cat) => {
      const row = rows.find((r) => r.category === cat);
      return row ? Number(row.count) : 0;
    });

    res.json({ labels: categories, data });
  } catch (err) {
    console.error("❌ Error fetching on-time vs late analytics:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch on-time vs late analytics" });
  }
});

// 6. Weekly Bookings (Bar Chart)
app.get("/api/analytics/weekly-bookings", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Dy') AS day, COUNT(*) AS total
      FROM shipments
      WHERE created_at >= NOW() - interval '7 days'
      GROUP BY day, EXTRACT(DOW FROM created_at)
      ORDER BY EXTRACT(DOW FROM created_at)
    `);

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const data = days.map((d) => {
      const row = rows.find((r) => r.day === d);
      return row ? Number(row.total) : 0;
    });

    res.json({ labels: days, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch weekly bookings" });
  }
});

app.get("/api/operational/shipments/recent", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        s.tracking_number,
        s.port_origin,
        s.port_delivery,
        s.status,
        s.created_at,
        c.company_name AS client_name
      FROM shipments s
      LEFT JOIN clients c ON s.client_id = c.id
      ORDER BY s.created_at DESC
      LIMIT 5;
    `);

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching recent shipments:", err);
    res.status(500).json({ error: "Failed to fetch recent shipments" });
  }
});

// ==============================//
// Operational Manager REPORTS  //
// ============================//
// ===============================
// 📋 Shipment Status (Reports Page)
// ===============================
app.get("/api/reports/shipment-status", async (req, res) => {
  try {
    const query = `
      SELECT s.tracking_number, c.company_name AS client, s.status, 
      TO_CHAR(s.expected_delivery_date, 'YYYY-MM-DD') AS delivery_date
      FROM shipments s
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.expected_delivery_date DESC;
    `;

    const { rows } = await pool.query(query);

    const result = rows.map((r) => ({
      id: `#${r.tracking_number}`,
      client: r.client || "Unknown Client",
      status: r.status ? r.status.trim() : "Unknown",
      delivery_date: r.delivery_date || "N/A",
    }));

    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching report shipment status:", err);
    res.status(500).json({ error: "Failed to fetch report shipment status" });
  }
});

// ===============================
// 📜 Client Shipment History (Reports Page)
// ===============================
app.get("/api/reports/client-history", async (req, res) => {
  try {
    const client = req.query.client || "Client A";

    const { rows } = await pool.query(
      `
      SELECT s.id, s.created_at::date AS date, s.status, s.port_delivery
      FROM shipments s
      JOIN clients c ON c.id = s.client_id
      WHERE c.company_name = $1
      ORDER BY s.created_at DESC
      LIMIT 10
    `,
      [client]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching report client history:", err);
    res.status(500).json({ error: "Failed to fetch report client history" });
  }
});

// ===============================
// 👥 Get All Clients (Reports Page) - Public
// ===============================
app.get("/api/reports/clients", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT company_name 
      FROM clients 
      ORDER BY company_name ASC
    `);
    res.json(rows); // Example: [{ company_name: "RC" }, { company_name: "Absolute" }]
  } catch (err) {
    console.error("❌ Error fetching clients:", err.message);
    res
      .status(500)
      .json({ error: "Failed to fetch clients", details: err.message });
  }
});

// ===============================
// 📜 Client Shipment History (Reports Page) - Public
// ===============================
app.get("/api/reports/client-history", async (req, res) => {
  try {
    const client = req.query.client; // e.g. ?client=Absolute
    if (!client) {
      return res.status(400).json({ error: "Client name is required" });
    }

    const query = `
      SELECT 
        s.id,
        s.created_at::date AS shipment_date,
        s.status,
        s.port_origin AS origin,
        s.port_delivery AS destination,
        c.company_name
      FROM shipments s
      INNER JOIN clients c ON s.client_id = c.id
      WHERE c.company_name = $1   -- ✅ filter by client name
      ORDER BY s.created_at DESC
      LIMIT 20;
    `;

    const { rows } = await pool.query(query, [client]);
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching report client history:", err.message);
    res.status(500).json({
      error: "Failed to fetch report client history",
      details: err.message,
    });
  }
});

// ================================
// 📂CLIENT NOTIFICATIONS SIDE API
// ================================

// ================================
// 📂 CLIENT NOTIFICATIONS API
// ================================

// -------------------------------
// CLIENT: FETCH NOTIFICATIONS
// -------------------------------
app.get("/api/client/notifications", async (req, res) => {
  try {
    if (!req.session?.client) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientId = req.session.client.id;

    const { rows } = await pool.query(
      `SELECT 
         n.id,
         n.client_id,
         n.title,
         n.message,
         n.type,
         n.is_read,
         n.created_at,
         s.tracking_number
       FROM notifications n
       LEFT JOIN shipments s ON n.shipment_id = s.id
       WHERE n.client_id = $1
       ORDER BY n.created_at DESC`,
      [clientId]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// -------------------------------
// CLIENT: MARK SINGLE AS READ
// -------------------------------
app.put("/api/client/notifications/mark-read/:id", async (req, res) => {
  try {
    if (!req.session?.client) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clientId = req.session.client.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [id, clientId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({
      message: "Notification marked as read",
      notification: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// -------------------------------
// CLIENT: MARK ALL AS READ
// -------------------------------
app.put("/api/client/notifications/mark-all-read", async (req, res) => {
  try {
    if (!req.session?.client) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clientId = req.session.client.id;

    await pool.query(
      `UPDATE notifications SET is_read = true WHERE client_id = $1`,
      [clientId]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("❌ Error marking all as read:", err);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// -------------------------------
// ADMIN: TRIGGERS NOTIFICATIONS
// -------------------------------
app.put("/api/admin/bookings/:bookingId/status", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    let query, values;
    if (status === "Completed") {
      query = `UPDATE shipments SET status=$1, delivered_at=NOW() WHERE id=$2 RETURNING *;`;
      values = [status, bookingId];
    } else {
      query = `UPDATE shipments SET status=$1 WHERE id=$2 RETURNING *;`;
      values = [status, bookingId];
    }

    const { rows } = await pool.query(query, values);
    if (rows.length === 0)
      return res.status(404).json({ error: "Booking not found" });

    const updatedBooking = rows[0];

    // insert notification
    await pool.query(
      `INSERT INTO notifications (client_id, shipment_id, title, message, created_at, is_read, type)
       VALUES ($1, $2, $3, $4, NOW(), false, 'shipment')`,
      [
        updatedBooking.client_id,
        updatedBooking.id,
        "Booking Status Update",
        `Your booking #${updatedBooking.tracking_number} status is now "${status}".`,
      ]
    );

    res.json({ message: "Status updated", booking: updatedBooking });
  } catch (err) {
    console.error("❌ Error updating booking status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

//dinagdag jade

/// ================================
// 📡 TRACCAR GPS ENDPOINT
// ================================
/*app.post("/api/gps", async (req, res) => {
  try {
    const deviceId = (req.body.device_id || req.body.id || "").trim();
    const latitude = req.body?.location?.coords?.latitude;
    const longitude = req.body?.location?.coords?.longitude;
    const speed = req.body?.location?.coords?.speed ?? 0;
    const timestamp = req.body?.location?.timestamp;

    // 🕒 Parse GPS timestamp
    const gpsTime = timestamp ? new Date(timestamp) : new Date();
    const gpsTimeUTC = gpsTime.toISOString();
    const gpsTimeLocal = new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(gpsTime);

    console.log("📡 Incoming GPS (POST):", {
      deviceId,
      latitude,
      longitude,
      speed,
      gpsTimeUTC,
      gpsTimeLocal,
    });

    if (!deviceId || !latitude || !longitude) {
      console.warn("⚠️ Invalid GPS data:", req.body);
      return res.status(400).json({ error: "Invalid GPS data" });
    }

    // 💾 Insert log entry
    await pool.query(
      `INSERT INTO gps_logs (device_id, latitude, longitude, speed, timestamp, recorded_at)
       VALUES ($1, $2, $3, $4, TO_TIMESTAMP(EXTRACT(EPOCH FROM $5::timestamptz)), NOW())`,
      [deviceId, latitude, longitude, speed, gpsTimeUTC]
    );

    // 🧭 Find active shipment
    const result = await pool.query(
      `SELECT shipment_id 
         FROM gps_assignments 
        WHERE device_id = $1 AND released_at IS NULL 
     ORDER BY assigned_at DESC LIMIT 1`,
      [deviceId]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️ Device ${deviceId} not assigned to any shipment`);
      return res.json({ message: "No active shipment to update." });
    }

    const shipmentId = result.rows[0].shipment_id;

    // 🗺️ Update cache + broadcast
    latestGPSData[shipmentId] = {
      latitude,
      longitude,
      speed,
      timestamp: Date.now(),
    };

    await pool.query(
      `UPDATE shipments
   SET specific_lat = $1,
       specific_lon = $2
   WHERE id = $3`,
      [latitude, longitude, shipmentId]
    );

    console.log(
      `🚀 Broadcasting live GPS for Shipment ${shipmentId} (${deviceId})`
    );
    broadcastUpdate(shipmentId);

    res.json({ message: "✅ GPS data recorded and broadcast." });
  } catch (err) {
    console.error("❌ handleGPSUpdate outer error:", err);
    res.status(500).json({ error: "Failed to save GPS data" });
  }
});

// ================================
// 📡 Add AND Assign GPS Device to Shipment admin function
// ================================
app.post("/api/gps/devices", async (req, res) => {
  const { device_id, shipment_id, notes } = req.body;

  console.log("📦 [API] Assign GPS →", { device_id, shipment_id, notes });

  try {
    if (!device_id || !shipment_id) {
      return res
        .status(400)
        .json({ error: "Device ID and Shipment ID are required." });
    }

    const parsedShipmentId = parseInt(shipment_id, 10);
    if (isNaN(parsedShipmentId)) {
      return res
        .status(400)
        .json({ error: "Invalid Shipment ID format (must be numeric)." });
    }

    // 1️⃣ Verify shipment exists
    console.log("🔍 Checking shipment existence...");
    const shipmentCheck = await pool.query(
      `SELECT id FROM shipments WHERE id = $1`,
      [parsedShipmentId]
    );
    if (shipmentCheck.rows.length === 0) {
      console.log("⚠️ Shipment not found:", parsedShipmentId);
      return res.status(404).json({ error: "Shipment not found." });
    }

    // 2️⃣ Check if device has active assignment
    console.log("🔍 Checking existing GPS assignment...");
    const activeAssign = await pool.query(
      `SELECT shipment_id FROM gps_assignments
       WHERE LOWER(device_id::text) = LOWER($1::text) AND released_at IS NULL
       ORDER BY assigned_at DESC LIMIT 1`,
      [device_id]
    );

    if (
      activeAssign.rows.length > 0 &&
      String(activeAssign.rows[0].shipment_id) !== String(parsedShipmentId)
    ) {
      console.log("⚠️ Device already assigned to another shipment.");
      return res.status(400).json({
        error: `Device ${device_id} is already assigned to another shipment.`,
      });
    }

    // 3️⃣ Check if device exists in gps_devices
    console.log("🔍 Checking if GPS device exists...");
    const existingDevice = await pool.query(
      `SELECT id FROM gps_devices WHERE LOWER(device_id::text) = LOWER($1::text)`,
      [device_id]
    );

    if (existingDevice.rows.length > 0) {
      console.log("🟡 Updating existing GPS device...");
      await pool.query(
        `UPDATE gps_devices
         SET shipment_id = $1, notes = $2, assigned_at = NOW()
         WHERE LOWER(device_id::text) = LOWER($3::text)`,
        [parsedShipmentId, notes || null, device_id]
      );
    } else {
      console.log("🟢 Inserting new GPS device...");
      await pool.query(
        `INSERT INTO gps_devices (device_id, shipment_id, notes, assigned_at, created_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [device_id, parsedShipmentId, notes || null]
      );
    }

    // ✅ Sync shipment record
    console.log("🔄 Syncing shipments table...");
    await pool.query(`UPDATE shipments SET device_id = $1 WHERE id = $2`, [
      device_id,
      parsedShipmentId,
    ]);

    // 4️⃣ Add to gps_assignments if not yet active
    if (activeAssign.rows.length === 0) {
      console.log("📌 Creating gps_assignments entry...");
      await pool.query(
        `INSERT INTO gps_assignments (device_id, shipment_id, assigned_at)
         VALUES ($1, $2, NOW())`,
        [device_id, parsedShipmentId]
      );
    }

    // 🆕 Fetch tracking number from shipments table
    const { rows: trackingRows } = await pool.query(
      `SELECT tracking_number FROM shipments WHERE id = $1`,
      [parsedShipmentId]
    );
    const trackingNumber = trackingRows[0]?.tracking_number || parsedShipmentId;

    // ✅ Log and respond using tracking number
    console.log(
      `✅ Device ${device_id} successfully assigned to shipment ${trackingNumber}.`
    );
    res.json({
      message: `✅ Device ${device_id} successfully assigned to shipment ${trackingNumber}.`,
    });
  } catch (err) {
    console.error("❌ Error assigning GPS device:", err);
    res.status(500).json({ error: "Server error assigning GPS device" });
  }
});

// ================================
// ✅ List available GPS devices
// ================================
app.get("/api/gps/devices", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT device_id
      FROM gps_devices
      WHERE shipment_id IS NULL
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No available GPS devices" });
    }

    res.json(result.rows.map((r) => r.device_id));
  } catch (err) {
    console.error("❌ Error fetching GPS devices:", err);
    res.status(500).json({ error: "Failed to fetch GPS devices" });
  }
});

// ========================================
// 📡 GET Assigned GPS device for shipment (Active Only) admin function
// ========================================
app.get("/api/gps/assigned/:shipmentId", async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const parsedId = parseInt(shipmentId, 10);

    if (isNaN(parsedId)) {
      return res.status(400).json({ error: "Invalid shipment ID format." });
    }

    // 🔍 Find the active (not released) GPS assignment
    const { rows } = await pool.query(
      `SELECT ga.device_id, gd.notes, ga.assigned_at
       FROM gps_assignments ga
       LEFT JOIN gps_devices gd 
         ON LOWER(ga.device_id::text) = LOWER(gd.device_id::text)
       WHERE ga.shipment_id = $1
         AND ga.released_at IS NULL   -- ✅ Only active assignments
       ORDER BY ga.assigned_at DESC
       LIMIT 1`,
      [parsedId]
    );

    if (rows.length === 0) {
      // ✅ Return success (200) but empty info to avoid frontend 404
      return res.status(200).json({
        device_id: null,
        notes: null,
        assigned_at: null,
        message: "No GPS device assigned.",
      });
    }

    res.json(rows[0]); // ✅ Return active assignment only
  } catch (err) {
    console.error("❌ Error fetching assigned GPS device:", err);
    res.status(500).json({ error: "Server error fetching GPS assignment." });
  }
});

// ================================
// 📡 Get GPS history for shipment
// ================================
// ================================
// 🛰️ Get GPS History by Shipment ID
// ================================
app.get("/api/gps/history/:shipmentId", async (req, res) => {
  const { shipmentId } = req.params;

  try {
    // Only fetch active GPS assignment (not released)
    const assignmentRes = await pool.query(
      `
      SELECT device_id
      FROM gps_assignments
      WHERE shipment_id = $1
        AND released_at IS NULL
      `,
      [shipmentId]
    );

    // If no active assignment found
    if (assignmentRes.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No active GPS device assigned to this shipment" });
    }

    const deviceId = assignmentRes.rows[0].device_id;

    // Fetch GPS logs for the device
    const historyRes = await pool.query(
      `
      SELECT latitude, longitude, recorded_at
      FROM gps_logs
      WHERE LOWER(device_id) = LOWER($1)
      ORDER BY recorded_at DESC
      LIMIT 100
      `,
      [deviceId]
    );

    res.json(historyRes.rows);
  } catch (err) {
    console.error("❌ Error fetching GPS history:", err);
    res.status(500).json({ error: "Server error" });
  }
});*/

// =====================================
// 📦 Get shipments for logged-in client
// =====================================
// 📦 Get shipments for logged-in client
app.get("/api/client/shipments", async (req, res) => {
  try {
    console.log("🔍 Shipment route session:", req.session);

    const clientId = req.session?.user?.id;
    if (!clientId) {
      console.log("❌ No session.user found! Returning 401.");
      return res.status(401).json({ error: "Not authorized" });
    }

    const result = await pool.query(
      `
      SELECT 
        s.id,
        s.tracking_number,
        s.port_origin AS origin,
        s.port_delivery AS destination,
        s.status,
        s.created_at,

        -- GPS from DRIVER TABLE
        d.current_lat AS latitude,
        d.current_lng AS longitude,
        d.gps_update_at AS updated_at

      FROM shipments s
      LEFT JOIN drivers d ON s.driver_id = d.id
      WHERE s.client_id = $1
      ORDER BY s.created_at DESC
      `,
      [clientId]
    );

    console.log(
      `✅ Found ${result.rows.length} shipments for client ${clientId}`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching client shipments:", err);
    res.status(500).json({ error: "Server error fetching shipments" });
  }
});

// ================================
// 🔴 Unassign GPS Device admin function
// ================================
/*app.put("/api/gps/unassign/:device_id", async (req, res) => {
  const { device_id } = req.params;

  try {
    if (!device_id)
      return res.status(400).json({ error: "Device ID is required." });

    // 1️⃣ Remove assignment from gps_devices
    await pool.query(
      `UPDATE gps_devices
       SET shipment_id = NULL, assigned_at = NULL
       WHERE LOWER(device_id) = LOWER($1)`,
      [device_id]
    );

    // 2️⃣ Mark gps_assignments as released
    await pool.query(
      `UPDATE gps_assignments
       SET released_at = NOW()
       WHERE LOWER(device_id) = LOWER($1) AND released_at IS NULL`,
      [device_id]
    );

    // 3️⃣ Clear the linked shipment record (device_id column)
    await pool.query(
      `UPDATE shipments
       SET device_id = NULL
       WHERE LOWER(device_id) = LOWER($1)`,
      [device_id]
    );

    console.log(`✅ Device ${device_id} fully unassigned (shipments synced)`);
    res.json({ message: `✅ Device ${device_id} unassigned successfully.` });
  } catch (err) {
    console.error("❌ Error unassigning GPS device:", err);
    res.status(500).json({ error: "Failed to unassign GPS device" });
  }
});
*/

// ============================
// Landing Page Content API
// ============================

// Fetch all landing page sections
app.get("/api/landing-content", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT section_key, content FROM landing_page_content"
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching landing page content:", err);
    res.status(500).json({ error: "Failed to fetch landing page content" });
  }
});

// Create or update a specific section
app.post("/api/landing-content/update", async (req, res) => {
  try {
    const { section_key, content } = req.body;

    // Basic validation
    if (!section_key || typeof content !== "string") {
      return res
        .status(400)
        .json({ error: "Both section_key and content are required." });
    }

    await pool.query(
      `
        INSERT INTO landing_page_content (section_key, content)
        VALUES ($1, $2)
        ON CONFLICT (section_key)
        DO UPDATE SET content = EXCLUDED.content;
      `,
      [section_key, content]
    );

    res
      .status(200)
      .json({ success: true, message: "Content updated successfully." });
  } catch (err) {
    console.error("❌ Error updating landing page content:", err);
    res.status(500).json({ error: "Failed to update landing page content" });
  }
});

//===========================//
//    Driver API            //
//=========================//

app.get("/api/map/route", async (req, res) => {
  try {
    const { originLat, originLng, destLat, destLng } = req.query;

    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({ error: "Missing coordinates" });
    }

    const orsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_API_KEY}&start=${originLng},${originLat}&end=${destLng},${destLat}`;

    const orsRes = await fetch(orsUrl);
    const json = await orsRes.json();

    res.json(json); // send back to frontend securely
  } catch (err) {
    console.error("ORS Route Error:", err);
    res.status(500).json({ error: "Unable to fetch route" });
  }
});

// POST /api/admin/drivers
//Create driver (admin only)
app.post("/api/admin/drivers", async (req, res) => {
  try {
    const { first_name, last_name, email, phone } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({
        error: "First name, last name, and email are required.",
      });
    }

    // Auto-generate password
    const rawPassword = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(rawPassword, 10);

    const query = `
      INSERT INTO drivers (
        first_name,
        last_name,
        email,
        phone,
        password,
        status,
        work_status,
        failed_attempts,
        lockout_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, first_name, last_name, email, phone, status, created_at;
    `;

    const values = [
      first_name,
      last_name,
      email,
      phone || null,
      hash,
      "active",
      "available",
      0,
      null,
    ];

    console.log("Saving driver to DB...");
    const { rows } = await pool.query(query, values);

    console.log("DB save successful. Now sending email...");

    const emailSent = await sendDriverAccountEmail({
      to: email,
      email: email,
      password: rawPassword,
    });

    console.log("Email sent?", emailSent);

    res.status(201).json({
      ...rows[0],
      temp_password_sent: emailSent,
    });
  } catch (err) {
    console.error("Error creating driver:", err);
    res.status(500).json({ error: "Failed to create driver." });
  }
});

//==============================//
// Send Driver Account Email    //
//==============================//
async function sendDriverAccountEmail({ to, email, password }) {
  try {
    // Debug logs to verify ENV is loaded
    console.log("DRIVER_EMAIL_USER:", process.env.EMAIL_USER);
    console.log(
      "DRIVER_EMAIL_PASS loaded?",
      process.env.EMAIL_PASS ? "YES" : "NO"
    );

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: "gmail", // SAME as your working mailer
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // MUST be app password WITHOUT SPACES
      },
    });

    // Email content
    const mailOptions = {
      from: `"TSL Freight Movers Inc." <${process.env.EMAIL_USER}>`,
      to,
      subject: "Your Driver Account Login Credentials",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #0077b6;">Welcome to TSL Freight Movers</h2>

          <p>Your driver account has been successfully created.</p>

          <p><b>Login Email:</b> ${email}</p>
          <p><b>Temporary Password:</b> ${password}</p>

          <p>
            For security, please log in immediately and change this password.
            Do not share it with anyone.
          </p>

          <p style="margin-top: 20px;">
            Regards,<br>
            <strong>TSL Freight Movers Inc.</strong>
          </p>
        </div>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Driver email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("FULL DRIVER EMAIL ERROR:", err);
    return false;
  }
}

// ======================================
// LIST ALL DRIVERS
// GET /api/admin/drivers admin side
// ======================================

app.get("/api/admin/drivers", async (req, res) => {
  try {
    const sql = `
  SELECT
  d.id,
  CONCAT_WS(' ', d.first_name, d.last_name) AS full_name,
  d.email,
  d.phone,
  d.driver_status AS account_status,
  d.work_status,
  d.created_at,

  COALESCE((
    SELECT COUNT(*)
    FROM shipments s
    WHERE s.driver_id = d.id
  ), 0) AS total_shipments,

   CASE
    WHEN EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.driver_id = d.id
        AND s.status <> 'Delivered'
    )
    THEN 'In Transit'

    WHEN d.work_status = 'off-duty'
    THEN 'Off-Duty'

    ELSE 'Available'
  END AS availability_status,

  (
    SELECT s.tracking_number
    FROM shipments s
    WHERE s.driver_id = d.id
    AND s.status <> 'Delivered'
    ORDER BY s.id DESC
    LIMIT 1
  ) AS current_tracking_number

FROM drivers d
ORDER BY d.created_at DESC;
    `;

    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching drivers:", err);
    res.status(500).json({ error: "Failed to fetch drivers." });
  }
});

// =================================================
// ADMIN: UPDATE DRIVER WORK STATUS
// PATCH /api/admin/drivers/:id/work-status
// BODY: { work_status: "available" | "off-duty" }
// =================================================

app.patch("/api/admin/drivers/:id/work-status", async (req, res) => {
  try {
    const { id } = req.params;
    const { work_status } = req.body;

    const allowed = ["available", "off-duty"];
    if (!allowed.includes(work_status)) {
      return res.status(400).json({ error: "Invalid work_status value." });
    }

    const sql = `
      UPDATE drivers
      SET work_status = $1
      WHERE id = $2
      RETURNING id, full_name, email, phone, status AS account_status, work_status, created_at;
    `;

    const { rows } = await pool.query(sql, [work_status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Driver not found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating driver work status:", err);
    res.status(500).json({ error: "Failed to update work status." });
  }
});

// ====================================
//  UPDATE DRIVER DETAILS
// PUT /api/admin/drivers/:id admin side
// ====================================

app.put("/api/admin/drivers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, full_name, email, phone } = req.body;

    // If only full_name provided, split into first/last
    let fn = first_name;
    let ln = last_name;
    if ((!fn || !ln) && full_name) {
      const parts = full_name.trim().split(/\s+/);
      fn = fn || parts.shift();
      ln = ln || (parts.length ? parts.join(" ") : null);
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (fn) {
      fields.push(`first_name = $${idx++}`);
      values.push(fn.trim());
    }
    if (ln !== undefined) {
      fields.push(`last_name = $${idx++}`);
      values.push(ln ? ln.trim() : null);
    }
    if (email) {
      fields.push(`email = $${idx++}`);
      values.push(email.trim());
    }
    if (phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(phone === "" ? null : phone);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields provided to update." });
    }

    values.push(id);
    const sql = `
      UPDATE drivers
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id,
                CONCAT_WS(' ', first_name, last_name) AS full_name, -- return combined name
                email,
                phone,
                status AS account_status,
                work_status,
                created_at;
    `;

    const { rows } = await pool.query(sql, values);
    if (rows.length === 0)
      return res.status(404).json({ error: "Driver not found." });

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating driver:", err);
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "A driver with this email already exists." });
    }
    res.status(500).json({ error: "Failed to update driver." });
  }
});

//Admin: assign driver to shipment
//When admin chooses a driver for a shipment:
// PATCH /api/admin/shipments/:shipmentId/assign-driver
app.patch(
  "/api/admin/shipments/:shipmentId/assign-driver",
  async (req, res) => {
    try {
      const { shipmentId } = req.params;
      const { driver_id } = req.body;

      if (!shipmentId || !driver_id) {
        return res
          .status(400)
          .json({ error: "Shipment ID and Driver ID required" });
      }

      // ============================================
      // 1️⃣ CHECK IF DRIVER EXISTS & NOT ARCHIVED
      // ============================================
      const driverCheck = await pool.query(
        `SELECT driver_status FROM drivers WHERE id = $1`,
        [driver_id]
      );

      if (!driverCheck.rows.length) {
        return res.status(404).json({ message: "Driver not found" });
      }

      if (driverCheck.rows[0].driver_status === "archived") {
        return res.status(400).json({
          message: "Driver is archived and cannot be assigned",
        });
      }

      // ============================================
      // 2️⃣ CHECK IF SHIPMENT IS ALREADY ASSIGNED
      // ============================================
      const existing = await pool.query(
        `SELECT driver_id FROM shipments WHERE id = $1`,
        [shipmentId]
      );

      if (existing.rows.length > 0 && existing.rows[0].driver_id) {
        return res.status(400).json({
          error: `Shipment already assigned to driver ${existing.rows[0].driver_id}. Unassign first.`,
        });
      }

      // ============================================
      // 3️⃣ ASSIGN DRIVER
      // ============================================
      const result = await pool.query(
        `UPDATE shipments 
         SET driver_id = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [driver_id, shipmentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      res.json({
        message: "Driver assigned successfully",
        shipment: result.rows[0],
      });
    } catch (err) {
      console.error("Assign driver error:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// POST /api/driver/login
app.post("/api/driver/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, password, status
       FROM drivers
       WHERE LOWER(email) = LOWER($1)`, // case-insensitive
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const driver = rows[0];

    if (driver.status !== "active") {
      return res.status(403).json({ error: "Driver account is not active." });
    }

    const match = await bcrypt.compare(password, driver.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Set session for driver
    req.session.driverId = driver.id;

    const fullName = `${driver.first_name || ""} ${
      driver.last_name || ""
    }`.trim();

    res.json({
      id: driver.id,
      first_name: driver.first_name,
      last_name: driver.last_name,
      full_name: fullName,
      email: driver.email,
    });
  } catch (err) {
    console.error("Driver login error:", err);
    res.status(500).json({ error: "Login failed." });
  }
});

// ======================================
// admin side GET ACTIVE & AVAILABLE DRIVERS
// GET /api/admin/drivers/active
// ======================================
app.get("/api/admin/drivers/active", async (req, res) => {
  try {
    const sql = `
      SELECT
        d.id,
        d.first_name,
        d.last_name,
        d.phone,
        d.email,
        d.driver_status,
        d.work_status
      FROM drivers d
      WHERE d.driver_status = 'active'
        AND d.work_status = 'available'
      ORDER BY d.first_name ASC;
    `;

    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching active drivers:", err);
    res.status(500).json({ error: "Failed to load active drivers." });
  }
});

//=====================================//
//Driver Account Creation (admin side)//
//===================================//

// Driver: get assigned active shipments
app.get("/api/driver/shipments/active", requireDriverAuth, async (req, res) => {
  try {
    const driverId = req.driverId;

    const { rows } = await pool.query(
      `SELECT 
         id,
         tracking_number,
         port_origin,
         port_delivery,
         status,
         origin_lat,
         origin_lon,
         delivery_lat,
         delivery_lon,
         created_at
       FROM shipments
       WHERE driver_id = $1
         AND LOWER(status) NOT IN ('delivered', 'completed')
       ORDER BY created_at DESC`,
      [driverId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Active shipments error:", err);
    res.status(500).json({ error: "Failed to load shipments" });
  }
});

// Completed shipments (history, optional)
// GET /api/driver/shipments/completed
// Completed shipments (history)
app.get(
  "/api/driver/shipments/completed",
  requireDriverAuth,
  async (req, res) => {
    try {
      const driverId = req.driverId;

      const { rows } = await pool.query(
        `SELECT 
        id,
        tracking_number,
        port_origin,
        port_delivery,
        status,
        delivered_at
       FROM shipments
       WHERE driver_id = $1
         AND LOWER(status) IN ('delivered', 'completed')
       ORDER BY delivered_at DESC`,
        [driverId]
      );

      res.json(rows);
    } catch (err) {
      console.error("Completed shipments error:", err);
      res.status(500).json({ error: "Failed to load completed shipments" });
    }
  }
);

// Driver: update delivery status
// PATCH /api/driver/shipments/:id/status
// ===========================================================
// DRIVER UPDATES SHIPMENT STATUS + SEND EMAIL NOTIFICATIONS
// ===========================================================
app.patch(
  "/api/driver/shipments/:id/status",
  requireDriverAuth,
  async (req, res) => {
    console.log("\n===========================");
    console.log("🚚 DRIVER STATUS UPDATE");
    console.log("===========================\n");

    try {
      const driverId = req.driverId;
      const shipmentId = req.params.id;
      const { status } = req.body;

      console.log("Driver:", driverId);
      console.log("Shipment:", shipmentId);
      console.log("New Status:", status);

      const allowedStatuses = ["Shipping", "In Transit", "Delivered"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value." });
      }

      // =======================
      // 1️⃣ FETCH SHIPMENT
      // =======================
      const check = await pool.query(
        `SELECT s.*, 
                c.company_name, 
                c.contact_person, 
                c.email AS client_email
         FROM shipments s
         LEFT JOIN clients c ON s.client_id = c.id
         WHERE s.id = $1`,
        [shipmentId]
      );

      if (!check.rows.length)
        return res.status(404).json({ error: "Shipment not found." });

      const shipment = check.rows[0];

      if (String(shipment.driver_id) !== String(driverId)) {
        return res
          .status(403)
          .json({ error: "Not authorized for this shipment." });
      }

      // =======================
      // 2️⃣ FETCH DRIVER NAME
      // =======================
      const driverRes = await pool.query(
        `SELECT first_name, last_name FROM drivers WHERE id = $1`,
        [driverId]
      );

      const driver = driverRes.rows[0];
      const driverFullName = driver
        ? `${driver.first_name} ${driver.last_name}`
        : "Assigned Driver";

      // =======================
      // 3️⃣ UPDATE STATUS
      // =======================
      let updateSQL, params;

      if (status !== "Delivered") {
        updateSQL = `
          UPDATE shipments
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *`;
        params = [status, shipmentId];
      } else {
        updateSQL = `
          UPDATE shipments
          SET status = 'Delivered',
              delivered_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
          RETURNING *`;
        params = [shipmentId];

        // Free driver after delivery
        await pool.query(
          `UPDATE drivers SET work_status = 'available' WHERE id = $1`,
          [driverId]
        );
      }

      const updatedRes = await pool.query(updateSQL, params);
      const updatedShipment = updatedRes.rows[0];

      // =======================
      // 4️⃣ EMAIL TEMPLATES
      // =======================
      const clientName =
        shipment.contact_person ||
        shipment.company_name ||
        "Client";

      const tn = shipment.tracking_number || shipment.id;

      let subject = "";
      let msg = "";

      if (status === "Shipping") {
        subject = "Your Shipment Is Now Shipping";
        msg = `
          <p>Your shipment <strong>#${tn}</strong> is now being processed by our logistics team.</p>
        `;
      }

      if (status === "In Transit") {
        subject = "Your Shipment Is Now In Transit";
        msg = `
          <p>Your shipment <strong>#${tn}</strong> is now on the way.</p>
          <p>You may check your dashboard for live tracking updates.</p>
        `;
      }

      if (status === "Delivered") {
        subject = "Your Shipment Has Been Delivered";
        msg = `
          <p>Your shipment <strong>#${tn}</strong> has been successfully delivered.</p>
          <p>Delivered At: ${updatedShipment.delivered_at}</p>
        `;
      }

      // =======================
      // 5️⃣ EMAIL HTML TEMPLATE
      // =======================
      const buildEmailHTML = (title, body, shipment) => {
        return `
          <div style="font-family:Arial; padding:20px;">
            <h2 style="color:#0077b6">${title}</h2>

            <p>Dear ${clientName},</p>
            ${body}

            <h3 style="margin-top:25px;">Shipment Details</h3>
            <table style="line-height:1.6;">
              <tr><td><strong>Tracking #:</strong></td><td>${tn}</td></tr>
              <tr><td><strong>Status:</strong></td><td>${shipment.status}</td></tr>
              <tr><td><strong>Service Type:</strong></td><td>${shipment.service_type}</td></tr>
              <tr><td><strong>Shipment Type:</strong></td><td>${shipment.shipment_type}</td></tr>
              <tr><td><strong>Delivery Mode:</strong></td><td>${shipment.delivery_mode}</td></tr>
              <tr><td><strong>Origin:</strong></td><td>${shipment.port_origin}</td></tr>
              <tr><td><strong>Destination:</strong></td><td>${shipment.port_delivery}</td></tr>
              <tr><td><strong>Driver Assigned:</strong></td><td>${driverFullName}</td></tr>
            </table>

            <br/>
            <p>Thank you for choosing <strong>TSL Freight Movers</strong>.</p>
          </div>
        `;
      };

      const emailHTML = buildEmailHTML(subject, msg, updatedShipment);

      // =======================
      // 6️⃣ SEND EMAILS
      // =======================
      const adminEmail = process.env.EMAIL_USER;
      const clientEmail = shipment.client_email;

      if (clientEmail) {
        transporter.sendMail({
          from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
          to: clientEmail,
          subject,
          html: emailHTML,
        });
      }

      if (adminEmail) {
        transporter.sendMail({
          from: `"TSL Freight Movers" <${process.env.EMAIL_USER}>`,
          to: adminEmail,
          subject: `[ADMIN COPY] ${subject}`,
          html: emailHTML,
        });
      }

      // =======================
      // 7️⃣ IN-APP NOTIFICATION
      // =======================
      if (shipment.client_id) {
        await pool.query(
          `INSERT INTO client_notifications 
            (client_id, shipment_id, title, message, type, is_read, created_at)
           VALUES ($1,$2,$3,$4,'status',FALSE,NOW())`,
          [shipment.client_id, shipmentId, subject, msg]
        );
      }

      // =======================
      // 8️⃣ RESPONSE
      // =======================
      res.json({
        success: true,
        message: `Shipment marked as ${status}`,
        shipment: updatedShipment,
      });
    } catch (err) {
      console.error("❌ Driver status update error:", err);
      return res.status(500).json({ error: "Failed to update status" });
    }
  }
);

//===========================//
//    Driver profile API    //
//                         //
app.get("/api/driver/profile", requireDriverAuth, async (req, res) => {
  try {
    const driverId = req.driverId;

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone, work_status
       FROM drivers
       WHERE id = $1`,
      [driverId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const d = rows[0];

    res.json({
      id: d.id,
      full_name: `${d.first_name} ${d.last_name}`,
      email: d.email,
      phone: d.phone,
      work_status: d.work_status,
    });
  } catch (err) {
    console.error("Driver profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.patch("/api/driver/profile", requireDriverAuth, async (req, res) => {
  try {
    const driverId = req.driverId || req.session?.user?.id;
    const { email, phone, first_name, last_name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const sql = `
      UPDATE drivers
      SET email = $1,
          phone = $2,
          first_name = $3,
          last_name = $4
      WHERE id = $5
      RETURNING id, email, phone, first_name, last_name
    `;

    const { rows } = await pool.query(sql, [
      email,
      phone || null,
      first_name || null,
      last_name || null,
      driverId,
    ]);

    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error("Driver profile update error:", err);
    res.status(500).json({ error: "Failed to update driver profile" });
  }
});

app.patch("/api/driver/password", requireDriverAuth, async (req, res) => {
  try {
    const driverId = req.driverId || req.session?.user?.id;
    const { oldPass, newPass } = req.body;

    if (!oldPass || !newPass) {
      return res.status(400).json({ error: "Both passwords are required." });
    }

    const sql = `SELECT password FROM drivers WHERE id = $1 LIMIT 1`;
    const { rows } = await pool.query(sql, [driverId]);

    if (!rows.length) {
      return res.status(404).json({ error: "Driver not found." });
    }

    // Compare old password
    const match = await bcrypt.compare(oldPass, rows[0].password);
    if (!match) {
      return res.status(400).json({ error: "Incorrect current password." });
    }

    const hashed = await bcrypt.hash(newPass, 10);

    await pool.query(`UPDATE drivers SET password = $1 WHERE id = $2`, [
      hashed,
      driverId,
    ]);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ error: "Failed to update password." });
  }
});

//====================//
//fetch gps coordinates//
//===================//

function sendLocationToServer(lat, lng) {
  fetch(
    "https://cargosmarttsl-5.onrender.com/api/gps/update-phone-location",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
      }),
    }
  ).catch((err) => console.error("Failed to send:", err));
}

//=============
// endpoint  //
//==========//

// ========================
// LOGOUT ENDPOINT
// ========================
app.post("/api/logout", (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Session destruction error:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }

      // ✅ Clear session cookie
      res.clearCookie("connect.sid", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });

      console.log("✅ User logged out successfully");
      res.status(200).json({ message: "Logged out successfully" });
    });
  } catch (err) {
    console.error("❌ Logout error:", err);
    res.status(500).json({ error: "Server error during logout" });
  }
});

// ===============================
// DRIVER GPS LOCATION UPDATE (Official - FIXED)
// ===============================
app.post("/api/driver/location", requireDriverAuth, async (req, res) => {
  try {
    const driverId = req.driverId;
    const { lat, lng } = req.body;

    // Validate latitude and longitude values
    if (!lat || !lng || !isFinite(lat) || !isFinite(lng)) {
      return res
        .status(400)
        .json({ error: "Valid latitude and longitude are required." });
    }

    // Ensure latitude is within valid range (-90 to 90)
    if (lat < -90 || lat > 90) {
      return res
        .status(400)
        .json({ error: "Latitude must be between -90 and 90." });
    }

    // Ensure longitude is within valid range (-180 to 180)
    if (lng < -180 || lng > 180) {
      return res
        .status(400)
        .json({ error: "Longitude must be between -180 and 180." });
    }

    // Save the current GPS coordinates in the database (drivers table)
    await pool.query(
      `UPDATE drivers
         SET current_lat = $1,
             current_lng = $2,
             gps_update_at = NOW()
         WHERE id = $3`,
      [lat, lng, driverId]
    );

    // Broadcast live GPS to admins via WebSocket
    broadcastToAdmins({
      type: "driver_gps",
      driverId,
      latitude: Number(lat),
      longitude: Number(lng),
      timestamp: Date.now(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Driver GPS error:", err);
    res.status(500).json({ error: "Failed to update GPS." });
  }
});

//admin

// =====================================================
// CLIENT: GET LATEST GPS OF A SHIPMENT
// GET /api/client/shipments/:trackingNumber/gps
// =====================================================
app.get("/api/client/shipments/:trackingNumber/gps", async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const sql = `
      SELECT 
        s.tracking_number,
        s.id AS shipment_id,
        d.id AS driver_id,
        d.current_lat AS latitude,
        d.current_lng AS longitude,
        d.gps_update_at AS timestamp
      FROM shipments s
      LEFT JOIN drivers d ON s.driver_id = d.id
      WHERE s.tracking_number = $1
      LIMIT 1
    `;

    const { rows } = await pool.query(sql, [trackingNumber]);

    if (!rows.length) {
      return res.status(404).json({ error: "Shipment not found or no GPS." });
    }

    res.json({
      tracking_number: rows[0].tracking_number,
      latitude: rows[0].latitude,
      longitude: rows[0].longitude,
      timestamp: rows[0].timestamp,
    });
  } catch (err) {
    console.error("CLIENT GPS FETCH ERROR:", err);
    res.status(500).json({ error: "Failed to load GPS." });
  }
});

// ======================================
// ADMIN: UPDATE SHIPMENT STATUS
// PUT /api/admin/shipments/:id/status
// ======================================
app.put("/api/admin/shipments/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["Approved", "Shipping", "In Transit", "Delivered"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    const sql = `
      UPDATE shipments
      SET status = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;

    const { rows } = await pool.query(sql, [status, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Shipment not found." });
    }

    return res.json({
      success: true,
      message: `Shipment updated to ${status}`,
      shipment: rows[0],
    });
  } catch (err) {
    console.error("Admin status update error:", err);
    res.status(500).json({ error: "Failed to update shipment status." });
  }
});

// =========================
// ARCHIVE / UNARCHIVE DRIVER
// =========================

// PUT /api/admin/drivers/:id/archive
app.put("/api/admin/drivers/:id/archive", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE drivers
       SET driver_status = 'archived'
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Driver not found" });
    }

    res.json({ message: "Driver archived successfully" });
  } catch (error) {
    console.error("Archive driver error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/admin/drivers/:id/unarchive", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE drivers
       SET driver_status = 'active'
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Driver not found" });
    }

    res.json({ message: "Driver unarchived successfully" });
  } catch (error) {
    console.error("Unarchive driver error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================
// START SERVER
// ======================
server.listen(PORT, () => {
  console.log(`🚀 HTTP server running at http://localhost:${PORT}`);
  console.log(`🔄 WebSocket server running at ws://localhost:${PORT}`);
});
