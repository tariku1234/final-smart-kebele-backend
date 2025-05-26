const express = require("express")
const router = express.Router()
const Complaint = require("../models/Complaint")
const User = require("../models/User")
const OfficePerformance = require("../models/OfficePerformance")
const auth = require("../middleware/auth")
const { USER_ROLES } = require("../config/constants")

// Helper function to get effective status from office perspective
const getEffectiveStatusForOffice = (complaint, officeRole, officeId = null) => {
  // If complaint is resolved, it's resolved for everyone
  if (complaint.status === "resolved") {
    return "resolved"
  }

  // Check if complaint has been escalated away from this office's role
  if (officeRole === "stakeholder_office") {
    // For stakeholder offices, if current handler is not stakeholder, it's escalated
    if (complaint.currentHandler !== "stakeholder_office") {
      return "escalated"
    }
  } else if (officeRole === "wereda_anti_corruption") {
    // For wereda officers, if current handler is kifleketema or kentiba, it's escalated
    if (complaint.currentHandler === "kifleketema_anti_corruption" || complaint.currentHandler === "kentiba_biro") {
      return "escalated"
    }
  } else if (officeRole === "kifleketema_anti_corruption") {
    // For kifleketema officers, if current handler is kentiba, it's escalated
    if (complaint.currentHandler === "kentiba_biro") {
      return "escalated"
    }
  }

  // Otherwise, return the actual status
  return complaint.status
}

// Helper function to count complaints by effective status for an office
const countComplaintsByEffectiveStatus = (complaints, officeRole, officeId = null) => {
  const statusCounts = {
    pending: 0,
    in_progress: 0,
    resolved: 0,
    escalated: 0,
  }

  complaints.forEach((complaint) => {
    const effectiveStatus = getEffectiveStatusForOffice(complaint, officeRole, officeId)
    if (statusCounts.hasOwnProperty(effectiveStatus)) {
      statusCounts[effectiveStatus]++
    }
  })

  return statusCounts
}

// @route   GET api/reports/complaints
// @desc    Get complaint statistics for reports
// @access  Private (Admin only)
router.get("/complaints", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const { period, kifleketema, wereda, officeType, startDate, endDate } = req.query

    // Build query based on filters
    const query = {}
    let dateFilter = {}

    // Apply date filter based on period
    const now = new Date()
    switch (period) {
      case "daily":
        dateFilter = {
          submittedAt: {
            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
        }
        break
      case "weekly":
        dateFilter = {
          submittedAt: {
            $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case "monthly":
        dateFilter = {
          submittedAt: {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case "quarterly":
        dateFilter = {
          submittedAt: {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case "yearly":
        dateFilter = {
          submittedAt: {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case "custom":
        if (startDate && endDate) {
          dateFilter = {
            submittedAt: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1),
            },
          }
        }
        break
      default:
        // No date filter for "all"
        break
    }

    // Apply location filters
    if (kifleketema) {
      query.kifleketema = kifleketema
    }

    if (wereda) {
      query.wereda = Number.parseInt(wereda)
    }

    // Apply office type filter by finding stakeholder offices of that type
    if (officeType) {
      const stakeholderOffices = await User.find({
        role: USER_ROLES.STAKEHOLDER_OFFICE,
        officeType: officeType,
        isApproved: true,
      }).select("_id")

      if (stakeholderOffices.length > 0) {
        query.stakeholderOffice = {
          $in: stakeholderOffices.map((office) => office._id),
        }
      } else {
        // No offices of this type found, return empty results
        return res.json({
          totalComplaints: 0,
          statusBreakdown: {
            pending: 0,
            inProgress: 0,
            resolved: 0,
            escalated: 0,
          },
          kifleketemaBreakdown: {},
          officeTypeBreakdown: {},
          timelineData: [],
        })
      }
    }

    // Combine query with date filter
    const finalQuery = { ...query, ...dateFilter }

    console.log("Reports query:", JSON.stringify(finalQuery, null, 2))

    // Get total complaints
    const totalComplaints = await Complaint.countDocuments(finalQuery)

    // Get status breakdown - FIXED: Using correct status values
    const statusBreakdown = {
      pending: await Complaint.countDocuments({ ...finalQuery, status: "pending" }),
      inProgress: await Complaint.countDocuments({ ...finalQuery, status: "in_progress" }), // Fixed: was "in_progress"
      resolved: await Complaint.countDocuments({ ...finalQuery, status: "resolved" }),
      escalated: await Complaint.countDocuments({ ...finalQuery, status: "escalated" }),
    }

    console.log("Status breakdown:", statusBreakdown)

    // Get kifleketema breakdown
    const kifleketemaAggregation = await Complaint.aggregate([
      { $match: finalQuery },
      {
        $group: {
          _id: "$kifleketema",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    const kifleketemaBreakdown = {}
    kifleketemaAggregation.forEach((item) => {
      const displayName = item._id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      kifleketemaBreakdown[displayName] = item.count
    })

    // Get office type breakdown
    const officeTypeAggregation = await Complaint.aggregate([
      { $match: finalQuery },
      {
        $lookup: {
          from: "users",
          localField: "stakeholderOffice",
          foreignField: "_id",
          as: "office",
        },
      },
      { $unwind: "$office" },
      {
        $group: {
          _id: "$office.officeType",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    const officeTypeBreakdown = {}
    officeTypeAggregation.forEach((item) => {
      const displayName = item._id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
      officeTypeBreakdown[displayName] = item.count
    })

    // Get timeline data
    let timelineData = []
    if (period && period !== "all") {
      const timelineAggregation = await Complaint.aggregate([
        { $match: finalQuery },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "daily" ? "%Y-%m-%d" : "%Y-%m-%d",
                date: "$submittedAt",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])

      timelineData = timelineAggregation.map((item) => ({
        date: item._id,
        count: item.count,
      }))
    }

    res.json({
      totalComplaints,
      statusBreakdown,
      kifleketemaBreakdown,
      officeTypeBreakdown,
      timelineData,
    })
  } catch (err) {
    console.error("Get complaint reports error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/reports/performance
// @desc    Get comprehensive performance data for all administrator types
// @access  Private (Admin only)
router.get("/performance", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const { kifleketema, wereda, officeType } = req.query

    console.log("Performance query params:", { kifleketema, wereda, officeType })

    // Initialize performance data structure
    const performanceData = {
      stakeholderOffices: [],
      weredaAdministrators: [],
      kifleketemaAdministrators: [],
      kentibaBiro: [],
    }

    // 1. STAKEHOLDER OFFICES PERFORMANCE
    const stakeholderQuery = {
      role: USER_ROLES.STAKEHOLDER_OFFICE,
      isApproved: true,
    }

    if (kifleketema) stakeholderQuery.kifleketema = kifleketema
    if (wereda) stakeholderQuery.wereda = Number.parseInt(wereda)
    if (officeType) stakeholderQuery.officeType = officeType

    const stakeholderOffices = await User.find(stakeholderQuery).select("officeName officeType kifleketema wereda")

    for (const office of stakeholderOffices) {
      const allComplaints = await Complaint.find({
        stakeholderOffice: office._id,
      })

      const totalComplaints = allComplaints.length

      if (totalComplaints > 0) {
        // Calculate effective status counts from stakeholder perspective
        const statusCounts = countComplaintsByEffectiveStatus(allComplaints, "stakeholder_office", office._id)

        const complaintsWithResponses = await Complaint.countDocuments({
          stakeholderOffice: office._id,
          "responses.0": { $exists: true },
        })

        // Calculate average response time for stakeholder stage
        const stakeholderResponses = await Complaint.find({
          stakeholderOffice: office._id,
          "responses.responderRole": "stakeholder_office",
        }).select("submittedAt responses")

        let avgResponseTime = 0
        if (stakeholderResponses.length > 0) {
          const totalResponseTime = stakeholderResponses.reduce((sum, complaint) => {
            const stakeholderResponse = complaint.responses.find((r) => r.responderRole === "stakeholder_office")
            if (stakeholderResponse) {
              const responseTime =
                (new Date(stakeholderResponse.createdAt) - new Date(complaint.submittedAt)) / (1000 * 60 * 60 * 24)
              return sum + responseTime
            }
            return sum
          }, 0)
          avgResponseTime = totalResponseTime / stakeholderResponses.length
        }

        performanceData.stakeholderOffices.push({
          name: office.officeName,
          type: office.officeType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          kifleketema: office.kifleketema.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          wereda: office.wereda,
          totalComplaints,
          pendingComplaints: statusCounts.pending,
          inProgressComplaints: statusCounts.in_progress,
          resolvedComplaints: statusCounts.resolved,
          escalatedComplaints: statusCounts.escalated,
          responseRate: ((complaintsWithResponses / totalComplaints) * 100).toFixed(1),
          escalationRate: ((statusCounts.escalated / totalComplaints) * 100).toFixed(1),
          averageResponseTime: avgResponseTime.toFixed(1),
        })
      }
    }

    // 2. WEREDA ADMINISTRATORS PERFORMANCE
    const weredaQuery = {
      role: USER_ROLES.WEREDA_ANTI_CORRUPTION,
      isApproved: true,
    }

    if (kifleketema) weredaQuery.kifleketema = kifleketema
    if (wereda) weredaQuery.wereda = Number.parseInt(wereda)

    const weredaAdmins = await User.find(weredaQuery).select("firstName lastName kifleketema wereda")

    for (const admin of weredaAdmins) {
      // Get complaints handled by this wereda admin (including escalated ones)
      const handledComplaints = await Complaint.find({
        kifleketema: admin.kifleketema,
        wereda: admin.wereda,
        $or: [
          { currentHandler: "wereda_anti_corruption" },
          { "responses.responderRole": "wereda_anti_corruption", "responses.responder": admin._id },
          { "escalationHistory.to": "wereda_anti_corruption" },
        ],
      })

      const totalComplaints = handledComplaints.length

      if (totalComplaints > 0) {
        // Calculate effective status counts from wereda perspective
        const statusCounts = countComplaintsByEffectiveStatus(handledComplaints, "wereda_anti_corruption", admin._id)

        const complaintsWithWeredaResponse = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "wereda_anti_corruption" && r.responder.toString() === admin._id.toString(),
          ),
        ).length

        // Calculate average response time for wereda stage
        let avgResponseTime = 0
        const weredaResponses = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "wereda_anti_corruption" && r.responder.toString() === admin._id.toString(),
          ),
        )

        if (weredaResponses.length > 0) {
          const totalResponseTime = weredaResponses.reduce((sum, complaint) => {
            const weredaResponse = complaint.responses.find(
              (r) => r.responderRole === "wereda_anti_corruption" && r.responder.toString() === admin._id.toString(),
            )
            if (weredaResponse) {
              const weredaStageStart = complaint.escalationHistory.find((e) => e.to === "wereda_anti_corruption")
              const startTime = weredaStageStart ? new Date(weredaStageStart.date) : new Date(complaint.submittedAt)
              const responseTime = (new Date(weredaResponse.createdAt) - startTime) / (1000 * 60 * 60 * 24)
              return sum + responseTime
            }
            return sum
          }, 0)
          avgResponseTime = totalResponseTime / weredaResponses.length
        }

        performanceData.weredaAdministrators.push({
          name: `${admin.firstName} ${admin.lastName}`,
          kifleketema: admin.kifleketema.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          wereda: admin.wereda,
          totalComplaints,
          pendingComplaints: statusCounts.pending,
          inProgressComplaints: statusCounts.in_progress,
          resolvedComplaints: statusCounts.resolved,
          escalatedComplaints: statusCounts.escalated,
          responseRate: ((complaintsWithWeredaResponse / totalComplaints) * 100).toFixed(1),
          escalationRate: ((statusCounts.escalated / totalComplaints) * 100).toFixed(1),
          averageResponseTime: avgResponseTime.toFixed(1),
        })
      }
    }

    // 3. KIFLEKETEMA ADMINISTRATORS PERFORMANCE
    const kifleketemaQuery = {
      role: USER_ROLES.KIFLEKETEMA_ANTI_CORRUPTION,
      isApproved: true,
    }

    if (kifleketema) kifleketemaQuery.kifleketema = kifleketema

    const kifleketemaAdmins = await User.find(kifleketemaQuery).select("firstName lastName kifleketema")

    for (const admin of kifleketemaAdmins) {
      // Get complaints handled by this kifleketema admin (including escalated ones)
      const handledComplaints = await Complaint.find({
        kifleketema: admin.kifleketema,
        $or: [
          { currentHandler: "kifleketema_anti_corruption" },
          { "responses.responderRole": "kifleketema_anti_corruption", "responses.responder": admin._id },
          { "escalationHistory.to": "kifleketema_anti_corruption" },
        ],
      })

      const totalComplaints = handledComplaints.length

      if (totalComplaints > 0) {
        // Calculate effective status counts from kifleketema perspective
        const statusCounts = countComplaintsByEffectiveStatus(
          handledComplaints,
          "kifleketema_anti_corruption",
          admin._id,
        )

        const complaintsWithKifleketemaResponse = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "kifleketema_anti_corruption" && r.responder.toString() === admin._id.toString(),
          ),
        ).length

        // Calculate average response time for kifleketema stage
        let avgResponseTime = 0
        const kifleketemaResponses = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "kifleketema_anti_corruption" && r.responder.toString() === admin._id.toString(),
          ),
        )

        if (kifleketemaResponses.length > 0) {
          const totalResponseTime = kifleketemaResponses.reduce((sum, complaint) => {
            const kifleketemaResponse = complaint.responses.find(
              (r) =>
                r.responderRole === "kifleketema_anti_corruption" && r.responder.toString() === admin._id.toString(),
            )
            if (kifleketemaResponse) {
              const kifleketemaStageStart = complaint.escalationHistory.find(
                (e) => e.to === "kifleketema_anti_corruption",
              )
              const startTime = kifleketemaStageStart
                ? new Date(kifleketemaStageStart.date)
                : new Date(complaint.submittedAt)
              const responseTime = (new Date(kifleketemaResponse.createdAt) - startTime) / (1000 * 60 * 60 * 24)
              return sum + responseTime
            }
            return sum
          }, 0)
          avgResponseTime = totalResponseTime / kifleketemaResponses.length
        }

        performanceData.kifleketemaAdministrators.push({
          name: `${admin.firstName} ${admin.lastName}`,
          kifleketema: admin.kifleketema.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          totalComplaints,
          pendingComplaints: statusCounts.pending,
          inProgressComplaints: statusCounts.in_progress,
          resolvedComplaints: statusCounts.resolved,
          escalatedComplaints: statusCounts.escalated,
          responseRate: ((complaintsWithKifleketemaResponse / totalComplaints) * 100).toFixed(1),
          escalationRate: ((statusCounts.escalated / totalComplaints) * 100).toFixed(1),
          averageResponseTime: avgResponseTime.toFixed(1),
        })
      }
    }

    // 4. KENTIBA BIRO PERFORMANCE
    const kentibaBiroAdmins = await User.find({
      role: USER_ROLES.KENTIBA_BIRO,
      isApproved: true,
    }).select("firstName lastName")

    for (const admin of kentibaBiroAdmins) {
      // Get complaints handled by kentiba biro (including escalated ones)
      const handledComplaints = await Complaint.find({
        $or: [
          { currentHandler: "kentiba_biro" },
          { "responses.responderRole": "kentiba_biro", "responses.responder": admin._id },
          { "escalationHistory.to": "kentiba_biro" },
        ],
      })

      const totalComplaints = handledComplaints.length

      if (totalComplaints > 0) {
        // For kentiba biro, all complaints they handle are either resolved or in progress (no further escalation)
        const resolvedComplaints = handledComplaints.filter((c) => c.status === "resolved").length

        const complaintsWithKentibaResponse = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "kentiba_biro" && r.responder.toString() === admin._id.toString(),
          ),
        ).length

        // Calculate average response time for kentiba stage
        let avgResponseTime = 0
        const kentibaResponses = handledComplaints.filter((c) =>
          c.responses.some(
            (r) => r.responderRole === "kentiba_biro" && r.responder.toString() === admin._id.toString(),
          ),
        )

        if (kentibaResponses.length > 0) {
          const totalResponseTime = kentibaResponses.reduce((sum, complaint) => {
            const kentibaResponse = complaint.responses.find(
              (r) => r.responderRole === "kentiba_biro" && r.responder.toString() === admin._id.toString(),
            )
            if (kentibaResponse) {
              const kentibaStageStart = complaint.escalationHistory.find((e) => e.to === "kentiba_biro")
              const startTime = kentibaStageStart ? new Date(kentibaStageStart.date) : new Date(complaint.submittedAt)
              const responseTime = (new Date(kentibaResponse.createdAt) - startTime) / (1000 * 60 * 60 * 24)
              return sum + responseTime
            }
            return sum
          }, 0)
          avgResponseTime = totalResponseTime / kentibaResponses.length
        }

        performanceData.kentibaBiro.push({
          name: `${admin.firstName} ${admin.lastName}`,
          role: "Kentiba Biro Administrator",
          totalComplaints,
          pendingComplaints: handledComplaints.filter((c) => c.status === "pending").length,
          inProgressComplaints: handledComplaints.filter((c) => c.status === "in_progress").length,
          resolvedComplaints,
          escalatedComplaints: 0, // Kentiba is final level
          responseRate: ((complaintsWithKentibaResponse / totalComplaints) * 100).toFixed(1),
          escalationRate: "0.0", // No further escalation possible
          averageResponseTime: avgResponseTime.toFixed(1),
        })
      }
    }

    console.log("Performance data summary:", {
      stakeholderOffices: performanceData.stakeholderOffices.length,
      weredaAdministrators: performanceData.weredaAdministrators.length,
      kifleketemaAdministrators: performanceData.kifleketemaAdministrators.length,
      kentibaBiro: performanceData.kentibaBiro.length,
    })

    res.json(performanceData)
  } catch (err) {
    console.error("Get comprehensive performance error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
