const express = require("express")
const router = express.Router()
const Document = require("../models/Document")
const auth = require("../middleware/auth")

// @route   GET api/documents
// @desc    Get all documents
// @access  Public
router.get("/", async (req, res) => {
  try {
    const documents = await Document.find().sort({ category: 1, title: 1 })

    res.json({ documents })
  } catch (err) {
    console.error("Get documents error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/documents/:id
// @desc    Get document by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Document not found" })
    }

    res.json({ document })
  } catch (err) {
    console.error("Get document error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/documents
// @desc    Create a new document
// @access  Private (Kentiba Biro only)
router.post("/", auth, async (req, res) => {
  try {
    // Check if user is authorized
    if (req.user.role !== "kentiba_biro" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to create documents" })
    }

    // Create new document
    const document = new Document({
      ...req.body,
      createdBy: req.user.id,
    })

    await document.save()
    res.status(201).json({ document })
  } catch (err) {
    console.error("Error creating document:", err)
    res.status(500).json({ message: "Server error", error: err.message })
  }
})

// @route   PUT api/documents/:id
// @desc    Update a document
// @access  Private (Kentiba Biro only)
router.put("/:id", auth, async (req, res) => {
  try {
    // Check if user is Kentiba Biro
    if (req.user.role !== "kentiba_biro") {
      return res.status(403).json({ message: "Not authorized to update documents" })
    }

    const { title, description, category, eligibilityCriteria, requirements, procedure, contactInfo, additionalNotes } =
      req.body

    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Document not found" })
    }

    // Update document
    document.title = title
    document.description = description
    document.category = category
    document.eligibilityCriteria = eligibilityCriteria || []
    document.requirements = requirements
    document.procedure = procedure
    document.contactInfo = contactInfo
    document.additionalNotes = additionalNotes
    document.updatedAt = Date.now()

    await document.save()

    res.json({
      message: "Document updated successfully",
      document,
    })
  } catch (err) {
    console.error("Update document error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   DELETE api/documents/:id
// @desc    Delete a document
// @access  Private (Kentiba Biro only)
router.delete("/:id", auth, async (req, res) => {
  try {
    // Check if user is Kentiba Biro
    if (req.user.role !== "kentiba_biro") {
      return res.status(403).json({ message: "Not authorized to delete documents" })
    }

    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Document not found" })
    }

    await Document.deleteOne({ _id: req.params.id })

    res.json({ message: "Document removed successfully" })
  } catch (err) {
    console.error("Delete document error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
