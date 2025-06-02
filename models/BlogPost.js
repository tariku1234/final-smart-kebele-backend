const mongoose = require("mongoose")

const BlogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  category: {
    type: String,
    enum: ["announcement", "news", "guide", "success_story", "alert_news", "other"],
    default: "announcement",
  },
  tags: [String],
  featuredImage: String,
  isPublished: {
    type: Boolean,
    default: true,
  },
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // Track if alert notification has been sent
  alertNotificationSent: {
    type: Boolean,
    default: false,
  },
})

module.exports = mongoose.model("BlogPost", BlogPostSchema)
