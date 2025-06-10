/**
 * Hex Conversion Utilities
 * 
 * Utility functions for converting hex strings from SEDA DataRequest results
 * to human-readable numbers and strings using big-endian byte ordering.
 */

import { Buffer } from 'buffer';

/**
 * Convert hex string from big-endian bytes to number
 * @param hexString - Hex string to convert (with or without 0x prefix)
 * @returns Converted number value
 */
export function hexBEToNumber(hexString: string): number {
  if (!hexString) return 0;
  
  const cleanHex = hexString.replace(/^0x/, '');
  const buffer = Buffer.from(cleanHex, 'hex');
  
  // Read as big-endian number
  let result = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      result = result * 256 + byte;
    }
  }
  return result;
}

/**
 * Convert hex string from big-endian bytes to UTF-8 string
 * @param hexString - Hex string to convert (with or without 0x prefix)
 * @returns Converted UTF-8 string, or error message if invalid
 */
export function hexBEToString(hexString: string): string {
  if (!hexString) return '';
  
  try {
    const cleanHex = hexString.replace(/^0x/, '');
    const buffer = Buffer.from(cleanHex, 'hex');
    return buffer.toString('utf8');
  } catch {
    return `[Invalid UTF-8: ${hexString}]`;
  }
} 