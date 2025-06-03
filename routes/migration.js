// Optional migration route for converting existing files to Base64
const express = require("express")
const router = express.Router()
const Complaint = require("../models/Complaint")
const BlogPost = require("../models/BlogPost")
const auth = require("../middleware/auth")
const { USER_ROLES } = require("../config/constants")
const { migrateDocumentAttachments, migrateFileToBase64 } = require("../utils/migrationHelper")

// @route   POST api/migration/complaints-to-base64
// @desc    Migrate complaint attachments from file paths to Base64
// @access  Private (Admin only)
router.post("/complaints-to-base64", auth, async (req, res) => {
  try {
    // Only allow Kentiba Biro to run migrations
    if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
      return res.status(403).json({ message: "Not authorized" })
    }

    console.log("Starting complaint attachments migration to Base64...")

    // Find complaints with file path attachments (not Base64)
    const complaints = await Complaint.find({
      attachments: {
        $exists: true,
        $not: { $size: 0 },
        $not: { $elemMatch: { $regex: "^data:" } },
      },
    })

    console.log(`Found ${complaints.length} complaints with file attachments to migrate`)

    let migratedCount = 0
    let errorCount = 0

    for (const complaint of complaints) {
      try {
        const originalAttachments = [...complaint.attachments]
        await migrateDocumentAttachments(complaint)

        // Check if any attachments were actually migrated
        const wasMigrated = complaint.attachments.some(
          (att, index) => att !== originalAttachments[index] && att.startsWith("data:"),
        )

        if (wasMigrated) {
          await complaint.save()
          migratedCount++
          console.log(`Migrated complaint ${complaint._id}`)
        }
      } catch (error) {
        console.error(`Error migrating complaint ${complaint._id}:`, error)
        errorCount++
      }
    }

    res.json({
      message: "Complaint attachments migration completed",
      totalFound: complaints.length,
      migrated: migratedCount,
      errors: errorCount,
    })
  } catch (error) {
    console.error("Migration error:", error)
    res.status(500).json({ message: "Migration failed", error: error.message })
  }
})

// @route   POST api/migration/blog-images-to-base64
// @desc    Migrate blog featured images from file paths to Base64
// @access  Private (Admin only)
router.post("/blog-images-to-base64", auth, async (req, res) => {
  try {
    // Only allow Kentiba Biro to run migrations
    if (req.user.role !== USER_ROLES.KENTIBA_BIRO) {
      return res.status(403).json({ message: "Not authorized" })
    }

    console.log("Starting blog images migration to Base64...")

    // Find blog posts with file path images (not Base64)
    const blogPosts = await BlogPost.find({
      featuredImage: {
        $exists: true,
        $ne: null,
        $not: { $regex: "^data:" },
      },
    })

    console.log(`Found ${blogPosts.length} blog posts with file images to migrate`)

    let migratedCount = 0
    let errorCount = 0

    for (const blogPost of blogPosts) {
      try {
        const originalImage = blogPost.featuredImage
        const migratedImage = await migrateFileToBase64(originalImage)

        if (migratedImage !== originalImage && migratedImage.startsWith("data:")) {
          blogPost.featuredImage = migratedImage
          await blogPost.save()
          migratedCount++
          console.log(`Migrated blog post ${blogPost._id}`)
        }
      } catch (error) {
        console.error(`Error migrating blog post ${blogPost._id}:`, error)
        errorCount++
      }
    }

    res.json({
      message: "Blog images migration completed",
      totalFound: blogPosts.length,
      migrated: migratedCount,
      errors: errorCount,
    })
  } catch (error) {
    console.error("Migration error:", error)
    res.status(500).json({ message: "Migration failed", error: error.message })
  }
})

module.exports = router
