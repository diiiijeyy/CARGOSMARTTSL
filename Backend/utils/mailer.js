const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify(err => {
  if (err) console.error("❌ Mail transporter error:", err);
  else console.log("✅ Mail transporter ready");
});

async function sendEmail({ to, subject, html, attachments = [] }) {
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

module.exports = { sendEmail };