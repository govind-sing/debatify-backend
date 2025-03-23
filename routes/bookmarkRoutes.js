// routes/bookmarkRoutes.js
const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const Debate = require("../models/Debate");
const Discussion = require("../models/Discussion");
const { authenticateUser } = require("../middleware/authMiddleware");

// ✅ Get all bookmarked items for the authenticated user
router.get("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch all three types in parallel for better performance
    const [blogs, debates, discussions] = await Promise.all([
      Blog.find({ bookmarkedBy: userId })
        .populate("author", "username")
        .select("-bookmarkedBy")
        .lean()
        .then(items => items.map(item => ({ ...item, type: "blog" }))),

      Debate.find({ bookmarkedBy: userId })
        .populate("author", "username")
        .select("-bookmarkedBy")
        .lean()
        .then(items => items.map(item => ({ ...item, type: "debate" }))),

      Discussion.find({ bookmarkedBy: userId })
        .populate("author", "username")
        .select("-bookmarkedBy")
        .lean()
        .then(items => items.map(item => ({ ...item, type: "discussion" }))),
    ]);

    // Combine and sort by createdAt (newest first)
    const bookmarks = [...blogs, ...debates, ...discussions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(bookmarks);
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
