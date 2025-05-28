const express = require("express")
const router = express.Router()
const Comment = require("../models/Comment")
const BlogPost = require("../models/BlogPost")
const auth = require("../middleware/auth")

// @route   GET api/comments/:blogPostId
// @desc    Get all comments for a blog post
// @access  Public
router.get("/:blogPostId", async (req, res) => {
  try {
    const { blogPostId } = req.params

    // Validate blog post exists
    const blogPost = await BlogPost.findById(blogPostId)
    if (!blogPost) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    // Get top-level comments
    const comments = await Comment.find({
      blogPost: blogPostId,
      parentComment: null,
    })
      .populate("author", "firstName lastName role")
      .sort({ createdAt: -1 })

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await Comment.find({ parentComment: comment._id })
          .populate("author", "firstName lastName role")
          .sort({ createdAt: 1 })

        return {
          ...comment.toObject(),
          replies,
          likesCount: comment.likes.length,
          dislikesCount: comment.dislikes.length,
        }
      }),
    )

    res.json({ comments: commentsWithReplies })
  } catch (err) {
    console.error("Get comments error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/comments/:blogPostId/stats
// @desc    Get comment and reaction stats for a blog post
// @access  Public
router.get("/:blogPostId/stats", async (req, res) => {
  try {
    const { blogPostId } = req.params

    // Get comment count
    const commentCount = await Comment.countDocuments({ blogPost: blogPostId })

    // Get all comments to calculate total reactions
    const comments = await Comment.find({ blogPost: blogPostId })

    const totalLikes = comments.reduce((sum, comment) => sum + comment.likes.length, 0)
    const totalDislikes = comments.reduce((sum, comment) => sum + comment.dislikes.length, 0)

    res.json({
      commentCount,
      totalLikes,
      totalDislikes,
      totalReactions: totalLikes + totalDislikes,
    })
  } catch (err) {
    console.error("Get comment stats error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/comments
// @desc    Create a new comment
// @access  Private
router.post("/", auth, async (req, res) => {
  try {
    const { content, blogPostId, parentCommentId } = req.body

    if (!content || !blogPostId) {
      return res.status(400).json({ message: "Content and blog post ID are required" })
    }

    // Validate blog post exists
    const blogPost = await BlogPost.findById(blogPostId)
    if (!blogPost) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    // If it's a reply, validate parent comment exists
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId)
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" })
      }
    }

    const comment = new Comment({
      content,
      author: req.user.id,
      blogPost: blogPostId,
      parentComment: parentCommentId || null,
    })

    await comment.save()
    await comment.populate("author", "firstName lastName role")

    res.status(201).json({
      message: "Comment created successfully",
      comment: {
        ...comment.toObject(),
        likesCount: 0,
        dislikesCount: 0,
      },
    })
  } catch (err) {
    console.error("Create comment error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/comments/:id/like
// @desc    Like/unlike a comment
// @access  Private
router.put("/:id/like", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    const userId = req.user.id
    const hasLiked = comment.likes.includes(userId)
    const hasDisliked = comment.dislikes.includes(userId)

    if (hasLiked) {
      // Remove like
      comment.likes = comment.likes.filter((id) => id.toString() !== userId)
    } else {
      // Add like and remove dislike if exists
      comment.likes.push(userId)
      if (hasDisliked) {
        comment.dislikes = comment.dislikes.filter((id) => id.toString() !== userId)
      }
    }

    await comment.save()

    res.json({
      message: hasLiked ? "Like removed" : "Comment liked",
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
      hasLiked: !hasLiked,
      hasDisliked: false,
    })
  } catch (err) {
    console.error("Like comment error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/comments/:id/dislike
// @desc    Dislike/undislike a comment
// @access  Private
router.put("/:id/dislike", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    const userId = req.user.id
    const hasLiked = comment.likes.includes(userId)
    const hasDisliked = comment.dislikes.includes(userId)

    if (hasDisliked) {
      // Remove dislike
      comment.dislikes = comment.dislikes.filter((id) => id.toString() !== userId)
    } else {
      // Add dislike and remove like if exists
      comment.dislikes.push(userId)
      if (hasLiked) {
        comment.likes = comment.likes.filter((id) => id.toString() !== userId)
      }
    }

    await comment.save()

    res.json({
      message: hasDisliked ? "Dislike removed" : "Comment disliked",
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
      hasLiked: false,
      hasDisliked: !hasDisliked,
    })
  } catch (err) {
    console.error("Dislike comment error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/comments/:id
// @desc    Edit a comment
// @access  Private
router.put("/:id", auth, async (req, res) => {
  try {
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ message: "Content is required" })
    }

    const comment = await Comment.findById(req.params.id)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    // Check if user owns the comment
    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to edit this comment" })
    }

    comment.content = content
    comment.isEdited = true
    comment.updatedAt = new Date()

    await comment.save()
    await comment.populate("author", "firstName lastName role")

    res.json({
      message: "Comment updated successfully",
      comment: {
        ...comment.toObject(),
        likesCount: comment.likes.length,
        dislikesCount: comment.dislikes.length,
      },
    })
  } catch (err) {
    console.error("Edit comment error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   DELETE api/comments/:id
// @desc    Delete a comment
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    // Check if user owns the comment or is Kentiba Biro
    if (comment.author.toString() !== req.user.id && req.user.role !== "kentiba_biro") {
      return res.status(403).json({ message: "Not authorized to delete this comment" })
    }

    // Delete all replies to this comment
    await Comment.deleteMany({ parentComment: comment._id })

    // Delete the comment
    await Comment.deleteOne({ _id: req.params.id })

    res.json({ message: "Comment deleted successfully" })
  } catch (err) {
    console.error("Delete comment error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
