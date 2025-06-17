/**
 * Unified Hex String Utilities
 * Single source of truth for all hex string operations
 */

export type HexString = `0x${string}`;

/**
 * Comprehensive hex string utilities with validation and error handling
 */
export class HexUtils {
  /**
   * Normalize a hex string by adding 0x prefix if needed
   */
  static normalize(input: string | Buffer): HexString {
    if (Buffer.isBuffer(input)) {
      return `0x${input.toString('hex')}`;
    }
    
    if (typeof input !== 'string') {
      throw new Error(`Expected string or Buffer, got ${typeof input}`);
    }
    
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error('Empty hex string');
    }
    
    return trimmed.startsWith('0x') ? trimmed as HexString : `0x${trimmed}`;
  }
  
  /**
   * Strip 0x prefix from hex string
   */
  static stripPrefix(input: string): string {
    if (typeof input !== 'string') {
      throw new Error(`Expected string, got ${typeof input}`);
    }
    return input.startsWith('0x') ? input.slice(2) : input;
  }
  
  /**
   * Add 0x prefix to hex string if not present
   */
  static addPrefix(input: string): HexString {
    if (typeof input !== 'string') {
      throw new Error(`Expected string, got ${typeof input}`);
    }
    return input.startsWith('0x') ? input as HexString : `0x${input}`;
  }
  
  /**
   * Convert hex string to Buffer
   */
  static toBuffer(hex: string): Buffer {
    const cleaned = this.stripPrefix(hex);
    
    if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
      throw new Error(`Invalid hex string: ${hex}`);
    }
    
    return Buffer.from(cleaned, 'hex');
  }
  
  /**
   * Convert Buffer to hex string with 0x prefix
   */
  static fromBuffer(buffer: Buffer): HexString {
    return `0x${buffer.toString('hex')}`;
  }
  
  /**
   * Convert hex string to big-endian number
   */
  static toBigEndianNumber(hexString: string): number {
    if (!hexString) return 0;
    
    const buffer = this.toBuffer(hexString);
    
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
   * Convert hex string to UTF-8 string
   */
  static toUtf8String(hexString: string): string {
    if (!hexString) return '';
    
    try {
      const buffer = this.toBuffer(hexString);
      return buffer.toString('utf8');
    } catch {
      return `[Invalid UTF-8: ${hexString}]`;
    }
  }
  
  /**
   * Validate hex string format
   */
  static validate(hex: string): boolean {
    try {
      const cleaned = this.stripPrefix(hex);
      return /^[0-9a-fA-F]*$/.test(cleaned);
    } catch {
      return false;
    }
  }
  
  /**
   * Ensure hex string is exactly the specified byte length
   */
  static ensureByteLength(hex: string, bytes: number): HexString {
    const cleaned = this.stripPrefix(hex);
    const expectedLength = bytes * 2;
    
    if (cleaned.length !== expectedLength) {
      throw new Error(`Invalid hex length: expected ${expectedLength} characters (${bytes} bytes), got ${cleaned.length}. Value: ${hex}`);
    }
    
    return this.addPrefix(cleaned);
  }
  
  /**
   * Convert to bytes32 format (64 hex characters)
   */
  static toBytes32(hex: string): HexString {
    return this.ensureByteLength(hex, 32);
  }
  
  /**
   * Convert result data to proper bytes format for contracts
   */
  static resultToBytes(result: string): HexString {
    // If it's already a hex string, return normalized
    if (result.startsWith('0x') && /^0x[0-9a-fA-F]*$/.test(result)) {
      return this.normalize(result);
    }
    
    // If it's a plain hex string, add 0x prefix
    if (/^[0-9a-fA-F]+$/.test(result)) {
      return this.addPrefix(result);
    }
    
    // Otherwise, convert string to hex bytes
    const bytes = Buffer.from(result, 'utf8').toString('hex');
    return this.addPrefix(bytes);
  }
}

// Note: Legacy exports removed in Phase 3 refactoring - use HexUtils class methods directly 