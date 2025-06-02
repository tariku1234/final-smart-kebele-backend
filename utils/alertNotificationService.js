const nodemailer = require("nodemailer")
const User = require("../models/User")

// Create transporter with Gmail configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  })
}

// HTML email template for alert news
const getAlertNewsTemplate = (blogPost, citizenFirstName) => {
  const blogUrl = `${process.env.CLIENT_URL}/blog/${blogPost._id}`

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🚨 Alert News - Smart-Kebele</title>
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
                border-bottom: 2px solid #e74c3c;
            }
            .logo {
                font-size: 28px;
                font-weight: bold;
                color: #e74c3c;
                margin-bottom: 10px;
            }
            .alert-badge {
                background-color: #e74c3c;
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: bold;
                display: inline-block;
                margin-bottom: 20px;
            }
            .content {
                margin-bottom: 30px;
            }
            .blog-title {
                font-size: 24px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 15px;
                line-height: 1.3;
            }
            .blog-excerpt {
                background-color: #f8f9fa;
                padding: 20px;
                border-left: 4px solid #e74c3c;
                margin: 20px 0;
                border-radius: 5px;
            }
            .read-more-button {
                display: inline-block;
                background-color: #e74c3c;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin: 20px 0;
                text-align: center;
            }
            .read-more-button:hover {
                background-color: #c0392b;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                font-size: 14px;
                color: #6b7280;
            }
            .urgent-notice {
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
                text-align: center;
            }
            .meta-info {
                color: #7f8c8d;
                font-size: 14px;
                margin-bottom: 15px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🚨 Smart-Kebele Alert</div>
                <div class="alert-badge">URGENT ALERT NEWS</div>
                <p>Important Information for Citizens</p>
            </div>
            
            <div class="content">
                <p>Dear ${citizenFirstName},</p>
                
                <div class="urgent-notice">
                    <strong>⚠️ This is an urgent alert news notification from Smart-Kebele</strong>
                </div>
                
                <div class="blog-title">${blogPost.title}</div>
                
                <div class="meta-info">
                    Published: ${new Date(blogPost.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </div>
                
                <div class="blog-excerpt">
                    ${blogPost.content.substring(0, 300)}${blogPost.content.length > 300 ? "..." : ""}
                </div>
                
                <div style="text-align: center;">
                    <a href="${blogUrl}" class="read-more-button">Read Full Alert News</a>
                </div>
                
                <div style="margin-top: 30px; padding: 15px; background-color: #e8f5e8; border-radius: 5px;">
                    <h3 style="color: #27ae60; margin-top: 0;">Stay Informed</h3>
                    <p>This alert news has been sent to all citizens to ensure everyone stays informed about important developments in our community.</p>
                    <p>Please read the full article for complete details and any required actions.</p>
                </div>
            </div>
            
            <div class="footer">
                <p>This alert was sent from Smart-Kebele Citizen Services Platform</p>
                <p>© 2024 Smart-Kebele. All rights reserved.</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    This is an automated alert notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
  `
}

// Send alert news to all citizens
const sendAlertNewsToAllCitizens = async (blogPost) => {
  try {
    console.log("Starting alert news notification process...")

    // First, let's check all users to debug
    const allUsers = await User.find({}).select("email firstName role isApproved")
    console.log("All users in database:", allUsers.length)
    console.log("Users breakdown:")
    allUsers.forEach((user) => {
      console.log(`- ${user.email}: role=${user.role}, approved=${user.isApproved}`)
    })

    // Get all approved citizens
    const approvedCitizens = await User.find({
      role: "citizen",
      isApproved: true,
    }).select("email firstName")

    console.log(`Found ${approvedCitizens.length} approved citizens`)

    // Also check unapproved citizens
    const unapprovedCitizens = await User.find({
      role: "citizen",
      isApproved: false,
    }).select("email firstName")

    console.log(`Found ${unapprovedCitizens.length} unapproved citizens`)

    // For alert news, we'll send to ALL citizens (approved and unapproved)
    // because alert news is urgent and should reach everyone
    const allCitizens = [...approvedCitizens, ...unapprovedCitizens]

    if (allCitizens.length === 0) {
      console.log("No citizens found to send alert news")
      return { success: true, message: "No citizens to notify" }
    }

    console.log(`Total citizens to notify: ${allCitizens.length}`)

    const transporter = createTransporter()

    // Test email configuration first
    try {
      await transporter.verify()
      console.log("✅ Email transporter verified successfully")
    } catch (error) {
      console.error("❌ Email transporter verification failed:", error.message)
      return { success: false, error: "Email configuration error: " + error.message }
    }

    const emailPromises = []

    // Send email to each citizen
    for (const citizen of allCitizens) {
      console.log(`📧 Preparing email for: ${citizen.email}`)

      const mailOptions = {
        from: {
          name: "Smart-Kebele Alert System",
          address: process.env.EMAIL_USER,
        },
        to: citizen.email,
        subject: `🚨 URGENT ALERT: ${blogPost.title} - Smart-Kebele`,
        html: getAlertNewsTemplate(blogPost, citizen.firstName || "Citizen"),
      }

      emailPromises.push(
        transporter
          .sendMail(mailOptions)
          .then((info) => {
            console.log(`✅ Email sent successfully to ${citizen.email}:`, info.messageId)
            return { success: true, email: citizen.email, messageId: info.messageId }
          })
          .catch((error) => {
            console.error(`❌ Failed to send alert to ${citizen.email}:`, error.message)
            return { error: error.message, email: citizen.email }
          }),
      )
    }

    // Wait for all emails to be sent
    console.log("📤 Sending emails...")
    const results = await Promise.allSettled(emailPromises)

    const successful = results.filter((result) => result.status === "fulfilled" && result.value.success).length
    const failed = results.filter((result) => result.status === "rejected" || result.value?.error).length

    console.log(`🎯 Alert news notification completed: ${successful} successful, ${failed} failed`)

    // Log detailed results
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          console.log(`✅ Email ${index + 1}: Success - ${result.value.email}`)
        } else {
          console.log(`❌ Email ${index + 1}: Failed - ${result.value.email} - ${result.value.error}`)
        }
      } else {
        console.log(`❌ Email ${index + 1}: Rejected - ${result.reason}`)
      }
    })

    return {
      success: true,
      message: `Alert news sent to ${successful} citizens (${failed} failed)`,
      stats: {
        total: allCitizens.length,
        successful,
        failed,
      },
    }
  } catch (error) {
    console.error("💥 Error sending alert news to citizens:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

module.exports = {
  sendAlertNewsToAllCitizens,
}
