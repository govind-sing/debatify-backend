const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Blog = require("../models/Blog");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { authenticateUser } = require("../middleware/authMiddleware");

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|mp4|webm|mp3|wav|ogg|pdf/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    isValid ? cb(null, true) : cb(new Error("Invalid file type"));
  },
});

const formatViews = (views) => {
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return views.toString();
};

// Create a Blog
router.post("/", authenticateUser, upload.array("files", 10), async (req, res) => {
  try {
    const { title, content, isPrivate, passcode } = req.body;
    const fileUrls = req.files.map(file => `/uploads/${file.filename}`);
    const blog = await new Blog({
      title,
      content,
      fileUrls,
      author: req.user.userId,
      isPrivate: isPrivate === "true",
      passcode: isPrivate === "true" ? passcode : null,
    }).save();

    const populatedBlog = await blog.populate("author", "username");
    res.status(201).json(populatedBlog);
  } catch (err) {
    console.error("Create Blog Error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Fetch All Blogs
router.get("/", async (req, res) => {
  try {
    const blogs = await Blog.find().populate("author", "username");
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Fetch Blogs from Followed Users
router.get("/following", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("followings");
    if (!user) return res.status(404).json({ message: "User not found" });

    const blogs = await Blog.find({ 
      author: { $in: user.followings },
      isPrivate: false // Exclude private blogs from following feed
    }).populate("author", "username");

    res.json(blogs);
  } catch (err) {
    console.error("Fetch Following Blogs Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Fetch Single Blog
router.get("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid Blog ID" });

  try {
    const { passcode, poll } = req.query;
    const blog = await Blog.findById(req.params.id).populate("author", "username");
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    if (blog.isPrivate && passcode !== blog.passcode) {
      return res.status(401).json({ error: "Incorrect passcode" });
    }

    if (!poll) {
      blog.views += 1;
      await blog.save();
    }

    let isBookmarked = false;
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        const { userId } = jwt.verify(token, process.env.JWT_SECRET);
        isBookmarked = blog.bookmarkedBy.includes(userId);
      } catch {}
    }

    res.json({ ...blog.toObject(), isBookmarked, viewsFormatted: formatViews(blog.views) });
  } catch (error) {
    console.error("Fetch Blog Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// Upvote Blog
router.post("/:id/upvote", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid Blog ID" });

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const userId = req.user.userId;
    if (blog.upvotedBy.includes(userId)) return res.status(400).json({ message: "Already upvoted" });

    blog.downvotedBy.pull(userId);
    if (blog.downvotes > 0) blog.downvotes--;

    blog.upvotes++;
    blog.upvotedBy.push(userId);

    if (blog.author.toString() !== userId) {
      const currentUser = await User.findById(userId);
      await Notification.create({
        userId: blog.author,
        message: `${currentUser.username} upvoted your blog "${blog.title}"`,
        type: "upvote",
        relatedId: blog._id,
      });
    }

    await blog.save();
    res.json({ upvotes: blog.upvotes, downvotes: blog.downvotes });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Downvote Blog
router.post("/:id/downvote", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid Blog ID" });

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const userId = req.user.userId;
    if (blog.downvotedBy.includes(userId)) return res.status(400).json({ message: "Already downvoted" });

    blog.upvotedBy.pull(userId);
    if (blog.upvotes > 0) blog.upvotes--;

    blog.downvotes++;
    blog.downvotedBy.push(userId);

    if (blog.author.toString() !== userId) {
      const currentUser = await User.findById(userId);
      await Notification.create({
        userId: blog.author,
        message: `${currentUser.username} downvoted your blog "${blog.title}"`,
        type: "downvote",
        relatedId: blog._id,
      });
    }

    await blog.save();
    res.json({ upvotes: blog.upvotes, downvotes: blog.downvotes });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Delete Blog
router.delete("/:id", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid Blog ID" });

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    if (blog.author.toString() !== req.user.userId) return res.status(403).json({ message: "Unauthorized" });

    await blog.deleteOne();
    await Notification.deleteMany({ relatedId: req.params.id });

    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Bookmark/Unbookmark Blog
router.post("/:id/bookmark", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid Blog ID" });

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const userId = req.user.userId;
    const isBookmarked = blog.bookmarkedBy.includes(userId);

    if (isBookmarked) {
      blog.bookmarkedBy.pull(userId);
      blog.bookmarkCount = Math.max(0, blog.bookmarkCount - 1);
    } else {
      blog.bookmarkedBy.push(userId);
      blog.bookmarkCount += 1;
    }

    await blog.save();
    res.json({ bookmarkCount: blog.bookmarkCount, isBookmarked: !isBookmarked });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get User's Bookmarked Blogs
router.get("/bookmarks/user", authenticateUser, async (req, res) => {
  try {
    const blogs = await Blog.find({ bookmarkedBy: req.user.userId })
      .populate("author", "username")
      .select("-bookmarkedBy")
      .sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;