const express = require("express")
const router = express.Router()
const Office = require("../models/Office")
const auth = require("../middleware/auth")
const { USER_ROLES } = require("../config/constants")

// @route   GET api/offices/types
// @desc    Get all office types
// @access  Public
router.get("/types", async (req, res) => {
  try {
    const officeTypes = [
      { value: "trade_office", label: "Trade Office" },
      { value: "id_office", label: "ID Office" },
      { value: "land_office", label: "Land Office" },
      { value: "tax_office", label: "Tax Office" },
      { value: "court_office", label: "Court Office" },
      { value: "police_office", label: "Police Office" },
      { value: "education_office", label: "Education Office" },
      { value: "health_office", label: "Health Office" },
      { value: "transport_office", label: "Transport Office" },
      { value: "water_office", label: "Water Office" },
      { value: "electricity_office", label: "Electricity Office" },
      { value: "telecom_office", label: "Telecom Office" },
      { value: "immigration_office", label: "Immigration Office" },
      { value: "social_affairs_office", label: "Social Affairs Office" },
      { value: "other", label: "Other Office" },
    ]

    res.json({ officeTypes })
  } catch (err) {
    console.error("Get office types error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/offices/available-types
// @desc    Get available office types for a specific kifleketema and wereda
// @access  Private
router.get("/available-types", auth, async (req, res) => {
  try {
    const { kifleketema, wereda } = req.query

    if (!kifleketema || !wereda) {
      return res.status(400).json({ message: "Kifle Ketema and Wereda are required" })
    }

    // Get all office types
    const officeTypes = [
      { value: "trade_office", label: "Trade Office" },
      { value: "id_office", label: "ID Office" },
      { value: "land_office", label: "Land Office" },
      { value: "tax_office", label: "Tax Office" },
      { value: "court_office", label: "Court Office" },
      { value: "police_office", label: "Police Office" },
      { value: "education_office", label: "Education Office" },
      { value: "health_office", label: "Health Office" },
      { value: "transport_office", label: "Transport Office" },
      { value: "water_office", label: "Water Office" },
      { value: "electricity_office", label: "Electricity Office" },
      { value: "telecom_office", label: "Telecom Office" },
      { value: "immigration_office", label: "Immigration Office" },
      { value: "social_affairs_office", label: "Social Affairs Office" },
      { value: "other", label: "Other Office" },
    ]

    // Find existing office types in this kifleketema and wereda
    const existingOffices = await Office.find({
      kifleketema,
      wereda: Number(wereda),
    }).select("officeType")

    const existingTypes = existingOffices.map((office) => office.officeType)

    // Filter out existing types
    const availableTypes = officeTypes.filter((type) => !existingTypes.includes(type.value))

    res.json({ availableTypes, existingTypes })
  } catch (err) {
    console.error("Get available office types error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/offices
// @desc    Get all offices
// @access  Public
router.get("/", async (req, res) => {
  try {
    const query = {}

    // Filter by status if provided
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status
    }

    // Filter by kifleketema and wereda if provided
    if (req.query.kifleketema) {
      query.kifleketema = req.query.kifleketema
    }

    if (req.query.wereda) {
      query.wereda = Number(req.query.wereda)
    }

    // Filter by office type if provided
    if (req.query.officeType) {
      query.officeType = req.query.officeType
    }

    // Limit results if specified
    const limit = req.query.limit ? Number.parseInt(req.query.limit) : 0

    const offices = await Office.find(query).sort({ name: 1 }).limit(limit)

    res.json({ offices })
  } catch (err) {
    console.error("Get offices error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/offices/:id
// @desc    Get office by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const office = await Office.findById(req.params.id)

    if (!office) {
      return res.status(404).json({ message: "Office not found" })
    }

    res.json({ office })
  } catch (err) {
    console.error("Get office error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/offices
// @desc    Create a new office
// @access  Private (Admin only)
router.post("/", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    // For wereda admins, ensure they can only create offices in their wereda
    if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      if (!req.user.kifleketema || !req.user.wereda) {
        return res.status(403).json({ message: "Administrator location not set" })
      }

      // Ensure the office is in the admin's wereda
      if (req.body.kifleketema !== req.user.kifleketema || Number(req.body.wereda) !== Number(req.user.wereda)) {
        return res.status(403).json({ message: "Not authorized to create offices outside your wereda" })
      }
    }

    const {
      name,
      description,
      location,
      hours,
      contact,
      status,
      officeType,
      kifleketema,
      wereda,
      morningStatus,
      afternoonStatus,
    } = req.body

    // Check if an office of this type already exists in this kifleketema and wereda
    const existingOffice = await Office.findOne({
      officeType,
      kifleketema,
      wereda: Number(wereda),
    })

    if (existingOffice) {
      return res.status(400).json({
        message: `An office of type "${officeType}" already exists in this location. Please edit the existing office instead.`,
      })
    }

    // Create new office
    const office = new Office({
      name,
      description,
      location,
      hours,
      contact,
      status,
      officeType,
      kifleketema,
      wereda: Number(wereda),
      morningStatus: morningStatus || status,
      afternoonStatus: afternoonStatus || status,
      updatedBy: req.user.id,
    })

    await office.save()

    res.status(201).json({
      message: "Office created successfully",
      office,
    })
  } catch (err) {
    console.error("Create office error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/offices/:id
// @desc    Update an office
// @access  Private (Admin only)
router.put("/:id", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const office = await Office.findById(req.params.id)

    if (!office) {
      return res.status(404).json({ message: "Office not found" })
    }

    // For wereda admins, ensure they can only update offices in their wereda
    if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      if (!req.user.kifleketema || !req.user.wereda) {
        return res.status(403).json({ message: "Administrator location not set" })
      }

      // Ensure the office is in the admin's wereda
      if (office.kifleketema !== req.user.kifleketema || Number(office.wereda) !== Number(req.user.wereda)) {
        return res.status(403).json({ message: "Not authorized to update offices outside your wereda" })
      }
    }

    const { name, description, location, hours, contact, status, officeType, morningStatus, afternoonStatus } = req.body

    // If office type is being changed, check if an office of the new type already exists
    if (officeType && officeType !== office.officeType) {
      const existingOffice = await Office.findOne({
        officeType,
        kifleketema: office.kifleketema,
        wereda: office.wereda,
        _id: { $ne: office._id }, // Exclude the current office
      })

      if (existingOffice) {
        return res.status(400).json({
          message: `An office of type "${officeType}" already exists in this location. Please edit the existing office instead.`,
        })
      }
    }

    // Update office
    if (name) office.name = name
    if (description) office.description = description
    if (location) office.location = location
    if (hours) office.hours = hours
    if (contact) office.contact = contact
    if (status) office.status = status
    if (officeType) office.officeType = officeType
    if (morningStatus) office.morningStatus = morningStatus
    if (afternoonStatus) office.afternoonStatus = afternoonStatus

    office.updatedAt = Date.now()
    office.updatedBy = req.user.id

    await office.save()

    res.json({
      message: "Office updated successfully",
      office,
    })
  } catch (err) {
    console.error("Update office error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   PUT api/offices/:id/availability
// @desc    Update office availability
// @access  Private (Wereda Admin only)
router.put("/:id/availability", auth, async (req, res) => {
  try {
    // Only wereda admins can update availability
    if (req.user.role !== USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      return res.status(403).json({ message: "Not authorized" })
    }

    if (!req.user.kifleketema || !req.user.wereda) {
      return res.status(403).json({ message: "Administrator location not set" })
    }

    const office = await Office.findById(req.params.id)

    if (!office) {
      return res.status(404).json({ message: "Office not found" })
    }

    // Ensure the office is in the admin's wereda
    if (office.kifleketema !== req.user.kifleketema || Number(office.wereda) !== Number(req.user.wereda)) {
      return res.status(403).json({
        message: "Not authorized to update offices outside your wereda",
        adminLocation: { kifleketema: req.user.kifleketema, wereda: req.user.wereda },
        officeLocation: { kifleketema: office.kifleketema, wereda: office.wereda },
      })
    }

    const { morningStatus, afternoonStatus, status } = req.body

    // Update availability
    if (morningStatus) office.morningStatus = morningStatus
    if (afternoonStatus) office.afternoonStatus = afternoonStatus
    if (status) office.status = status

    office.updatedAt = Date.now()
    office.updatedBy = req.user.id

    await office.save()

    res.json({
      message: "Office availability updated successfully",
      office,
    })
  } catch (err) {
    console.error("Update office availability error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   DELETE api/offices/:id
// @desc    Delete an office
// @access  Private (Admin only)
router.delete("/:id", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const office = await Office.findById(req.params.id)

    if (!office) {
      return res.status(404).json({ message: "Office not found" })
    }

    // For wereda admins, ensure they can only delete offices in their wereda
    if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      if (!req.user.kifleketema || !req.user.wereda) {
        return res.status(403).json({ message: "Administrator location not set" })
      }

      // Ensure the office is in the admin's wereda
      if (office.kifleketema !== req.user.kifleketema || Number(office.wereda) !== Number(req.user.wereda)) {
        return res.status(403).json({ message: "Not authorized to delete offices outside your wereda" })
      }
    }

    await Office.findByIdAndDelete(req.params.id)

    res.json({ message: "Office removed" })
  } catch (err) {
    console.error("Delete office error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
