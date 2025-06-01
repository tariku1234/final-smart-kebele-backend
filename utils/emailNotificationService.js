const nodemailer = require("nodemailer")
const Complaint = require("../models/Complaint") // Import the Complaint model

// Create transporter with Gmail configuration
const createTransporter = () => {
  console.log("Creating email transporter...")
  console.log("EMAIL_USER:", process.env.EMAIL_USER ? "SET" : "NOT SET")
  console.log("EMAIL_APP_PASSWORD:", process.env.EMAIL_APP_PASSWORD ? "SET" : "NOT SET")

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  })
}

// Base email template
const getBaseEmailTemplate = (title, content, userFirstName) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Smart-Kebele</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f4f4f4;
            }
            .container {
                background-color: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #2563eb;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #2563eb;
                margin-bottom: 10px;
            }
            .content {
                margin-bottom: 30px;
            }
            .action-button {
                display: inline-block;
                background-color:rgb(126, 156, 219);
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin: 20px 0;
            }
            .action-button:hover {
                background-color:rgb(148, 171, 234);
            }
            .info-box {
                background-color: #f0f9ff;
                border: 1px solid #0ea5e9;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            .warning-box {
                background-color: #fef3c7;
                border: 1px solid #f59e0b;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            .success-box {
                background-color: #f0fdf4;
                border: 1px solid #22c55e;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                font-size: 14px;
                color: #6b7280;
            }
            .complaint-details {
                background-color: #f9fafb;
                padding: 15px;
                border-radius: 5px;
                margin: 15px 0;
            }
            .complaint-details h4 {
                margin-top: 0;
                color: #374151;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Smart-Kebele</div>
                <p>Citizen Services Platform</p>
            </div>
            
            <div class="content">
                <h2>${title}</h2>
                <p>Hello ${userFirstName},</p>
                ${content}
            </div>
            
            <div class="footer">
                <p>This email was sent from Smart-Kebele Citizen Services Platform</p>
                <p>© 2024 Smart-Kebele. All rights reserved.</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    This is an automated message. Please do not reply to this email.
                </p>
                <p style="font-size: 12px;">
                    📧 Support: tarikunegash447@gmail.com
                </p>
            </div>
        </div>
    </body>
    </html>
  `
}

// Response notification email template
const getResponseNotificationTemplate = (userFirstName, complaint, response) => {
  const complaintUrl = `${process.env.CLIENT_URL}/complaints/${complaint._id}`
  const responderName = response.responder
    ? `${response.responder.firstName} ${response.responder.lastName}`
    : "Administrator"

  const officeTypeDisplay = complaint.stakeholderOffice?.officeType
    ? complaint.stakeholderOffice.officeType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : "Office"

  const content = `
    <p>Great news! You have received a response to your complaint from <strong>${responderName}</strong> at the ${officeTypeDisplay}.</p>
    
    <div class="complaint-details">
        <h4>📋 Complaint Details:</h4>
        <p><strong>Title:</strong> ${complaint.title}</p>
        <p><strong>Complaint ID:</strong> #${complaint._id.toString().slice(-8).toUpperCase()}</p>
        <p><strong>Current Stage:</strong> ${complaint.currentStage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
        <p><strong>Status:</strong> ${complaint.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
    </div>

    <div class="success-box">
        <h4>💬 Response from ${responderName}:</h4>
        <p style="font-style: italic;">"${response.response}"</p>
        <p><small>Responded on: ${new Date(response.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</small></p>
    </div>

    <div class="info-box">
        <h4>🎯 What's Next?</h4>
        <p>You can now:</p>
        <ul>
            <li><strong>Accept the response</strong> if you're satisfied with the solution</li>
            <li><strong>Submit additional details</strong> if you need further clarification</li>
            <li><strong>Escalate the complaint</strong> if the response doesn't resolve your issue</li>
        </ul>
    </div>

    <div style="text-align: center;">
        <a href="${complaintUrl}" class="action-button">View Full Response & Take Action</a>
    </div>

    <p>Thank you for using Smart-Kebele. We're committed to resolving your concerns efficiently.</p>
  `

  return getBaseEmailTemplate("New Response to Your Complaint", content, userFirstName)
}

// Escalation notification email template
const getEscalationNotificationTemplate = (userFirstName, complaint, escalationDetails) => {
  const complaintUrl = `${process.env.CLIENT_URL}/complaints/${complaint._id}`

  const fromHandler = escalationDetails.from.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  const toHandler = escalationDetails.to.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

  const escalationType = escalationDetails.isAutomatic ? "automatically" : "manually"
  const escalationIcon = escalationDetails.isAutomatic ? "⏰" : "📈"

  const content = `
    <p>Your complaint has been ${escalationType} escalated to a higher authority for resolution.</p>
    
    <div class="complaint-details">
        <h4>📋 Complaint Details:</h4>
        <p><strong>Title:</strong> ${complaint.title}</p>
        <p><strong>Complaint ID:</strong> #${complaint._id.toString().slice(-8).toUpperCase()}</p>
        <p><strong>Previous Handler:</strong> ${fromHandler}</p>
        <p><strong>New Handler:</strong> ${toHandler}</p>
        <p><strong>Current Status:</strong> ${complaint.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
    </div>

    <div class="warning-box">
        <h4>${escalationIcon} Escalation Details:</h4>
        <p><strong>Reason:</strong> ${escalationDetails.reason}</p>
        <p><strong>Escalated on:</strong> ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</p>
        <p><strong>Type:</strong> ${escalationDetails.isAutomatic ? "Automatic (Due to deadline)" : "Manual escalation"}</p>
    </div>

    <div class="info-box">
        <h4>🔄 What This Means:</h4>
        <ul>
            <li>Your complaint is now being handled by <strong>${toHandler}</strong></li>
            <li>You should expect a response within the designated timeframe</li>
            <li>The new handler will review your case with fresh perspective</li>
            <li>You'll receive email notifications for any updates</li>
        </ul>
    </div>

    <div style="text-align: center;">
        <a href="${complaintUrl}" class="action-button">Track Your Complaint Progress</a>
    </div>

    <p>We appreciate your patience as we work to resolve your complaint at the appropriate level.</p>
  `

  return getBaseEmailTemplate("Complaint Escalated", content, userFirstName)
}

// Due date warning email template
const getDueDateWarningTemplate = (userFirstName, complaint, dueDate, timeRemaining) => {
  const complaintUrl = `${process.env.CLIENT_URL}/complaints/${complaint._id}`

  const currentHandler = complaint.currentHandler.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

  const content = `
    <p>This is a reminder that your complaint response deadline is approaching.</p>
    
    <div class="complaint-details">
        <h4>📋 Complaint Details:</h4>
        <p><strong>Title:</strong> ${complaint.title}</p>
        <p><strong>Complaint ID:</strong> #${complaint._id.toString().slice(-8).toUpperCase()}</p>
        <p><strong>Current Handler:</strong> ${currentHandler}</p>
        <p><strong>Current Stage:</strong> ${complaint.currentStage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</p>
    </div>

    <div class="warning-box">
        <h4>⏰ Deadline Information:</h4>
        <p><strong>Response Due:</strong> ${dueDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</p>
        <p><strong>Time Remaining:</strong> ${timeRemaining}</p>
    </div>

    <div class="info-box">
        <h4>📝 What You Can Do:</h4>
        <ul>
            <li><strong>Wait for the response</strong> - The office is expected to respond by the due date</li>
            <li><strong>Check for updates</strong> - Log in to see if there are any new responses</li>
            <li><strong>Prepare for escalation</strong> - If no response is received by the deadline, you can escalate</li>
        </ul>
    </div>

    <div style="text-align: center;">
        <a href="${complaintUrl}" class="action-button">Check Complaint Status</a>
    </div>

    <p>If you don't receive a response by the deadline, the complaint will be automatically escalated to the next level.</p>
  `

  return getBaseEmailTemplate("Complaint Response Deadline Approaching", content, userFirstName)
}

// Resolution notification email template
const getResolutionNotificationTemplate = (userFirstName, complaint, resolutionDetails) => {
  const complaintUrl = `${process.env.CLIENT_URL}/complaints/${complaint._id}`

  const resolverName = resolutionDetails.resolverName || "Administrator"

  const content = `
    <p>Congratulations! Your complaint has been successfully resolved.</p>
    
    <div class="complaint-details">
        <h4>📋 Complaint Details:</h4>
        <p><strong>Title:</strong> ${complaint.title}</p>
        <p><strong>Complaint ID:</strong> #${complaint._id.toString().slice(-8).toUpperCase()}</p>
        <p><strong>Resolved by:</strong> ${resolverName}</p>
        <p><strong>Resolution Date:</strong> ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</p>
    </div>

    <div class="success-box">
        <h4>✅ Resolution Summary:</h4>
        <p>Your complaint has been marked as resolved after you accepted the response from ${resolverName}.</p>
        <p>Thank you for using Smart-Kebele's complaint resolution system.</p>
    </div>

    <div class="info-box">
        <h4>📊 Your Experience Matters:</h4>
        <p>Your feedback helps us improve our services. If you have any additional concerns or feedback about the resolution process, please don't hesitate to contact our support team.</p>
    </div>

    <div style="text-align: center;">
        <a href="${complaintUrl}" class="action-button">View Final Resolution</a>
    </div>

    <p>Thank you for your patience throughout this process. We're glad we could help resolve your concern.</p>
  `

  return getBaseEmailTemplate("Complaint Successfully Resolved", content, userFirstName)
}

// Send response notification email
const sendResponseNotificationEmail = async (userEmail, userFirstName, complaint, response) => {
  console.log("=== sendResponseNotificationEmail called ===")
  console.log("userEmail:", userEmail)
  console.log("userFirstName:", userFirstName)
  console.log("complaint ID:", complaint?._id)
  console.log("response:", response?.response)

  // Check environment variables
  console.log("EMAIL_USER:", process.env.EMAIL_USER ? "SET" : "NOT SET")
  console.log("EMAIL_APP_PASSWORD:", process.env.EMAIL_APP_PASSWORD ? "SET" : "NOT SET")
  console.log("CLIENT_URL:", process.env.CLIENT_URL)

  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: {
        name: "Smart-Kebele Notifications",
        address: process.env.EMAIL_USER,
      },
      to: userEmail,
      subject: `📬 New Response to Your Complaint - Smart-Kebele`,
      html: getResponseNotificationTemplate(userFirstName, complaint, response),
    }

    console.log("Sending email with options:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    })

    const result = await transporter.sendMail(mailOptions)
    console.log("Response notification email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending response notification email:", error)
    return { success: false, error: error.message }
  }
}

// Send escalation notification email
const sendEscalationNotificationEmail = async (userEmail, userFirstName, complaint, escalationDetails) => {
  console.log("=== sendEscalationNotificationEmail called ===")
  console.log("userEmail:", userEmail)
  console.log("userFirstName:", userFirstName)
  console.log("complaint ID:", complaint?._id)
  console.log("escalationDetails:", escalationDetails)

  try {
    const transporter = createTransporter()

    const escalationType = escalationDetails.isAutomatic ? "Automatically Escalated" : "Escalated"

    const mailOptions = {
      from: {
        name: "Smart-Kebele Notifications",
        address: process.env.EMAIL_USER,
      },
      to: userEmail,
      subject: `📈 Complaint ${escalationType} - Smart-Kebele`,
      html: getEscalationNotificationTemplate(userFirstName, complaint, escalationDetails),
    }

    console.log("Sending escalation email with options:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    })

    const result = await transporter.sendMail(mailOptions)
    console.log("Escalation notification email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending escalation notification email:", error)
    return { success: false, error: error.message }
  }
}

// Send due date warning email
const sendDueDateWarningEmail = async (userEmail, userFirstName, complaint, dueDate) => {
  try {
    const transporter = createTransporter()

    // Calculate time remaining
    const now = new Date()
    const timeDiff = dueDate - now
    const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60))

    let timeRemaining
    if (hoursRemaining <= 24) {
      timeRemaining = `${hoursRemaining} hours`
    } else {
      const daysRemaining = Math.ceil(hoursRemaining / 24)
      timeRemaining = `${daysRemaining} days`
    }

    const mailOptions = {
      from: {
        name: "Smart-Kebele Notifications",
        address: process.env.EMAIL_USER,
      },
      to: userEmail,
      subject: `⏰ Complaint Response Deadline Approaching - Smart-Kebele`,
      html: getDueDateWarningTemplate(userFirstName, complaint, dueDate, timeRemaining),
    }

    const result = await transporter.sendMail(mailOptions)
    console.log("Due date warning email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending due date warning email:", error)
    return { success: false, error: error.message }
  }
}

// Send resolution notification email
const sendResolutionNotificationEmail = async (userEmail, userFirstName, complaint, resolutionDetails) => {
  console.log("=== sendResolutionNotificationEmail called ===")
  console.log("userEmail:", userEmail)
  console.log("userFirstName:", userFirstName)
  console.log("complaint ID:", complaint?._id)
  console.log("resolutionDetails:", resolutionDetails)

  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: {
        name: "Smart-Kebele Notifications",
        address: process.env.EMAIL_USER,
      },
      to: userEmail,
      subject: `✅ Complaint Successfully Resolved - Smart-Kebele`,
      html: getResolutionNotificationTemplate(userFirstName, complaint, resolutionDetails),
    }

    console.log("Sending resolution email with options:", {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    })

    const result = await transporter.sendMail(mailOptions)
    console.log("Resolution notification email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending resolution notification email:", error)
    return { success: false, error: error.message }
  }
}

// Check for due date warnings and send emails
const checkAndSendDueDateWarnings = async () => {
  try {
    const now = new Date()
    const warningTime = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours from now

    // Find complaints with due dates approaching in the next 24 hours
    const complaints = await Complaint.find({
      status: { $ne: "resolved" },
      $or: [
        {
          currentStage: "stakeholder_first",
          stakeholderFirstResponseDue: { $gte: now, $lte: warningTime },
        },
        {
          currentStage: "stakeholder_second",
          stakeholderSecondResponseDue: { $gte: now, $lte: warningTime },
        },
        {
          currentStage: "wereda_first",
          weredaFirstResponseDue: { $gte: now, $lte: warningTime },
        },
        {
          currentStage: "wereda_second",
          weredaSecondResponseDue: { $gte: now, $lte: warningTime },
        },
        {
          currentStage: "kifleketema_first",
          kifleketemaFirstResponseDue: { $gte: now, $lte: warningTime },
        },
        {
          currentStage: "kifleketema_second",
          kifleketemaSecondResponseDue: { $gte: now, $lte: warningTime },
        },
      ],
    }).populate("user", "firstName lastName email")

    console.log(`Found ${complaints.length} complaints with approaching due dates`)

    for (const complaint of complaints) {
      if (complaint.user && complaint.user.email) {
        let dueDate

        // Get the appropriate due date based on current stage
        switch (complaint.currentStage) {
          case "stakeholder_first":
            dueDate = complaint.stakeholderFirstResponseDue
            break
          case "stakeholder_second":
            dueDate = complaint.stakeholderSecondResponseDue
            break
          case "wereda_first":
            dueDate = complaint.weredaFirstResponseDue
            break
          case "wereda_second":
            dueDate = complaint.weredaSecondResponseDue
            break
          case "kifleketema_first":
            dueDate = complaint.kifleketemaFirstResponseDue
            break
          case "kifleketema_second":
            dueDate = complaint.kifleketemaSecondResponseDue
            break
          default:
            continue
        }

        if (dueDate) {
          await sendDueDateWarningEmail(complaint.user.email, complaint.user.firstName, complaint, dueDate)
        }
      }
    }

    console.log("Due date warning emails sent successfully")
  } catch (error) {
    console.error("Error checking and sending due date warnings:", error)
  }
}

module.exports = {
  sendResponseNotificationEmail,
  sendEscalationNotificationEmail,
  sendDueDateWarningEmail,
  sendResolutionNotificationEmail,
  checkAndSendDueDateWarnings,
}
