const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const BlogPost = require("../models/BlogPost")
const auth = require("../middleware/auth")
const { USER_ROLES } = require("../config/constants")

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure the directory exists with absolute path
    const uploadDir = path.join(__dirname, "../../uploads/blog")
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, "uploads/blog")
  },
  filename: (req, file, cb) => {
    // Create a unique filename to avoid conflicts
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    // Replace spaces with hyphens and remove special characters
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "-").toLowerCase()
    cb(null, `${uniqueSuffix}-${sanitizedName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|ogg/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF images and MP4, WebM, OGG videos are allowed."))
    }
  },
})

// Add specific routes BEFORE the parameterized routes
// @route   GET api/blog/create
// @desc    Get blog creation page (if needed)
// @access  Private (Kentiba Biro only)
router.get("/create", auth, (req, res) => {
  // This route is just to handle the conflict
  // The actual creation happens in the POST / route
  if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
    return res.status(403).json({ message: "Not authorized" })
  }
  res.json({ message: "Blog creation page" })
})

// @route   POST api/blog
// @desc    Create a new blog post
// @access  Private (Kentiba Biro only)
router.post("/", auth, upload.single("featuredImage"), async (req, res) => {
  try {
    // Check if user is Kentiba Biro
    if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const { title, content, category, tags, isPublished } = req.body

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" })
    }

    // Create new blog post
    const blogPost = new BlogPost({
      title,
      content,
      author: req.user.id,
      category,
      tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
      isPublished: isPublished === "true",
    })

    // Add featured image if uploaded
    if (req.file) {
      // Store the URL path that will be accessible from the frontend
      // This path will be relative to the domain, e.g., /uploads/blog/filename.jpg
      blogPost.featuredImage = `/uploads/blog/${req.file.filename}`
    }

    await blogPost.save()

    // Populate the author field before sending the response
    await blogPost.populate("author", "firstName lastName")

    res.status(201).json({
      message: "Blog post created successfully",
      blogPost,
    })
  } catch (err) {
    console.error("Create blog post error:", err.message, err.stack)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// @route   GET api/blog
// @desc    Get all blog posts
// @access  Public
router.get("/", async (req, res) => {
  try {
    // Filter by published status for non-admin users
    let query = { isPublished: true }

    // If authenticated as Kentiba Biro, can see all posts
    if (req.user && req.user.role === USER_ROLES.KENTIBA_BIRO) {
      if (req.query.published === "all") {
        query = {}
      } else if (req.query.published === "false") {
        query = { isPublished: false }
      }
    }

    // Filter by category if provided
    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category
    }

    // Filter by tag if provided
    if (req.query.tag) {
      query.tags = req.query.tag
    }

    // Pagination
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    const blogPosts = await BlogPost.find(query)
      .populate("author", "firstName lastName")
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await BlogPost.countDocuments(query)

    res.json({
      blogPosts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error("Get blog posts error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/blog/:id
// @desc    Get blog post by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    // Check if the ID is a valid MongoDB ObjectId
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid blog post ID format" })
    }

    const blogPost = await BlogPost.findById(req.params.id).populate("author", "firstName lastName")

    if (!blogPost) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    // Check if post is published or user is Kentiba Biro
    if (!blogPost.isPublished && (!req.user || req.user.role !== USER_ROLES.KENTIBA_BIRO)) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    res.json({ blogPost })
  } catch (err) {
    console.error("Get blog post error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/blog/:id
// @desc    Update a blog post
// @access  Private (Kentiba Biro only)
router.put("/:id", auth, upload.single("featuredImage"), async (req, res) => {
  try {
    // Check if user is Kentiba Biro
    if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
      return res.status(403).json({ message: "Not authorized" })
    }

    // Check if the ID is a valid MongoDB ObjectId
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid blog post ID format" })
    }

    const { title, content, category, tags, isPublished } = req.body

    const blogPost = await BlogPost.findById(req.params.id)

    if (!blogPost) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    // Update blog post
    blogPost.title = title
    blogPost.content = content
    blogPost.category = category
    blogPost.tags = tags ? tags.split(",").map((tag) => tag.trim()) : []
    blogPost.isPublished = isPublished === "true"
    blogPost.updatedAt = new Date()

    // Update featured image if uploaded
    if (req.file) {
      // Store the URL path that will be accessible from the frontend
      blogPost.featuredImage = `/uploads/blog/${req.file.filename}`
    }

    await blogPost.save()

    res.json({
      message: "Blog post updated successfully",
      blogPost,
    })
  } catch (err) {
    console.error("Update blog post error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   DELETE api/blog/:id
// @desc    Delete a blog post
// @access  Private (Kentiba Biro only)
router.delete("/:id", auth, async (req, res) => {
  try {
    // Check if user is Kentiba Biro
    if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
      return res.status(403).json({ message: "Not authorized" })
    }

    // Check if the ID is a valid MongoDB ObjectId
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid blog post ID format" })
    }

    const blogPost = await BlogPost.findById(req.params.id)

    if (!blogPost) {
      return res.status(404).json({ message: "Blog post not found" })
    }

    // Delete the image file if it exists
    if (blogPost.featuredImage) {
      const filePath = path.join(__dirname, "../../", blogPost.featuredImage.replace(/^\//, ""))
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    await BlogPost.deleteOne({ _id: req.params.id })

    res.json({ message: "Blog post removed" })
  } catch (err) {
    console.error("Delete blog post error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
