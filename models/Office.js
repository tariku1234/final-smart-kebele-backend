const mongoose = require("mongoose")

const OfficeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  hours: {
    type: String,
    required: true,
  },
  contact: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["open", "closed", "limited"],
    required: true,
  },
  officeType: {
    type: String,
    required: true,
    enum: [
      "trade_office",
      "id_office",
      "land_office",
      "tax_office",
      "court_office",
      "police_office",
      "education_office",
      "health_office",
      "transport_office",
      "water_office",
      "electricity_office",
      "telecom_office",
      "immigration_office",
      "social_affairs_office",
      "other",
    ],
  },
  kifleketema: {
    type: String,
    required: true,
  },
  wereda: {
    type: Number,
    required: true,
  },
  morningStatus: {
    type: String,
    enum: ["open", "closed", "limited"],
    default: "open",
  },
  afternoonStatus: {
    type: String,
    enum: ["open", "closed", "limited"],
    default: "open",
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
})

module.exports = mongoose.model("Office", OfficeSchema)
