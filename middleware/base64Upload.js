const multer = require("multer")
const {
  convertFileToBase64,
  convertFilesToBase64,
  validateFileType,
  validateFileSize,
} = require("../utils/base64FileHandler")

// Configure multer to use memory storage for Base64 conversion
const storage = multer.memoryStorage()

const createBase64Upload = (options = {}) => {
  const {
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = "all",
    maxFiles = 5,
  } = options

  const upload = multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
    },
    fileFilter: (req, file, cb) => {
      // Basic file type validation (more detailed validation happens after Base64 conversion)
      const allowedMimeTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|webm|ogg/
      const extname = allowedMimeTypes.test(file.originalname.toLowerCase())
      const mimetype = allowedMimeTypes.test(file.mimetype)

      if (extname && mimetype) {
        return cb(null, true)
      } else {
        cb(new Error("Invalid file type. Only images, documents, and videos are allowed."))
      }
    },
  })

  // Middleware to convert uploaded files to Base64
  const convertToBase64 = (req, res, next) => {
    try {
      // Handle single file upload
      if (req.file) {
        const base64File = convertFileToBase64(req.file)
        if (base64File) {
          // Validate file type and size
          const fileInfo = require("../utils/base64FileHandler").extractFileInfo(base64File.data)
          if (!validateFileType(fileInfo.mimeType, allowedTypes)) {
            return res.status(400).json({ message: "Invalid file type" })
          }
          if (!validateFileSize(base64File.data, maxFileSize)) {
            return res.status(400).json({ message: "File size too large" })
          }

          req.base64File = base64File
        }
      }

      // Handle multiple file uploads
      if (req.files && req.files.length > 0) {
        const base64Files = convertFilesToBase64(req.files)

        // Validate each file
        for (const base64File of base64Files) {
          const fileInfo = require("../utils/base64FileHandler").extractFileInfo(base64File.data)
          if (!validateFileType(fileInfo.mimeType, allowedTypes)) {
            return res.status(400).json({ message: `Invalid file type: ${base64File.fileName}` })
          }
          if (!validateFileSize(base64File.data, maxFileSize)) {
            return res.status(400).json({ message: `File size too large: ${base64File.fileName}` })
          }
        }

        req.base64Files = base64Files
      }

      next()
    } catch (error) {
      console.error("Error converting files to Base64:", error)
      res.status(500).json({ message: "Error processing uploaded files" })
    }
  }

  return { upload, convertToBase64 }
}

module.exports = { createBase64Upload }
