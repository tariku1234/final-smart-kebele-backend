const path = require("path")

// Utility to convert file to Base64
const convertFileToBase64 = (file) => {
  if (!file || !file.buffer) {
    return null
  }

  const base64Data = file.buffer.toString("base64")
  const mimeType = file.mimetype
  const fileName = file.originalname
  const fileSize = file.size

  return {
    data: `data:${mimeType};base64,${base64Data}`,
    mimeType,
    fileName,
    fileSize,
    encoding: "base64",
  }
}

// Utility to convert multiple files to Base64
const convertFilesToBase64 = (files) => {
  if (!files || files.length === 0) {
    return []
  }

  return files.map((file) => convertFileToBase64(file)).filter(Boolean)
}

// Utility to extract file info from Base64 data URL
const extractFileInfo = (base64DataUrl) => {
  if (!base64DataUrl || !base64DataUrl.startsWith("data:")) {
    return null
  }

  try {
    const [header, data] = base64DataUrl.split(",")
    const mimeType = header.match(/data:([^;]+)/)?.[1]
    const encoding = header.includes("base64") ? "base64" : "text"

    return {
      mimeType,
      encoding,
      data: data,
      size: Math.round((data.length * 3) / 4), // Approximate original file size
    }
  } catch (error) {
    console.error("Error extracting file info from Base64:", error)
    return null
  }
}

// Check if a string is a Base64 data URL
const isBase64DataUrl = (str) => {
  return typeof str === "string" && str.startsWith("data:") && str.includes("base64,")
}

// Check if a string is a file path
const isFilePath = (str) => {
  return typeof str === "string" && !str.startsWith("data:") && (str.startsWith("/") || str.startsWith("uploads/"))
}

// Validate file type for Base64 uploads
const validateFileType = (mimeType, allowedTypes) => {
  if (!mimeType || !allowedTypes) return false

  const allowedMimeTypes = {
    images: ["image/jpeg", "image/jpg", "image/png", "image/gif"],
    documents: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    videos: ["video/mp4", "video/webm", "video/ogg"],
    all: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4",
      "video/webm",
      "video/ogg",
    ],
  }

  const validTypes = allowedMimeTypes[allowedTypes] || allowedMimeTypes.all
  return validTypes.includes(mimeType)
}

// Validate file size for Base64 uploads (in bytes)
const validateFileSize = (base64DataUrl, maxSizeInBytes = 10 * 1024 * 1024) => {
  // Default 10MB
  if (!base64DataUrl) return false

  const fileInfo = extractFileInfo(base64DataUrl)
  if (!fileInfo) return false

  return fileInfo.size <= maxSizeInBytes
}

module.exports = {
  convertFileToBase64,
  convertFilesToBase64,
  extractFileInfo,
  isBase64DataUrl,
  isFilePath,
  validateFileType,
  validateFileSize,
}
