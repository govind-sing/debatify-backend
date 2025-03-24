const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Otp = require("../models/Otp");
const nodemailer = require("nodemailer");

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// User Signup
router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const emailLower = email.toLowerCase();
    const existingUser = await User.findOne({ $or: [{ email: emailLower }, { username }] });
    if (existingUser) return res.status(400).json({ message: "Username or email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email: emailLower,
      password: hashedPassword,
      isVerified: false,
    });
    await newUser.save();

    await Otp.deleteMany({ email: emailLower });
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = new Otp({
      email: emailLower,
      otp: otpCode,
      expireAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: emailLower,
      subject: "Verify Your Email",
      text: `Your verification OTP is ${otpCode}. It expires in 10 minutes.`,
    });

    res.status(201).json({ message: "Signup successful. OTP sent to email for verification." });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// User Login
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });
    if (!user) return res.status(400).json({ message: "Invalid email/username or password" });

    if (!user.isVerified) return res.status(401).json({ message: "Please verify your email first" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email/username or password" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
      message: `Welcome back, ${user.username}`,
      token,
      userId: user._id,
      username: user.username,
      email: user.email,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Email Verification
router.post("/verify-email", async (req, res) => {
  const { email, otp } = req.body;
  const emailLower = email.toLowerCase();
  try {
    const validOtp = await Otp.findOne({ email: emailLower, otp });
    if (!validOtp || validOtp.expireAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    await User.findOneAndUpdate({ email: emailLower }, { isVerified: true });
    await Otp.deleteMany({ email: emailLower });

    res.status(200).json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Request Verification OTP
router.post("/request-verification-otp", async (req, res) => {
  const { identifier } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Email already verified" });

    const emailLower = user.email.toLowerCase();
    await Otp.deleteMany({ email: emailLower });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = new Otp({
      email: emailLower,
      otp: otpCode,
      expireAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: emailLower,
      subject: "Verify Your Email",
      text: `Your OTP for email verification is ${otpCode}. It is valid for 10 minutes.`,
    });

    res.status(200).json({ message: "OTP sent to email for verification" });
  } catch (err) {
    console.error("Request verification OTP error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Request OTP for Password Reset
router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  try {
    const emailLower = email.toLowerCase();
    const user = await User.findOne({ email: emailLower });
    if (!user) return res.status(404).json({ message: "User not found" });

    const deleted = await Otp.deleteMany({ email: emailLower });
    // console.log(`Deleted ${deleted.deletedCount} old OTPs for ${emailLower}`);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = new Otp({
      email: emailLower,
      otp: otpCode,
      expireAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await otp.save();
    // console.log(`New OTP ${otpCode} created for ${emailLower}, expires at ${otp.expireAt}`);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: emailLower,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is ${otpCode}. It is valid for 10 minutes.`,
    });

    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) {
    console.error("Request password reset error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password Using OTP
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const emailLower = email.toLowerCase();
  try {
    // console.log("Reset Password Request:", { email: emailLower, otp });

    const validOtp = await Otp.findOne({ email: emailLower, otp });
    // console.log("Found OTP:", validOtp);
    // console.log("Current Time:", new Date());

    if (!validOtp) return res.status(400).json({ message: "Invalid OTP" });
    if (validOtp.expireAt < new Date()) return res.status(400).json({ message: "Expired OTP" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email: emailLower }, { password: hashedPassword });

    await Otp.deleteMany({ email: emailLower });
    // console.log(`Password reset for ${emailLower}, OTPs cleared`);

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Change Password with Old Password
router.put("/profile/change-password", async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const token = req.headers.authorization?.split(" ")[1];

  try {
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Incorrect old password" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;