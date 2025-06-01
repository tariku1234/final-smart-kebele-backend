const express = require("express")
const router = express.Router()
const { sendResponseNotificationEmail } = require("../utils/emailNotificationService")

// Test email route
router.get("/", async (req, res) => {
  try {
    console.log("Testing email service...")

    // Mock data for testing
    const testEmail = "test@example.com" // Replace with your email for testing
    const testComplaint = {
      _id: "test123",
      title: "Test Complaint",
      currentStage: "stakeholder_first",
      status: "in_progress",
      stakeholderOffice: {
        officeType: "health_office",
      },
    }

    const testResponse = {
      responder: {
        firstName: "Test",
        lastName: "Admin",
      },
      response: "This is a test response",
      createdAt: new Date(),
    }

    const result = await sendResponseNotificationEmail(testEmail, "Test User", testComplaint, testResponse)

    res.json({
      message: "Email test completed",
      result: result,
      emailSent: result.success,
    })
  } catch (error) {
    console.error("Email test error:", error)
    res.status(500).json({
      message: "Email test failed",
      error: error.message,
    })
  }
})

module.exports = router
