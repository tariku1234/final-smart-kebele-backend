const express = require("express")
const router = express.Router()
const Complaint = require("../models/Complaint")
const User = require("../models/User")
const OfficePerformance = require("../models/OfficePerformance")
const auth = require("../middleware/auth")
const { USER_ROLES, COMPLAINT_STATUS } = require("../config/constants")

// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date()
  const startDate = new Date()

  switch (period) {
    case "daily":
      startDate.setHours(0, 0, 0, 0) // Start of today
      break
    case "weekly":
      startDate.setDate(now.getDate() - 7) // 7 days ago
      break
    case "monthly":
      startDate.setMonth(now.getMonth() - 1) // 1 month ago
      break
    case "quarterly":
      startDate.setMonth(now.getMonth() - 3) // 3 months ago
      break
    case "yearly":
      startDate.setFullYear(now.getFullYear() - 1) // 1 year ago
      break
    default:
      startDate.setFullYear(2000) // Default to all time
  }

  return { startDate, endDate: now }
}

// @route   GET api/reports/complaints
// @desc    Get comprehensive complaint statistics with filters
// @access  Private (Admin roles only)
router.get("/complaints", auth, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized to access reports" })
    }

    // Extract query parameters
    const {
      period = "all",
      kifleketema,
      wereda,
      officeType,
      startDate: customStartDate,
      endDate: customEndDate,
    } = req.query

    // Build query object
    const query = {}

    // Apply date filters
    if (customStartDate && customEndDate) {
      // Custom date range if provided
      query.submittedAt = {
        $gte: new Date(customStartDate),
        $lte: new Date(customEndDate),
      }
    } else {
      // Predefined period
      const { startDate, endDate } = getDateRange(period)
      query.submittedAt = { $gte: startDate, $lte: endDate }
    }

    // Apply location filters
    if (kifleketema) {
      query.kifleketema = kifleketema
    }

    if (wereda) {
      query.wereda = Number(wereda)
    }

    // Apply office type filter if provided
    if (officeType) {
      // Find stakeholder offices of the specified type
      const stakeholderOffices = await User.find({
        officeType,
        role: USER_ROLES.STAKEHOLDER_OFFICE,
      }).select("_id")

      if (stakeholderOffices.length > 0) {
        query.stakeholderOffice = {
          $in: stakeholderOffices.map((office) => office._id),
        }
      } else {
        // No matching offices found
        return res.json({
          totalComplaints: 0,
          statusBreakdown: {
            pending: 0,
            inProgress: 0,
            resolved: 0,
            escalated: 0,
          },
          stageBreakdown: {},
          handlerBreakdown: {},
          timelineData: [],
          kifleketemaBreakdown: {},
          weredaBreakdown: {},
          officeTypeBreakdown: {},
        })
      }
    }

    // Apply role-based restrictions
    if (req.user.role === USER_ROLES.STAKEHOLDER_OFFICE) {
      query.stakeholderOffice = req.user.id
    } else if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION && req.user.kifleketema && req.user.wereda) {
      query.kifleketema = req.user.kifleketema
      query.wereda = Number(req.user.wereda)
    } else if (req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION && req.user.kifleketema) {
      query.kifleketema = req.user.kifleketema
    }

    console.log("Report query:", JSON.stringify(query, null, 2))

    // Get all complaints matching the query
    const complaints = await Complaint.find(query).populate("stakeholderOffice", "officeName officeType").lean()

    // Calculate total complaints
    const totalComplaints = complaints.length

    // Status breakdown
    const statusBreakdown = {
      pending: 0,
      inProgress: 0,
      resolved: 0,
      escalated: 0,
    }

    // Stage breakdown
    const stageBreakdown = {}

    // Handler breakdown
    const handlerBreakdown = {}

    // Kifleketema breakdown
    const kifleketemaBreakdown = {}

    // Wereda breakdown
    const weredaBreakdown = {}

    // Office type breakdown
    const officeTypeBreakdown = {}

    // Timeline data (complaints per day)
    const timelineData = []
    const dateMap = new Map()

    // Process each complaint
    complaints.forEach((complaint) => {
      // Status breakdown
      statusBreakdown[complaint.status]++

      // Stage breakdown
      if (!stageBreakdown[complaint.currentStage]) {
        stageBreakdown[complaint.currentStage] = 0
      }
      stageBreakdown[complaint.currentStage]++

      // Handler breakdown
      if (!handlerBreakdown[complaint.currentHandler]) {
        handlerBreakdown[complaint.currentHandler] = 0
      }
      handlerBreakdown[complaint.currentHandler]++

      // Kifleketema breakdown
      const kifleketemaName = complaint.kifleketema.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      if (!kifleketemaBreakdown[kifleketemaName]) {
        kifleketemaBreakdown[kifleketemaName] = 0
      }
      kifleketemaBreakdown[kifleketemaName]++

      // Wereda breakdown
      const weredaKey = `Wereda ${complaint.wereda}`
      if (!weredaBreakdown[weredaKey]) {
        weredaBreakdown[weredaKey] = 0
      }
      weredaBreakdown[weredaKey]++

      // Office type breakdown
      if (complaint.stakeholderOffice && complaint.stakeholderOffice.officeType) {
        const officeType = complaint.stakeholderOffice.officeType
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase())
        if (!officeTypeBreakdown[officeType]) {
          officeTypeBreakdown[officeType] = 0
        }
        officeTypeBreakdown[officeType]++
      }

      // Timeline data
      const submittedDate = new Date(complaint.submittedAt).toISOString().split("T")[0]
      if (!dateMap.has(submittedDate)) {
        dateMap.set(submittedDate, 0)
      }
      dateMap.set(submittedDate, dateMap.get(submittedDate) + 1)
    })

    // Convert timeline data map to array
    dateMap.forEach((count, date) => {
      timelineData.push({ date, count })
    })

    // Sort timeline data by date
    timelineData.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Calculate average resolution time
    let totalResolutionTime = 0
    let resolvedCount = 0

    complaints.forEach((complaint) => {
      if (complaint.status === COMPLAINT_STATUS.RESOLVED && complaint.resolution && complaint.resolution.resolvedAt) {
        const submittedAt = new Date(complaint.submittedAt)
        const resolvedAt = new Date(complaint.resolution.resolvedAt)
        const resolutionTime = (resolvedAt - submittedAt) / (1000 * 60 * 60 * 24) // in days
        totalResolutionTime += resolutionTime
        resolvedCount++
      }
    })

    const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0

    // Calculate escalation rate
    const escalationRate = totalComplaints > 0 ? (statusBreakdown.escalated / totalComplaints) * 100 : 0

    // Return the compiled statistics
    res.json({
      totalComplaints,
      statusBreakdown,
      stageBreakdown,
      handlerBreakdown,
      timelineData,
      kifleketemaBreakdown,
      weredaBreakdown,
      officeTypeBreakdown,
      averageResolutionTime,
      escalationRate,
    })
  } catch (err) {
    console.error("Report generation error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/reports/performance
// @desc    Get office performance metrics
// @access  Private (Admin roles only)
router.get("/performance", auth, async (req, res) => {
  try {
    // Check if user has admin role
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized to access reports" })
    }

    // Extract query parameters
    const { kifleketema, wereda, officeType } = req.query

    // Build query object
    const query = {}

    // Apply filters for office lookup
    const officeQuery = {}

    if (kifleketema) {
      officeQuery.kifleketema = kifleketema
    }

    if (wereda) {
      officeQuery.wereda = Number(wereda)
    }

    if (officeType) {
      officeQuery.officeType = officeType
    }

    // Apply role-based restrictions
    if (req.user.role === USER_ROLES.STAKEHOLDER_OFFICE) {
      officeQuery._id = req.user.id
    } else if (req.user.role === USER_ROLES.WEREDA_ANTI_CORRUPTION && req.user.kifleketema && req.user.wereda) {
      officeQuery.kifleketema = req.user.kifleketema
      officeQuery.wereda = Number(req.user.wereda)
    } else if (req.user.role === USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION && req.user.kifleketema) {
      officeQuery.kifleketema = req.user.kifleketema
    }

    // Find offices matching the criteria
    const offices = await User.find({
      ...officeQuery,
      role: { $ne: USER_ROLES.CITIZEN }, // Exclude citizens
    }).select("_id officeName officeType kifleketema wereda")

    if (offices.length === 0) {
      return res.json({ offices: [] })
    }

    // Get office IDs
    const officeIds = offices.map((office) => office._id)

    // Find performance metrics for these offices
    const performanceMetrics = await OfficePerformance.find({
      office: { $in: officeIds },
    }).populate("office", "officeName officeType kifleketema wereda")

    // Compile performance data
    const officePerformance = performanceMetrics.map((metric) => {
      const office = metric.office || {}

      return {
        officeId: metric.office?._id || "Unknown",
        officeName: office.officeName || "Unknown Office",
        officeType: office.officeType?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "Unknown Type",
        kifleketema: office.kifleketema?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "N/A",
        wereda: office.wereda || "N/A",
        totalComplaints: metric.totalComplaints || 0,
        resolvedComplaints: metric.resolvedComplaints || 0,
        escalatedComplaints: metric.escalatedComplaints || 0,
        averageResolutionTime: metric.averageResolutionTime || 0,
        responseRate:
          metric.totalComplaints > 0 ? ((metric.resolvedComplaints / metric.totalComplaints) * 100).toFixed(1) : 0,
        escalationRate:
          metric.totalComplaints > 0 ? ((metric.escalatedComplaints / metric.totalComplaints) * 100).toFixed(1) : 0,
      }
    })

    res.json({ offices: officePerformance })
  } catch (err) {
    console.error("Performance report error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
