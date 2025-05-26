const express = require("express")
const router = express.Router()
const Complaint = require("../models/Complaint")
const User = require("../models/User")
const OfficePerformance = require("../models/OfficePerformance")
const auth = require("../middleware/auth")
const { USER_ROLES } = require("../config/constants")

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
// @desc    Get office performance data
// @access  Private (Admin only)
router.get("/performance", auth, async (req, res) => {
  try {
    // Check if user is an admin
    if (req.user.role === USER_ROLES.CITIZEN) {
      return res.status(403).json({ message: "Not authorized" })
    }

    const { kifleketema, wereda, officeType } = req.query

    // Build query for offices
    const officeQuery = {
      role: USER_ROLES.STAKEHOLDER_OFFICE,
      isApproved: true,
    }

    if (kifleketema) {
      officeQuery.kifleketema = kifleketema
    }

    if (wereda) {
      officeQuery.wereda = Number.parseInt(wereda)
    }

    if (officeType) {
      officeQuery.officeType = officeType
    }

    console.log("Office performance query:", JSON.stringify(officeQuery, null, 2))

    // Get offices
    const offices = await User.find(officeQuery).select(
      "officeName officeType kifleketema wereda officeAddress officePhone",
    )

    console.log("Found offices:", offices.length)

    // Get performance data for each office
    const performanceData = await Promise.all(
      offices.map(async (office) => {
        // Get total complaints for this office
        const totalComplaints = await Complaint.countDocuments({
          stakeholderOffice: office._id,
        })

        // Get resolved complaints
        const resolvedComplaints = await Complaint.countDocuments({
          stakeholderOffice: office._id,
          status: "resolved",
        })

        // Get escalated complaints (complaints that moved beyond stakeholder level)
        const escalatedComplaints = await Complaint.countDocuments({
          stakeholderOffice: office._id,
          status: "escalated",
        })

        // Get complaints with responses (response rate)
        const complaintsWithResponses = await Complaint.countDocuments({
          stakeholderOffice: office._id,
          "responses.0": { $exists: true },
        })

        // Calculate metrics
        const responseRate =
          totalComplaints > 0 ? ((complaintsWithResponses / totalComplaints) * 100).toFixed(1) : "0.0"
        const escalationRate = totalComplaints > 0 ? ((escalatedComplaints / totalComplaints) * 100).toFixed(1) : "0.0"

        // Calculate average resolution time
        const resolvedComplaintsWithTime = await Complaint.find({
          stakeholderOffice: office._id,
          status: "resolved",
          "resolution.resolvedAt": { $exists: true },
        }).select("submittedAt resolution.resolvedAt")

        let averageResolutionTime = 0
        if (resolvedComplaintsWithTime.length > 0) {
          const totalResolutionTime = resolvedComplaintsWithTime.reduce((sum, complaint) => {
            const submittedAt = new Date(complaint.submittedAt)
            const resolvedAt = new Date(complaint.resolution.resolvedAt)
            const resolutionTime = (resolvedAt - submittedAt) / (1000 * 60 * 60 * 24) // in days
            return sum + resolutionTime
          }, 0)
          averageResolutionTime = totalResolutionTime / resolvedComplaintsWithTime.length
        }

        return {
          officeName: office.officeName,
          officeType: office.officeType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          kifleketema: office.kifleketema.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          wereda: office.wereda || "N/A",
          totalComplaints,
          resolvedComplaints,
          escalatedComplaints,
          responseRate,
          escalationRate,
          averageResolutionTime,
        }
      }),
    )

    // Filter out offices with no complaints if needed
    const filteredPerformanceData = performanceData.filter((office) => office.totalComplaints > 0)

    console.log("Performance data:", filteredPerformanceData.length, "offices with complaints")

    res.json({
      offices: filteredPerformanceData,
    })
  } catch (err) {
    console.error("Get office performance error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
