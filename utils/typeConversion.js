/**
 * Utility functions for consistent type conversion
 */

/**
 * Converts a value to a number if possible, otherwise returns the original value
 * @param {*} value - The value to convert
 * @returns {number|*} - The converted number or original value
 */
const toNumber = (value) => {
    if (value === undefined || value === null) return value
  
    const num = Number(value)
    return isNaN(num) ? value : num
  }
  
  /**
   * Ensures wereda values are consistently handled as numbers
   * @param {*} wereda - The wereda value to normalize
   * @returns {number|undefined} - The normalized wereda value
   */
  const normalizeWereda = (wereda) => {
    if (wereda === undefined || wereda === null || wereda === "") return undefined
  
    const num = Number(wereda)
    return isNaN(num) ? undefined : num
  }
  
  module.exports = {
    toNumber,
    normalizeWereda,
  }
  