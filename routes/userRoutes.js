const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Debate = require("../models/Debate");
const Blog = require("../models/Blog");
const Discussion = require("../models/Discussion");
const Notification = require("../models/Notification");
const { upload } = require("../middleware/multerMiddleware");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { authenticateUser } = require("../middleware/authMiddleware");

// Fetch current logged-in user profile
router.get("/profile/me", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate("followers", "username _id profilePicture")
      .populate("followings", "username _id profilePicture")
      .populate("discussions")
      .populate("debates")
      .populate("blogs")
      .select("_id username bio name profilePicture followers followings discussions debates blogs");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Fetch profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch user profile by username
router.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate("followers", "username _id profilePicture")
      .populate("followings", "username _id profilePicture")
      .populate("discussions")
      .populate("debates")
      .populate("blogs")
      .select("_id username bio name profilePicture followers followings discussions debates blogs");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Fetch profile by username error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Follow user
router.post("/profile/:username/follow", authenticateUser, async (req, res) => {
  try {
    const targetUser = await User.findOne({ username: req.params.username });
    const currentUser = await User.findById(req.user.userId);
    if (!targetUser || !currentUser) return res.status(404).json({ message: "User not found" });

    if (targetUser._id.equals(currentUser._id)) return res.status(400).json({ message: "Cannot follow yourself" });
    if (currentUser.followings.includes(targetUser._id)) return res.status(400).json({ message: "Already following" });

    currentUser.followings.push(targetUser._id);
    targetUser.followers.push(currentUser._id);

    await Notification.create({
      userId: targetUser._id,
      message: `${currentUser.username} followed you`,
      type: "follow",
      relatedId: currentUser._id,
      targetModel: "User",
    });

    await currentUser.save();
    await targetUser.save();

    res.json({ message: "Followed successfully" });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Unfollow user
router.post("/profile/:username/unfollow", authenticateUser, async (req, res) => {
  try {
    const targetUser = await User.findOne({ username: req.params.username });
    const currentUser = await User.findById(req.user.userId);
    if (!targetUser || !currentUser) return res.status(404).json({ message: "User not found" });

    if (targetUser._id.equals(currentUser._id)) return res.status(400).json({ message: "Cannot unfollow yourself" });
    if (!currentUser.followings.includes(targetUser._id)) return res.status(400).json({ message: "Not following this user" });

    currentUser.followings.pull(targetUser._id);
    targetUser.followers.pull(currentUser._id);

    await Notification.create({
      userId: targetUser._id,
      message: `${currentUser.username} unfollowed you`,
      type: "unfollow",
      relatedId: currentUser._id,
      targetModel: "User",
    });

    await currentUser.save();
    await targetUser.save();

    res.json({ message: "Unfollowed successfully" });
  } catch (error) {
    console.error("Unfollow error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch followers
router.get("/profile/:username/followers", authenticateUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate("followers", "username _id profilePicture");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.followers);
  } catch (error) {
    console.error("Fetch followers error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetch followings
router.get("/profile/:username/followings", authenticateUser, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate("followings", "username _id profilePicture");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.followings);
  } catch (error) {
    console.error("Fetch followings error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's debates
router.get("/profile/:username/debates", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("_id");
    if (!user) return res.status(404).json({ message: "User not found" });

    const debates = await Debate.find({ author: user._id })
      .populate("author", "username _id profilePicture")
      .populate("comments.user", "username profilePicture");

    res.json(debates);
  } catch (error) {
    console.error("Fetch debates error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's blogs
router.get("/profile/:username/blogs", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("_id");
    if (!user) return res.status(404).json({ message: "User not found" });

    const blogs = await Blog.find({ author: user._id }).populate("author", "username _id profilePicture");
    res.json(blogs);
  } catch (error) {
    console.error("Fetch blogs error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's discussions
router.get("/profile/:username/discussions", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("_id");
    if (!user) return res.status(404).json({ message: "User not found" });

    const discussions = await Discussion.find({ author: user._id })
      .populate("author", "username _id profilePicture")
      .populate("comments.user", "username profilePicture");

    res.json(discussions);
  } catch (error) {
    console.error("Fetch discussions error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update bio
router.put("/profile/update-bio", authenticateUser, async (req, res) => {
  try {
    const { bio } = req.body;
    if (typeof bio !== "string") return res.status(400).json({ message: "Bio must be a string" });

    const user = await User.findByIdAndUpdate(req.user.userId, { bio }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Bio updated", bio: user.bio });
  } catch (error) {
    console.error("Update bio error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// Update profile picture
// Update profile picture
router.put(
  "/profile/update-profile-picture",
  authenticateUser,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload buffer directly to Cloudinary
      const cloudinaryResponse = await uploadToCloudinary(req.file.buffer);

      if (!cloudinaryResponse) {
        return res.status(500).json({ message: "Cloudinary upload failed" });
      }

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { profilePicture: cloudinaryResponse.secure_url },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        message: "Profile picture updated",
        profilePicture: user.profilePicture,
      });
    } catch (error) {
      console.error("Profile picture update error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);



// Search users
router.get("/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const users = await User.find({ username: { $regex: query, $options: "i" } }).select("_id username bio role createdAt");
    res.json(users);
  } catch (error) {
    console.error("User search error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
