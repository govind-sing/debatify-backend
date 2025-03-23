const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  fileUrls: [{ type: String }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isPrivate: { type: Boolean, default: false },
  passcode: { type: String },
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 },
  bookmarkCount: { type: Number, default: 0 },
  bookmarkedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model("Blog", blogSchema);
