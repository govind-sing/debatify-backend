const mongoose = require("mongoose");
const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 }, // Add likes field
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Add likedBy field
});


const discussionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  isPrivate: { type: Boolean, default: false },
  passcode: { type: String, default: null },
  upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [commentSchema],
  createdAt: { type: Date, default: Date.now },
  views: { type: Number, default: 0 },
  bookmarkCount: { type: Number, default: 0 },
  bookmarkedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Discussion", discussionSchema);
