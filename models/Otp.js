const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expireAt: { type: Date, required: true, index: { expires: 600 } }, // TTL index
  createdAt: { type: Date, default: Date.now }, // Add this
});

module.exports = mongoose.model("Otp", otpSchema);