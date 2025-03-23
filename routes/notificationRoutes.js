const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");

// ✅ Get all notifications for the logged-in user (with redirectTo link)
router.get("/", authenticateUser, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.userId })
      .select("message read createdAt redirectTo")
      .sort({ createdAt: -1 })
      .limit(50); // Fetch latest 50 notifications

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Mark all unread notifications as read
router.put("/mark-read", authenticateUser, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, read: false },
      { $set: { read: true } }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
