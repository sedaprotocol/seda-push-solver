import { Buffer } from 'buffer';

/**
 * Convert hex string from little-endian bytes to number
 */
export function hexLEToNumber(hexString: string): number {
  if (!hexString) return 0;
  
  const cleanHex = hexString.replace(/^0x/, '');
  const buffer = Buffer.from(cleanHex, 'hex');
  
  // Read as little-endian number
  let result = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      result += byte * Math.pow(256, i);
    }
  }
  return result;
}

/**
 * Convert hex string from little-endian bytes to string
 */
export function hexLEToString(hexString: string): string {
  if (!hexString) return '';
  
  try {
    const cleanHex = hexString.replace(/^0x/, '');
    const buffer = Buffer.from(cleanHex, 'hex');
    return buffer.toString('utf8');
  } catch {
    return `[Invalid UTF-8: ${hexString}]`;
  }
} 