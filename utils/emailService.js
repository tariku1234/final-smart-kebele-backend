const nodemailer = require("nodemailer")

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

// HTML email template for password reset
const getPasswordResetTemplate = (resetToken, userFirstName) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - Smart-Kebele</title>
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
            .reset-button {
                display: inline-block;
                background-color::rgb(126, 156, 219);
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin: 20px 0;
            }
            .reset-button:hover {
                background-color: #1d4ed8;
            }
            .warning {
                background-color: #fef3c7;
                border: 1px solid #f59e0b;
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
            .support-info {
                margin-top: 20px;
                padding: 15px;
                background-color: #f9fafb;
                border-radius: 5px;
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
                <h2>Password Reset Request</h2>
                <p>Hello ${userFirstName},</p>
                
                <p>We received a request to reset your password for your Smart-Kebele account. If you made this request, please click the button below to reset your password:</p>
                
                <div style="text-align: center;">
                    <a href="${resetUrl}" class="reset-button">Reset My Password</a>
                </div>
                
                <div class="warning">
                    <strong>⚠️ Important Security Information:</strong>
                    <ul>
                        <li>This link will expire in 1 hour for your security</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                        <li>Never share this link with anyone</li>
                    </ul>
                </div>
                
                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 5px;">
                    ${resetUrl}
                </p>
                
                <div class="support-info">
                    <h3>Need Help?</h3>
                    <p>If you're having trouble resetting your password or didn't request this reset, please contact our support team:</p>
                    <p>📧 Email: tarikunegash447@gmail.com</p>
                    <p>🌐 Website: Smart-Kebele Platform</p>
                </div>
            </div>
            
            <div class="footer">
                <p>This email was sent from Smart-Kebele Citizen Services Platform</p>
                <p>© 2024 Smart-Kebele. All rights reserved.</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    This is an automated message. Please do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
  `
}

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken, userFirstName) => {
  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: {
        name: "Smart-Kebele Support",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: "🔐 Password Reset Request - Smart-Kebele",
      html: getPasswordResetTemplate(resetToken, userFirstName),
    }

    const result = await transporter.sendMail(mailOptions)
    console.log("Password reset email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending password reset email:", error)
    return { success: false, error: error.message }
  }
}

// Send welcome email for new users
const sendWelcomeEmail = async (email, firstName) => {
  try {
    const transporter = createTransporter()

    const mailOptions = {
      from: {
        name: "Smart-Kebele Support",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: "🎉 Welcome to Smart-Kebele!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb;">Welcome to Smart-Kebele!</h1>
          </div>
          <p>Dear ${firstName},</p>
          <p>Welcome to Smart-Kebele! Your account has been successfully created.</p>
          <p>You can now access all our citizen services and submit complaints through our platform.</p>
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Best regards,<br>Smart-Kebele Team</p>
        </div>
      `,
    }

    const result = await transporter.sendMail(mailOptions)
    console.log("Welcome email sent successfully:", result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("Error sending welcome email:", error)
    return { success: false, error: error.message }
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
}
