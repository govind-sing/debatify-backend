const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ["follow", "unfollow", "upvote", "downvote", "comment_like", "comment"],
    required: true,
  },
  relatedId: { type: mongoose.Schema.Types.ObjectId, refPath: "type" },
  commentText: { type: String, default: "", trim: true },
  debateTitle: { type: String, default: "", trim: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);
