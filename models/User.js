const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false }, // For email verification
  followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  followings: [{ type: Schema.Types.ObjectId, ref: "User" }],
  discussions: [{ type: Schema.Types.ObjectId, ref: "Discussion" }],
  debates: [{ type: Schema.Types.ObjectId, ref: "Debate" }],
  blogs: [{ type: Schema.Types.ObjectId, ref: "Blog" }],
  notifications: [{ type: Schema.Types.ObjectId, ref: "Notification" }],
  profilePicture: { type: String, default: "/images/default-avatar.png", trim: true },
  bio: { type: String, default: "", trim: true },
  address: { type: String, default: "", trim: true },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);