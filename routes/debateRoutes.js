const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const router = express.Router();

const Debate = require("../models/Debate");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { authenticateUser } = require("../middleware/authMiddleware");

const formatViews = (views) => {
  if (views >= 1e9) return `${(views / 1e9).toFixed(2).replace(/\.00$/, "")}B`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(2).replace(/\.00$/, "")}M`;
  if (views >= 1e3) return `${(views / 1e3).toFixed(2).replace(/\.00$/, "")}K`;
  return views.toString();
};

// Create Debate
router.post("/", authenticateUser, async (req, res) => {
  try {
    const { title, openingArgument, category, isPrivate, passcode } = req.body;
    const newDebate = new Debate({
      title,
      openingArgument,
      category,
      isPrivate,
      passcode: isPrivate ? passcode : null,
      author: req.user.userId,
    });
    await newDebate.save();
    res.status(201).json(newDebate);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get All Debates
router.get("/", async (req, res) => {
  try {
    const debates = await Debate.find()
      .populate("author", "username")
      .sort({ createdAt: -1 });
    res.json(debates);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Get Debates from Followed Users
router.get("/following", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("followings");
    if (!user) return res.status(404).json({ message: "User not found" });

    const debates = await Debate.find({ 
      author: { $in: user.followings },
      isPrivate: false // Exclude private debates from following feed
    })
      .populate("author", "username")
      .sort({ createdAt: -1 });

    res.json(debates);
  } catch (err) {
    console.error("Fetch Following Debates Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Get Single Debate by ID (with passcode check and views increment)
router.get("/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const { passcode, poll } = req.query;
    const debate = await Debate.findById(req.params.id)
      .populate("author", "username")
      .populate("comments.user", "username");

    if (!debate) return res.status(404).json({ message: "Debate not found" });

    if (debate.isPrivate && (passcode !== debate.passcode)) {
      return res.status(401).json({ error: "Passcode required or incorrect" });
    }

    if (!poll) {
      debate.views += 1;
      await debate.save();
    }

    const token = req.headers.authorization?.split(" ")[1];
    let isBookmarked = false;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        isBookmarked = debate.bookmarkedBy.includes(decoded.userId);
      } catch (err) {}
    }

    res.json({ ...debate.toObject(), isBookmarked, viewsFormatted: formatViews(debate.views) });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Bookmark/Unbookmark Debate
router.post("/:id/bookmark", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const debate = await Debate.findById(req.params.id);
    if (!debate) return res.status(404).json({ message: "Debate not found" });

    const userId = req.user.userId;
    const isBookmarked = debate.bookmarkedBy.includes(userId);

    if (isBookmarked) {
      debate.bookmarkedBy.pull(userId);
      debate.bookmarkCount = Math.max(0, debate.bookmarkCount - 1);
    } else {
      debate.bookmarkedBy.push(userId);
      debate.bookmarkCount += 1;
    }

    await debate.save();
    res.json({ bookmarkCount: debate.bookmarkCount, isBookmarked: !isBookmarked });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Comment on Debate
router.post("/:id/comment", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const { text, stance } = req.body;
    if (!["with", "against"].includes(stance)) return res.status(400).json({ message: "Invalid stance" });

    const debate = await Debate.findById(req.params.id);
    if (!debate) return res.status(404).json({ message: "Debate not found" });

    const newComment = { user: req.user.userId, text, stance };
    debate.comments.push(newComment);

    if (debate.author.toString() !== req.user.userId) {
      const currentUser = await User.findById(req.user.userId);
      await Notification.create({
        userId: debate.author,
        message: `${currentUser.username} commented on your debate "${debate.title}"`,
        type: "comment",
        relatedId: debate._id,
        targetModel: "Debate",
      });
    }

    await debate.save();
    res.json(debate);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Upvote Debate
router.post("/:id/upvote", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const debate = await Debate.findById(req.params.id);
    if (!debate) return res.status(404).json({ message: "Debate not found" });

    const userId = req.user.userId;
    if (debate.upvotedBy.includes(userId)) {
      debate.upvotedBy.pull(userId);
      debate.upvotes -= 1;
    } else {
      if (debate.downvotedBy.includes(userId)) {
        debate.downvotedBy.pull(userId);
        debate.downvotes -= 1;
      }
      debate.upvotedBy.push(userId);
      debate.upvotes += 1;

      if (debate.author.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await Notification.create({
          userId: debate.author,
          message: `${currentUser.username} upvoted your debate "${debate.title}"`,
          type: "upvote",
          relatedId: debate._id,
          targetModel: "Debate",
        });
      }
    }

    await debate.save();
    res.json(debate);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Downvote Debate
router.post("/:id/downvote", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const debate = await Debate.findById(req.params.id);
    if (!debate) return res.status(404).json({ message: "Debate not found" });

    const userId = req.user.userId;
    if (debate.downvotedBy.includes(userId)) {
      debate.downvotedBy.pull(userId);
      debate.downvotes -= 1;
    } else {
      if (debate.upvotedBy.includes(userId)) {
        debate.upvotedBy.pull(userId);
        debate.upvotes -= 1;
      }
      debate.downvotedBy.push(userId);
      debate.downvotes += 1;

      if (debate.author.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await Notification.create({
          userId: debate.author,
          message: `${currentUser.username} downvoted your debate "${debate.title}"`,
          type: "downvote",
          relatedId: debate._id,
          targetModel: "Debate",
        });
      }
    }

    await debate.save();
    res.json(debate);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Delete Debate
router.delete("/:id", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const debate = await Debate.findById(req.params.id);
    if (!debate) return res.status(404).json({ message: "Debate not found" });
    if (debate.author.toString() !== req.user.userId) return res.status(403).json({ message: "Unauthorized" });

    await Debate.findByIdAndDelete(req.params.id);
    await Notification.deleteMany({ relatedId: req.params.id });

    res.status(200).json({ message: "Debate deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Like/Unlike Comment
router.post("/:debateId/comment/:commentId/like", authenticateUser, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.debateId)) return res.status(400).json({ message: "Invalid debate ID" });

  try {
    const debate = await Debate.findById(req.params.debateId);
    if (!debate) return res.status(404).json({ message: "Debate not found" });

    const comment = debate.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const userId = req.user.userId;
    const alreadyLiked = comment.likedBy?.includes(userId) || false;

    if (alreadyLiked) {
      comment.likedBy.pull(userId);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      comment.likedBy = comment.likedBy || [];
      comment.likedBy.push(userId);
      comment.likes = (comment.likes || 0) + 1;

      if (comment.user.toString() !== userId) {
        const currentUser = await User.findById(userId);
        await Notification.create({
          userId: comment.user,
          message: `${currentUser.username} liked your comment at Debate "${debate.title}"`,
          type: "comment_like",
          relatedId: comment._id,
          targetModel: "Debate",
        });
      }
    }

    await debate.save();
    res.status(200).json({ likes: comment.likes, likedBy: comment.likedBy });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;