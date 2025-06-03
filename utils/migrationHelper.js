// Helper utility for migrating existing file paths to Base64 (optional)
const fs = require("fs")
const path = require("path")
const { convertFileToBase64 } = require("./base64FileHandler")

// Function to migrate existing file attachments to Base64
const migrateFileToBase64 = async (filePath) => {
  try {
    if (!filePath || filePath.startsWith("data:")) {
      return filePath // Already Base64 or invalid
    }

    const fullPath = path.join(__dirname, "../../", filePath)

    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found for migration: ${fullPath}`)
      return filePath // Keep original path if file doesn't exist
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const fileExtension = path.extname(filePath).toLowerCase()

    // Determine MIME type based on extension
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".ogg": "video/ogg",
    }

    const mimeType = mimeTypes[fileExtension] || "application/octet-stream"
    const base64Data = fileBuffer.toString("base64")

    return `data:${mimeType};base64,${base64Data}`
  } catch (error) {
    console.error(`Error migrating file ${filePath} to Base64:`, error)
    return filePath // Return original path on error
  }
}

// Function to migrate all attachments in a document
const migrateDocumentAttachments = async (document) => {
  if (!document.attachments || document.attachments.length === 0) {
    return document
  }

  const migratedAttachments = await Promise.all(
    document.attachments.map((attachment) => migrateFileToBase64(attachment)),
  )

  document.attachments = migratedAttachments
  return document
}

module.exports = {
  migrateFileToBase64,
  migrateDocumentAttachments,
}
