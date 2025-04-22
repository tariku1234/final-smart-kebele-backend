const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const Complaint = require("../models/Complaint")
const User = require("../models/User")
const OfficePerformance = require("../models/OfficePerformance")
const auth = require("../middleware/auth")
const {
  USER_ROLES,
  COMPLAINT_STAGES,
  COMPLAINT_HANDLERS,
  COMPLAINT_STATUS,
  ESCALATION_TIMEFRAMES,
} = require("../config/constants")

// @route   GET api/complaints/dashboard/stats
// @desc    Get complaint statistics for dashboard
// @access  Private (Admin only)
router.get("/dashboard/stats", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const query = {}

    // Filter based on user role
    if (req.user.role === USER_ROLES.STAKEHOLDER_OFFICE) {
      // Stakeholder offices can only see complaints directed to them
      query.stakeholderOffice = req.user.id
    } else if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      // Wereda officers can only see complaints at their level and in their wereda
      query.$or = [
        { currentHandler: COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION },
        {
          currentStage: { $in: [COMPLAINT_STAGES.WEREDA_FIRST, COMPLAINT_STAGES.WEREDA_SECOND] },
        },
      ]

      // Only add location filters if they exist
      if (req.user.kifleketema) {
        query.$or.forEach((condition) => {
          condition.kifleketema = req.user.kifleketema
        })
      }

      if (req.user.wereda) {
        query.$or.forEach((condition) => {
          condition.wereda = req.user.wereda
        })
      }
    } else if (req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION) {
      // Kifleketema officers can only see complaints at their level and in their kifleketema
      query.$or = [
        { currentHandler: COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION },
        {
          currentStage: { $in: [COMPLAINT_STAGES.KIFLEKETEMA_FIRST, COMPLAINT_STAGES.KIFLEKETEMA_SECOND] },
        },
      ]

      // Only add kifleketema filter if it exists
      if (req.user.kifleketema) {
        query.$or.forEach((condition) => {
          condition.kifleketema = req.user.kifleketema
        })
      }
    }
    // Kentiba Biro can see all complaints

    // Get counts for each status
    const total = await Complaint.countDocuments(query)
    const pending = await Complaint.countDocuments({ ...query, status: COMPLAINT_STATUS.PENDING })
    const inProgress = await Complaint.countDocuments({ ...query, status: COMPLAINT_STATUS.IN_PROGRESS })
    const resolved = await Complaint.countDocuments({ ...query, status: COMPLAINT_STATUS.RESOLVED })
    const escalated = await Complaint.countDocuments({ ...query, status: COMPLAINT_STATUS.ESCALATED })

    res.json({
      stats: {
        total,
        pending,
        inProgress,
        resolved,
        escalated,
      },
    })
  } catch (err) {
    console.error("Get complaint stats error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/complaints")
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (extname && mimetype) {
      return cb(null, true)
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, and DOCX files are allowed."))
    }
  },
})

// @route   POST api/complaints
// @desc    Create a new complaint (first stage) or update existing complaint to second stage
// @access  Private (Citizen only)
router.post("/", auth, upload.array("attachments", 5), async (req, res) => {
  try {
    // Check if user is a citizen
    if (req.user.role !== USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Only citizens can submit complaints" })
    }

    const {
      title,
      description,
      officeType, // Now receiving office type instead of stakeholderOfficeId
      location,
      kifleketema,
      wereda,
      isSecondStage,
      originalComplaintId,
      additionalDetails,
    } = req.body

    // Validate required fields
    if (!title || !description || !officeType || !location || !kifleketema || !wereda) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // Check if this is a second stage submission
    if (isSecondStage === "true" && originalComplaintId) {
      // Verify original complaint exists, belongs to the user, and has a response
      const complaint = await Complaint.findOne({
        _id: originalComplaintId,
        user: req.user.id,
      })

      if (!complaint) {
        return res.status(404).json({
          message: "Original complaint not found or does not belong to you.",
        })
      }

      // Check if the complaint is in the correct stage and has a response
      const isFirstStage = [
        COMPLAINT_STAGES.STAKEHOLDER_FIRST,
        COMPLAINT_STAGES.WEREDA_FIRST,
        COMPLAINT_STAGES.KIFLEKETEMA_FIRST,
      ].includes(complaint.currentStage)

      const hasResponse =
        complaint.responses && complaint.responses.some((r) => r.responderRole === complaint.currentHandler)

      if (!isFirstStage || !hasResponse) {
        return res.status(400).json({
          message:
            "This complaint is not eligible for a second stage submission. It must be in first stage and have a response from the current handler.",
        })
      }

      // Determine the next stage based on current stage
      let nextStage, nextHandler, dueDateField, dueDate
      const now = new Date()

      if (complaint.currentStage === COMPLAINT_STAGES.STAKEHOLDER_FIRST) {
        nextStage = COMPLAINT_STAGES.STAKEHOLDER_SECOND
        nextHandler = COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE
        dueDateField = "stakeholderSecondResponseDue"
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.STAKEHOLDER_RESPONSE)
      } else if (complaint.currentStage === COMPLAINT_STAGES.WEREDA_FIRST) {
        nextStage = COMPLAINT_STAGES.WEREDA_SECOND
        nextHandler = COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
        dueDateField = "weredaSecondResponseDue"
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.WEREDA_RESPONSE)
      } else if (complaint.currentStage === COMPLAINT_STAGES.KIFLEKETEMA_FIRST) {
        nextStage = COMPLAINT_STAGES.KIFLEKETEMA_SECOND
        nextHandler = COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
        dueDateField = "kifleketemaSecondResponseDue"
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.KIFLEKETEMA_RESPONSE)
      }

      // Update the existing complaint with second stage information
      complaint.currentStage = nextStage
      complaint.currentHandler = nextHandler
      complaint.status = COMPLAINT_STATUS.PENDING
      complaint.additionalDetails = additionalDetails || ""
      complaint.updatedAt = now

      // Set due date
      complaint[dueDateField] = dueDate

      // Add new attachments if any
      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map((file) => file.path)
        complaint.attachments = [...complaint.attachments, ...newAttachments]
      }

      // Add to escalation history
      if (nextHandler !== complaint.currentHandler) {
        complaint.escalationHistory.push({
          from: complaint.currentHandler,
          to: nextHandler,
          reason: "Escalated to next level by citizen",
          date: now,
        })
      } else {
        // We're just moving to second stage within the same office, no need for escalation history
        console.log(`Moving to second stage within ${nextHandler}`)
      }

      await complaint.save()

      // Update office performance metrics
      let officePerformance = await OfficePerformance.findOne({
        office: complaint.stakeholderOffice,
        officeRole: nextHandler,
      })

      if (!officePerformance) {
        officePerformance = new OfficePerformance({
          office: complaint.stakeholderOffice,
          officeRole: nextHandler,
        })
      }

      officePerformance.updatedAt = new Date()
      await officePerformance.save()

      res.status(200).json({
        message: "Complaint updated to second stage successfully",
        complaint,
      })
    } else {
      // Regular first stage complaint submission
      // Find the appropriate stakeholder office based on office type, kifleketema, and wereda
      const stakeholderOffice = await User.findOne({
        officeType: officeType,
        kifleketema: kifleketema,
        wereda: Number.parseInt(wereda),
        role: USER_ROLES.STAKEHOLDER_OFFICE,
        isApproved: true,
      })

      if (!stakeholderOffice) {
        return res.status(404).json({
          message: `No approved ${officeType.replace(/_/g, " ")} office found in ${kifleketema.replace(/_/g, " ")} Wereda ${wereda}`,
        })
      }

      // Create new complaint
      const complaint = new Complaint({
        user: req.user.id,
        title,
        description,
        stakeholderOffice: stakeholderOffice._id,
        kifleketema,
        wereda: Number.parseInt(wereda),
        currentStage: COMPLAINT_STAGES.STAKEHOLDER_FIRST,
        currentHandler: COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE,
        status: COMPLAINT_STATUS.PENDING,
        location,
      })

      // Add attachments if any
      if (req.files && req.files.length > 0) {
        complaint.attachments = req.files.map((file) => file.path)
      }

      // Set due dates
      const now = new Date()
      complaint.stakeholderFirstResponseDue = new Date(now.getTime() + ESCALATION_TIMEFRAMES.STAKEHOLDER_RESPONSE)

      await complaint.save()

      // Update office performance metrics
      let officePerformance = await OfficePerformance.findOne({
        office: stakeholderOffice._id,
        officeRole: COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE,
      })

      if (!officePerformance) {
        officePerformance = new OfficePerformance({
          office: stakeholderOffice._id,
          officeRole: COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE,
        })
      }

      officePerformance.totalComplaints += 1
      officePerformance.updatedAt = new Date()
      await officePerformance.save()

      res.status(201).json({
        message: "Complaint submitted successfully",
        complaint,
      })
    }
  } catch (err) {
    console.error("Create complaint error:", err)
    res.status(500).json({ message: "Server error: " + err.message })
  }
})

// @route   GET api/complaints
// @desc    Get complaints based on user role
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    console.log("User role:", req.user.role)
    console.log("User details:", {
      id: req.user.id,
      kifleketema: req.user.kifleketema,
      wereda: req.user.wereda,
    })
    console.log("Query params:", req.query)

    const query = {}

    // Filter based on user role
    if (req.user.role === USER_ROLES.CITIZEN) {
      // Citizens can only see their own complaints
      query.user = req.user.id
    } else if (req.user.role === USER_ROLES.STAKEHOLDER_OFFICE) {
      // Stakeholder offices can only see complaints directed to them
      query.stakeholderOffice = req.user.id
    } else if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION) {
      // Wereda officers can see complaints at their level or with their handler
      query.$or = [
        { currentHandler: COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION },
        { currentStage: { $in: [COMPLAINT_STAGES.WEREDA_FIRST, COMPLAINT_STAGES.WEREDA_SECOND] } },
      ]

      // Only add location filters if they exist
      if (req.user.kifleketema) {
        query.$or.forEach((condition) => {
          condition.kifleketema = req.user.kifleketema
        })
      }

      if (req.user.wereda) {
        query.$or.forEach((condition) => {
          condition.wereda = req.user.wereda
        })
      }
    } else if (req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION) {
      // Kifleketema officers can see complaints at their level or with their handler
      query.$or = [
        { currentHandler: COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION },
        { currentStage: { $in: [COMPLAINT_STAGES.KIFLEKETEMA_FIRST, COMPLAINT_STAGES.KIFLEKETEMA_SECOND] } },
      ]

      // Only add kifleketema filter if it exists
      if (req.user.kifleketema) {
        query.$or.forEach((condition) => {
          condition.kifleketema = req.user.kifleketema
        })
      }
    } else if (req.user.role === USER_ROLES.KENTIBA_BIRO) {
      // Kentiba Biro can see all complaints
      // No additional filters needed
      query.$or = [{ currentHandler: COMPLAINT_HANDLERS.KENTIBA_BIRO }, { currentStage: COMPLAINT_STAGES.KENTIBA }]
    }

    // Filter by status if provided
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status
    }

    console.log("Final query:", JSON.stringify(query, null, 2))

    // Pagination
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    const complaints = await Complaint.find(query)
      .populate("user", "firstName lastName email")
      .populate("stakeholderOffice", "officeName officeType")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)

    console.log("Found complaints:", complaints.length)

    // Debug: Log the complaints that were found
    if (complaints.length > 0) {
      console.log(
        "Complaint stages:",
        complaints.map((c) => ({
          id: c._id,
          stage: c.currentStage,
          handler: c.currentHandler,
          status: c.status,
        })),
      )
    }

    const total = await Complaint.countDocuments(query)

    res.json({
      complaints,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error("Get complaints error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/complaints/:id
// @desc    Get complaint by ID
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate("user", "firstName lastName email phone")
      .populate("stakeholderOffice", "officeName officeType officeAddress officePhone")
      .populate("responses.responder", "firstName lastName officeName")
      .populate("resolution.resolvedBy", "firstName lastName officeName")

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }

    // Check if user has permission to view this complaint
    let hasPermission = false

    if (req.user.role === USER_ROLES.CITIZEN && complaint.user._id.toString() === req.user.id) {
      // Citizens can view their own complaints
      hasPermission = true
    } else if (
      req.user.role === USER_ROLES.STAKEHOLDER_OFFICE &&
      complaint.stakeholderOffice._id.toString() === req.user.id
    ) {
      // Stakeholder offices can view complaints directed to them
      hasPermission = true
    } else if (
      req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION &&
      (complaint.currentHandler === COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION ||
        [COMPLAINT_STAGES.WEREDA_FIRST, COMPLAINT_STAGES.WEREDA_SECOND].includes(complaint.currentStage))
    ) {
      // Wereda officers can view complaints at their level
      // Only check location if user has location data
      if (req.user.kifleketema && req.user.wereda) {
        hasPermission = complaint.kifleketema === req.user.kifleketema && complaint.wereda === req.user.wereda
      } else {
        hasPermission = true // If no location data, allow access
      }
    } else if (
      req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION &&
      (complaint.currentHandler === COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION ||
        [COMPLAINT_STAGES.KIFLEKETEMA_FIRST, COMPLAINT_STAGES.KIFLEKETEMA_SECOND].includes(complaint.currentStage))
    ) {
      // Kifleketema officers can view complaints at their level
      // Only check location if user has location data
      if (req.user.kifleketema) {
        hasPermission = complaint.kifleketema === req.user.kifleketema
      } else {
        hasPermission = true // If no location data, allow access
      }
    } else if (req.user.role === USER_ROLES.KENTIBA_BIRO) {
      // Kentiba Biro can view all complaints
      hasPermission = true
    }

    if (!hasPermission) {
      return res.status(403).json({ message: "Not authorized to view this complaint" })
    }

    res.json({ complaint })
  } catch (err) {
    console.error("Get complaint error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/complaints/:id/accept
// @desc    Accept a response and resolve the complaint
// @access  Private (Citizen only)
router.post("/:id/accept", auth, async (req, res) => {
  try {
    // Check if user is a citizen
    if (req.user.role !== USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Only citizens can accept responses" })
    }

    const complaint = await Complaint.findById(req.params.id)

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }

    // Check if the complaint belongs to the user
    if (complaint.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    // Check if the complaint has at least one response
    if (!complaint.responses || complaint.responses.length === 0) {
      return res.status(400).json({ message: "Cannot accept a complaint with no responses" })
    }

    // Update complaint status to resolved
    complaint.status = COMPLAINT_STATUS.RESOLVED

    // Add resolution details
    const latestResponse = complaint.responses[complaint.responses.length - 1]
    complaint.resolution = {
      resolvedBy: latestResponse.responder,
      resolverRole: latestResponse.responderRole,
      resolution: latestResponse.response,
      resolvedAt: new Date(),
    }

    complaint.updatedAt = new Date()
    await complaint.save()

    // Update office performance metrics if applicable
    if (latestResponse.responder) {
      const officeId = latestResponse.responder
      const officeRole = latestResponse.responderRole

      let officePerformance = await OfficePerformance.findOne({
        office: officeId,
        officeRole,
      })

      if (!officePerformance) {
        officePerformance = new OfficePerformance({
          office: officeId,
          officeRole,
        })
      }

      officePerformance.resolvedComplaints += 1

      // Calculate average resolution time
      const submittedAt = new Date(complaint.submittedAt)
      const resolvedAt = new Date()
      const resolutionTime = (resolvedAt - submittedAt) / (1000 * 60 * 60 * 24) // in days

      if (officePerformance.averageResolutionTime === 0) {
        officePerformance.averageResolutionTime = resolutionTime
      } else {
        officePerformance.averageResolutionTime =
          (officePerformance.averageResolutionTime * (officePerformance.resolvedComplaints - 1) + resolutionTime) /
          officePerformance.resolvedComplaints
      }

      officePerformance.updatedAt = new Date()
      await officePerformance.save()
    }

    res.json({
      message: "Response accepted and complaint resolved",
      complaint,
    })
  } catch (err) {
    console.error("Accept response error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/complaints/:id/escalate
// @desc    Escalate a complaint to the next stage
// @access  Private (Citizen only)
router.post("/:id/escalate", auth, async (req, res) => {
  try {
    // Check if user is a citizen
    if (req.user.role !== USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Only citizens can escalate complaints" })
    }

    const complaint = await Complaint.findById(req.params.id)

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }

    // Check if the complaint belongs to the user
    if (complaint.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" })
    }

    // Check if the complaint can be escalated
    if (complaint.status === COMPLAINT_STATUS.RESOLVED) {
      return res.status(400).json({ message: "Cannot escalate a resolved complaint" })
    }

    const now = new Date()
    let canEscalate = false
    let nextStage = ""
    let nextHandler = ""
    let fromStage = ""
    let toStage = ""
    let dueDateField = ""

    // Determine if the complaint can be escalated based on current stage and due date
    switch (complaint.currentStage) {
      case COMPLAINT_STAGES.STAKEHOLDER_FIRST:
        // Check if response due date has passed and no response yet
        if (now > complaint.stakeholderFirstResponseDue && complaint.status !== COMPLAINT_STATUS.IN_PROGRESS) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.STAKEHOLDER_SECOND
          nextHandler = COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE
          dueDateField = "stakeholderSecondResponseDue"
        }
        break

      case COMPLAINT_STAGES.STAKEHOLDER_SECOND:
        // Check if response due date has passed or there's a response but still unresolved
        if (
          now > complaint.stakeholderSecondResponseDue ||
          (complaint.responses.length > 1 && complaint.status === COMPLAINT_STATUS.IN_PROGRESS)
        ) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.WEREDA_FIRST
          nextHandler = COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
          fromStage = COMPLAINT_STAGES.STAKEHOLDER_SECOND
          toStage = COMPLAINT_STAGES.WEREDA_FIRST
          dueDateField = "weredaFirstResponseDue"
        }
        break

      case COMPLAINT_STAGES.WEREDA_FIRST:
        // Check if response due date has passed and no response yet
        if (now > complaint.weredaFirstResponseDue && complaint.status !== COMPLAINT_STATUS.IN_PROGRESS) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.WEREDA_SECOND
          nextHandler = COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
          dueDateField = "weredaSecondResponseDue"
        }
        break

      case COMPLAINT_STAGES.WEREDA_SECOND:
        // Check if response due date has passed or there's a response but still unresolved
        if (
          now > complaint.weredaSecondResponseDue ||
          (complaint.responses.length > 3 && complaint.status === COMPLAINT_STATUS.IN_PROGRESS)
        ) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.KIFLEKETEMA_FIRST
          nextHandler = COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
          fromStage = COMPLAINT_STAGES.WEREDA_SECOND
          toStage = COMPLAINT_STAGES.KIFLEKETEMA_FIRST
          dueDateField = "kifleketemaFirstResponseDue"
        }
        break

      case COMPLAINT_STAGES.KIFLEKETEMA_FIRST:
        // Check if response due date has passed and no response yet
        if (now > complaint.kifleketemaFirstResponseDue && complaint.status !== COMPLAINT_STATUS.IN_PROGRESS) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.KIFLEKETEMA_SECOND
          nextHandler = COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
          dueDateField = "kifleketemaSecondResponseDue"
        }
        break

      case COMPLAINT_STAGES.KIFLEKETEMA_SECOND:
        // Check if response due date has passed or there's a response but still unresolved
        if (
          now > complaint.kifleketemaSecondResponseDue ||
          (complaint.responses.length > 5 && complaint.status === COMPLAINT_STATUS.IN_PROGRESS)
        ) {
          canEscalate = true
          nextStage = COMPLAINT_STAGES.KENTIBA
          nextHandler = COMPLAINT_HANDLERS.KENTIBA_BIRO
          fromStage = COMPLAINT_STAGES.KIFLEKETEMA_SECOND
          toStage = COMPLAINT_STAGES.KENTIBA
        }
        break

      case COMPLAINT_STAGES.KENTIBA:
        return res.status(400).json({ message: "Complaint is already at the final stage" })
    }

    if (!canEscalate) {
      return res.status(400).json({
        message:
          "Cannot escalate at this time. Please wait for the response due date or a response from the current handler.",
      })
    }

    // Update complaint
    complaint.currentStage = nextStage
    complaint.currentHandler = nextHandler
    complaint.status = COMPLAINT_STATUS.PENDING // Set to pending for the new handler
    complaint.updatedAt = now

    // Set new due date if applicable
    if (dueDateField) {
      let dueDate

      if (nextHandler === COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE) {
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.STAKEHOLDER_RESPONSE)
      } else if (nextHandler === COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION) {
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.WEREDA_RESPONSE)
      } else if (nextHandler === COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION) {
        dueDate = new Date(now.getTime() + ESCALATION_TIMEFRAMES.KIFLEKETEMA_RESPONSE)
      }

      complaint[dueDateField] = dueDate
    }

    // Add to escalation history if moving to a new handler
    if (fromStage && toStage) {
      const reason = req.body.reason || "Escalated due to unresolved complaint"

      // Fix the from handler to correctly reflect the previous handler
      let fromHandler
      if (fromStage.includes("stakeholder")) {
        fromHandler = COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE
      } else if (fromStage.includes("wereda")) {
        fromHandler = COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
      } else if (fromStage.includes("kifleketema")) {
        fromHandler = COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
      }

      complaint.escalationHistory.push({
        from: fromHandler,
        to: nextHandler,
        reason,
        date: now,
      })

      // Record failure for the office
      let officeId
      let officeRole

      if (fromStage === COMPLAINT_STAGES.STAKEHOLDER_SECOND) {
        officeId = complaint.stakeholderOffice
        officeRole = COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE
      } else if (fromStage === COMPLAINT_STAGES.WEREDA_SECOND) {
        // Find a Wereda officer in the same kifleketema and wereda
        const weredaOfficer = await User.findOne({
          role: USER_ROLES.WEREDA_ANTI_CORRUPTION,
          kifleketema: complaint.kifleketema,
          wereda: complaint.wereda,
        })
        if (weredaOfficer) {
          officeId = weredaOfficer._id
          officeRole = COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
        }
      } else if (fromStage === COMPLAINT_STAGES.KIFLEKETEMA_SECOND) {
        // Find a Kifleketema officer in the same kifleketema
        const kifleketemaOfficer = await User.findOne({
          role: USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION,
          kifleketema: complaint.kifleketema,
        })
        if (kifleketemaOfficer) {
          officeId = kifleketemaOfficer._id
          officeRole = COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
        }
      }

      if (officeId && officeRole) {
        let officePerformance = await OfficePerformance.findOne({
          office: officeId,
          officeRole,
        })

        if (!officePerformance) {
          officePerformance = new OfficePerformance({
            office: officeId,
            officeRole,
          })
        }

        officePerformance.escalatedComplaints += 1
        officePerformance.failureRecords.push({
          complaint: complaint._id,
          escalatedFrom: fromStage,
          escalatedTo: toStage,
          reason,
          date: now,
        })

        officePerformance.updatedAt = now
        await officePerformance.save()
      }
    } else {
      // Add to escalation history even for same handler escalations (like first to second stage)
      const reason = req.body.reason || "Escalated to next stage"

      complaint.escalationHistory.push({
        from: complaint.currentHandler,
        to: nextHandler,
        reason,
        date: now,
      })
    }

    // Log the escalation for debugging
    console.log(`Escalating complaint ${complaint._id} from ${complaint.currentStage} to ${nextStage}`)
    console.log(`New handler: ${nextHandler}`)

    await complaint.save()

    res.json({
      message: "Complaint escalated successfully",
      complaint,
    })
  } catch (err) {
    console.error("Escalate complaint error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/complaints/:id/respond
// @desc    Respond to a complaint
// @access  Private (Office handlers only)
router.post("/:id/respond", auth, async (req, res) => {
  try {
    const { response, internalComment } = req.body
    // Remove status from the request body - only citizens can change status

    // Check if user has the right role to respond
    if (
      ![
        USER_ROLES.STAKEHOLDER_OFFICE,
        USER_ROLES.WEREDA_ANTI_CORRUPTION,
        USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION,
        USER_ROLES.KENTIBA_BIRO,
      ].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Not authorized to respond to complaints" })
    }

    const complaint = await Complaint.findById(req.params.id)

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }

    // Check if the user is the current handler
    let isAuthorized = false

    if (
      req.user.role === USER_ROLES.STAKEHOLDER_OFFICE &&
      complaint.currentHandler === COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE &&
      complaint.stakeholderOffice.toString() === req.user.id
    ) {
      isAuthorized = true
    } else if (
      req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION &&
      complaint.currentHandler === COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION
    ) {
      // For Wereda officers, check location only if user has location data
      if (req.user.kifleketema && req.user.wereda) {
        isAuthorized = complaint.kifleketema === req.user.kifleketema && complaint.wereda === req.user.wereda
      } else {
        isAuthorized = true // If no location data, allow access
      }
    } else if (
      req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION &&
      complaint.currentHandler === COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION
    ) {
      // For Kifleketema officers, check location only if user has location data
      if (req.user.kifleketema) {
        isAuthorized = complaint.kifleketema === req.user.kifleketema
      } else {
        isAuthorized = true // If no location data, allow access
      }
    } else if (
      req.user.role === USER_ROLES.KENTIBA_BIRO &&
      complaint.currentHandler === COMPLAINT_HANDLERS.KENTIBA_BIRO
    ) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: "Not authorized to respond to this complaint" })
    }

    // Check if a response already exists for the current stage
    const hasExistingResponse = complaint.responses.some(
      (resp) =>
        resp.stage === complaint.currentStage ||
        (resp.responderRole === complaint.currentHandler &&
          !resp.stage && // For older responses without stage field
          complaint.currentStage === COMPLAINT_STAGES.STAKEHOLDER_SECOND &&
          complaint.responses.filter((r) => r.responderRole === COMPLAINT_HANDLERS.STAKEHOLDER_OFFICE).length > 1) ||
        (complaint.currentStage === COMPLAINT_STAGES.WEREDA_SECOND &&
          complaint.responses.filter((r) => r.responderRole === COMPLAINT_HANDLERS.WEREDA_ANTI_CORRUPTION).length >
            1) ||
        (complaint.currentStage === COMPLAINT_STAGES.KIFLEKETEMA_SECOND &&
          complaint.responses.filter((r) => r.responderRole === COMPLAINT_HANDLERS.KIFLEKETEMA_ANTI_CORRUPTION).length >
            1),
    )

    console.log(`Current stage: ${complaint.currentStage}, Has existing response: ${hasExistingResponse}`)

    if (hasExistingResponse) {
      return res.status(400).json({
        message: "A response has already been submitted for this stage of the complaint",
      })
    }

    // Add response - always set status to "in_progress" when an admin responds
    // Only citizens can change to "resolved" or "escalated"
    complaint.responses.push({
      responder: req.user.id,
      responderRole: complaint.currentHandler,
      response,
      status: COMPLAINT_STATUS.IN_PROGRESS, // Always set to in_progress
      internalComment,
      stage: complaint.currentStage, // Add the current stage to the response
      createdAt: new Date(),
    })

    // Update complaint status to in_progress
    complaint.status = COMPLAINT_STATUS.IN_PROGRESS
    complaint.updatedAt = new Date()

    await complaint.save()

    res.json({
      message: "Response submitted successfully",
      complaint,
    })
  } catch (err) {
    console.error("Respond to complaint error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
