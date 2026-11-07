const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/send", async (req, res) => {
  const { recipients, subject, message } = req.body || {};

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ message: "No recipients selected." });
  }
  if (recipients.length > 200) {
    return res.status(400).json({ message: "Too many recipients (max 200)." });
  }
  if (!subject || !String(subject).trim() || !message || !String(message).trim()) {
    return res.status(400).json({ message: "Subject and message are required." });
  }

  const valid = recipients.filter((r) => r && EMAIL_PATTERN.test(String(r.email)));
  if (valid.length === 0) {
    return res.status(400).json({ message: "No valid email addresses." });
  }

  // One separate email per person: nobody sees the other addresses.
  const results = await Promise.allSettled(
    valid.map((r) =>
      transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: r.email,
        subject: String(subject).trim().slice(0, 150),
        text: `Hello ${r.name || ""},\n\n${String(message).trim()}`,
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent + (recipients.length - valid.length);

  if (sent === 0) {
    console.error("Email error:", results[0].reason);
    return res.status(502).json({ message: "The mail server refused the message. Check the SMTP settings." });
  }

  res.json({ sent, failed });
});

module.exports = router;
