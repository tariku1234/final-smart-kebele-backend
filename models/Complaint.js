const mongoose = require("mongoose")

const ComplaintSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  // The office this complaint is directed to
  stakeholderOffice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Location information
  kifleketema: {
    type: String,
    enum: [
      "lemi_kura",
      "arada",
      "addis_ketema",
      "lideta",
      "kirkos",
      "yeka",
      "bole",
      "akaky_kaliti",
      "nifas_silk_lafto",
      "kolfe_keranio",
      "gulele",
    ],
    required: true,
  },
  wereda: {
    type: Number,
    min: 1,
    max: 13, // Maximum number of Weredas in any Kifleketema
    required: true,
  },
  // Current stage of the complaint
  currentStage: {
    type: String,
    enum: [
      "stakeholder_first",
      "stakeholder_second",
      "wereda_first",
      "wereda_second",
      "kifleketema_first",
      "kifleketema_second",
      "kentiba",
    ],
    default: "stakeholder_first",
  },
  // Current handler of the complaint
  currentHandler: {
    type: String,
    enum: ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption", "kentiba_biro"],
    default: "stakeholder_office",
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "resolved", "escalated"],
    default: "pending",
  },
  location: {
    type: String,
    required: true,
  },
  attachments: {
    type: [String],
  },
  // Timestamps for escalation tracking
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  stakeholderFirstResponseDue: {
    type: Date,
  },
  stakeholderSecondResponseDue: {
    type: Date,
  },
  weredaFirstResponseDue: {
    type: Date,
  },
  weredaSecondResponseDue: {
    type: Date,
  },
  kifleketemaFirstResponseDue: {
    type: Date,
  },
  kifleketemaSecondResponseDue: {
    type: Date,
  },
  // Escalation history
  escalationHistory: [
    {
      from: {
        type: String,
        enum: ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption", "kentiba_biro"],
      },
      to: {
        type: String,
        enum: ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption", "kentiba_biro"],
      },
      reason: String,
      date: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Responses from different offices
  responses: [
    {
      responder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      responderRole: {
        type: String,
        enum: ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption", "kentiba_biro"],
      },
      response: String,
      status: {
        type: String,
        enum: ["pending", "in_progress", "resolved", "escalated"],
      },
      stage: {
        type: String,
        enum: [
          "stakeholder_first",
          "stakeholder_second",
          "wereda_first",
          "wereda_second",
          "kifleketema_first",
          "kifleketema_second",
          "kentiba",
        ],
      },
      internalComment: String,
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Final resolution details
  resolution: {
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolverRole: {
      type: String,
      enum: ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption", "kentiba_biro"],
    },
    resolution: String,
    resolvedAt: Date,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // For second stage complaints
  additionalDetails: {
    type: String,
  },
  relatedComplaint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
  },
})

// Set due dates for responses when a complaint is created
ComplaintSchema.pre("save", function (next) {
  if (this.isNew) {
    const now = new Date()

    // Set stakeholder office response due dates (3 days)
    this.stakeholderFirstResponseDue = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    // Other due dates will be set when escalated
  }

  this.updatedAt = new Date()
  next()
})

module.exports = mongoose.model("Complaint", ComplaintSchema)
