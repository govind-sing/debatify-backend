const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Discussion = require("../models/Discussion");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { authenticateUser } = require("../middleware/authMiddleware");

const formatViews = (views) => {
  if (views >= 1e9) return `${(views / 1e9).toFixed(2).replace(/\.00$/, "")}B`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(2).replace(/\.00$/, "")}M`;
  if (views >= 1e3) return `${(views / 1e3).toFixed(2).replace(/\.00$/, "")}K`;
  return views.toString();
};

const validateObjectId = (req, res, next) => {
  const { id, discussionId } = req.params;
  if ((id && !mongoose.Types.ObjectId.isValid(id)) || (discussionId && !mongoose.Types.ObjectId.isValid(discussionId))) {
    return res.status(400).json({ message: "Invalid discussion ID" });
  }
  next();
};

const createNotification = async ({ userId, message, type, relatedId, targetModel }) => {
  await Notification.create({ userId, message, type, relatedId, targetModel });
};

// Create a Discussion
router.post("/", authenticateUser, async (req, res) => {
  try {
    const { title, description, category, isPrivate, passcode } = req.body;
    const newDiscussion = new Discussion({
      title,
      description,
      category,
      isPrivate,
      passcode: isPrivate ? passcode : null,
      author: req.user.userId,
      views: 0,
      bookmarkCount: 0,
    });

    await newDiscussion.save();
    const populatedDiscussion = await Discussion.findById(newDiscussion._id).populate("author", "username");
    res.status(201).json(populatedDiscussion);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get All Discussions
router.get("/", async (req, res) => {
  try {
    const discussions = await Discussion.find()
      .populate("author", "username")
      .sort({ createdAt: -1 })
      .select("-bookmarkedBy");
    res.json(discussions);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get Discussions from Followed Users
router.get("/following", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("followings");
    if (!user) return res.status(404).json({ message: "User not found" });

    const discussions = await Discussion.find({ 
      author: { $in: user.followings },
      isPrivate: false
    })
      .populate("author", "username")
      .sort({ createdAt: -1 })
      .select("-bookmarkedBy");

    res.json(discussions);
  } catch (err) {
    console.error("Fetch Following Discussions Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Get a Single Discussion by ID
router.get("/:id", validateObjectId, async (req, res) => {
  try {
    const { passcode, poll } = req.query;
    const discussion = await Discussion.findById(req.params.id)
      .populate("author", "username")
      .populate("comments.user", "username");

    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    if (discussion.isPrivate && (passcode !== discussion.passcode)) {
      return res.status(401).json({ error: "Passcode required or incorrect" });
    }

    if (!poll) {
      discussion.views += 1;
      await discussion.save();
    }

    const token = req.headers.authorization?.split(" ")[1];
    let isBookmarked = false;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        isBookmarked = discussion.bookmarkedBy.includes(decoded.userId);
      } catch {}
    }

    res.json({
      ...discussion.toObject(),
      isBookmarked,
      viewsFormatted: formatViews(discussion.views),
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Comment on a Discussion
router.post("/:id/comment", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const { text } = req.body;
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const newComment = { user: req.user.userId, text };
    discussion.comments.push(newComment);
    await discussion.save();

    if (discussion.author.toString() !== req.user.userId) {
      const currentUser = await User.findById(req.user.userId);
      await createNotification({
        userId: discussion.author,
        message: `${currentUser.username} commented on your discussion "${discussion.title}"`,
        type: "comment",
        relatedId: discussion._id,
        targetModel: "Discussion",
      });
    }

    res.json(discussion);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Upvote a Discussion
router.post("/:id/upvote", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const userId = req.user.userId;
    if (discussion.upvotedBy.includes(userId)) {
      discussion.upvotedBy.pull(userId);
      discussion.upvotes--;
    } else {
      if (discussion.downvotedBy.includes(userId)) {
        discussion.downvotedBy.pull(userId);
        discussion.downvotes--;
      }
      discussion.upvotedBy.push(userId);
      discussion.upvotes++;
      if (discussion.author.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await createNotification({
          userId: discussion.author,
          message: `${currentUser.username} upvoted your discussion "${discussion.title}"`,
          type: "upvote",
          relatedId: discussion._id,
          targetModel: "Discussion",
        });
      }
    }

    await discussion.save();
    res.json(discussion);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Downvote a Discussion
router.post("/:id/downvote", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const userId = req.user.userId;
    if (discussion.downvotedBy.includes(userId)) {
      discussion.downvotedBy.pull(userId);
      discussion.downvotes--;
    } else {
      if (discussion.upvotedBy.includes(userId)) {
        discussion.upvotedBy.pull(userId);
        discussion.upvotes--;
      }
      discussion.downvotedBy.push(userId);
      discussion.downvotes++;
      if (discussion.author.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await createNotification({
          userId: discussion.author,
          message: `${currentUser.username} downvoted your discussion "${discussion.title}"`,
          type: "downvote",
          relatedId: discussion._id,
          targetModel: "Discussion",
        });
      }
    }

    await discussion.save();
    res.json(discussion);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Bookmark / Unbookmark Discussion
router.post("/:id/bookmark", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const userId = req.user.userId;
    const isBookmarked = discussion.bookmarkedBy.includes(userId);

    if (isBookmarked) {
      discussion.bookmarkedBy.pull(userId);
      discussion.bookmarkCount--;
    } else {
      discussion.bookmarkedBy.push(userId);
      discussion.bookmarkCount++;
    }

    await discussion.save();
    res.json({
      bookmarkCount: discussion.bookmarkCount,
      isBookmarked: !isBookmarked,
      message: isBookmarked ? "Bookmark removed" : "Bookmarked successfully"
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get Bookmarked Discussions of a User
router.get("/bookmarks/user", authenticateUser, async (req, res) => {
  try {
    const discussions = await Discussion.find({ bookmarkedBy: req.user.userId })
      .populate("author", "username")
      .select("-bookmarkedBy")
      .sort({ createdAt: -1 });
    res.json(discussions);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Delete a Discussion
router.delete("/:id", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    if (discussion.author.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Unauthorized: You can only delete your own discussions" });
    }

    await Discussion.findByIdAndDelete(req.params.id);
    await Notification.deleteMany({ relatedId: req.params.id });

    res.status(200).json({ message: "Discussion deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Like or Unlike a Comment
router.post("/:discussionId/comment/:commentId/like", authenticateUser, validateObjectId, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.discussionId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const comment = discussion.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const userId = req.user.userId;
    const alreadyLiked = comment.likedBy?.includes(userId);

    if (alreadyLiked) {
      comment.likedBy.pull(userId);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      comment.likedBy.push(userId);
      comment.likes++;
      if (comment.user.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await createNotification({
          userId: comment.user,
          message: `${currentUser.username} liked your comment on Discussion "${discussion.title}"`,
          type: "comment_like",
          relatedId: comment._id,
          targetModel: "Discussion",
        });
      }
    }

    await discussion.save();
    res.status(200).json({ likes: comment.likes, likedBy: comment.likedBy });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;