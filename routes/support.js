const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");

// ✅ Support Request - Send Email to Debatify Support
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Configure the transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,    // Use environment variables for security
        pass: process.env.EMAIL_PASS,
      },
    });

    // ✅ Send email to support
    await transporter.sendMail({
      from: `"${name}" <${email}>`,
      to: "support@debatify.com",
      subject: `Support Request from ${name}`,
      text: message,
    });

    res.status(200).json({ message: "Support request sent successfully" });
  } catch (error) {
    console.error("Error sending support request:", error);
    res.status(500).json({ message: "Failed to send support request" });
  }
});

module.exports = router;
