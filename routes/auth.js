const express = require("express")
const router = express.Router()
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const User = require("../models/User")
const auth = require("../middleware/auth")
const { sendPasswordResetEmail, sendWelcomeEmail } = require("../utils/emailService")
const { passwordResetLimiter, loginLimiter } = require("../middleware/rateLimiter")

// @route   POST api/auth/register
// @desc    Register a user
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, idNumber, address, role } = req.body

    // Check if user already exists
    let user = await User.findOne({ email })

    if (user) {
      return res.status(400).json({ message: "User already exists" })
    }

    // Check if ID number is already registered
    user = await User.findOne({ idNumber })

    if (user) {
      return res.status(400).json({ message: "ID number is already registered" })
    }

    // Create new user
    user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      idNumber,
      address,
      role: role || "citizen", // Default to citizen if no role provided
    })

    await user.save()

    // Send welcome email for citizens
    if (user.role === "citizen") {
      try {
        await sendWelcomeEmail(email, firstName)
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError)
        // Don't fail registration if email fails
      }
    }

    res.status(201).json({ message: "User registered successfully" })
  } catch (err) {
    console.error("Registration error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body

    // Check if user exists
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Check password
    const isMatch = await user.comparePassword(password)

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" })
    }

    // Check if user is approved (for stakeholders and administrators)
    if (
      ["stakeholder_office", "wereda_anti_corruption", "kifleketema_anti_corruption"].includes(user.role) &&
      !user.isApproved
    ) {
      return res.status(403).json({
        message:
          user.role === "stakeholder_office"
            ? "Your stakeholder account is pending approval from an administrator"
            : "Your administrator account is pending approval from Kentiba Biro",
      })
    }

    // Create and sign JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role,
        kifleketema: user.kifleketema,
        wereda: user.wereda,
      },
    }

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "24h" }, (err, token) => {
      if (err) throw err

      // Return user info and token
      res.json({
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          kifleketema: user.kifleketema,
          wereda: user.wereda,
        },
      })
    })
  } catch (err) {
    console.error("Login error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json({ user })
  } catch (err) {
    console.error("Get user error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// @route   POST api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" })
    }

    // Check if user exists
    const user = await User.findOne({ email })

    if (!user) {
      // For security, don't reveal if email exists or not
      return res.json({
        message: "If an account with that email exists, we've sent a password reset link to it.",
      })
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex")
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex")

    // Store the hashed token and expiration time (1 hour from now)
    user.resetPasswordToken = resetTokenHash
    user.resetPasswordExpires = new Date(Date.now() + 3600000) // 1 hour
    await user.save()

    // Send password reset email
    const emailResult = await sendPasswordResetEmail(email, resetToken, user.firstName)

    if (emailResult.success) {
      res.json({
        message: "Password reset link has been sent to your email address.",
        success: true,
      })
    } else {
      // Clear the reset token if email failed
      user.resetPasswordToken = undefined
      user.resetPasswordExpires = undefined
      await user.save()

      return res.status(500).json({
        message: "Failed to send password reset email. Please try again later.",
      })
    }
  } catch (err) {
    console.error("Forgot password error:", err)
    res.status(500).json({ message: "Server error. Please try again later." })
  }
})

// @route   POST api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body

    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      })
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex")

    // Find user with valid reset token that hasn't expired
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset token. Please request a new password reset.",
      })
    }

    // Update password
    user.password = newPassword
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    res.json({
      message: "Password has been reset successfully. You can now login with your new password.",
      success: true,
    })
  } catch (err) {
    console.error("Reset password error:", err)
    res.status(500).json({ message: "Server error. Please try again later." })
  }
})

// @route   POST api/auth/verify-reset-code (Legacy - keeping for backward compatibility)
// @desc    Verify reset code
// @access  Public
router.post("/verify-reset-code", async (req, res) => {
  try {
    const { email, resetCode } = req.body

    // Find user by email and check if reset code is valid and not expired
    const user = await User.findOne({
      email,
      resetCode,
      resetCodeExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" })
    }

    res.json({ message: "Reset code verified successfully" })
  } catch (err) {
    console.error("Verify reset code error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
