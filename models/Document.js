const mongoose = require("mongoose")

const DocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  eligibilityCriteria: {
    type: [String],
    default: [],
  },
  requirements: {
    type: [String],
    required: true,
  },
  procedure: {
    type: [String],
    required: true,
  },
  contactInfo: {
    type: String,
    trim: true,
  },
  additionalNotes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

module.exports = mongoose.model("Document", DocumentSchema)
