import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Master key resolution: from environment or persisted securely in ./data/master.key
function getMasterKey(): Buffer {
  if (process.env.DOCUMENT_MASTER_KEY && process.env.DOCUMENT_MASTER_KEY.length >= 32) {
    return crypto.createHash('sha256').update(process.env.DOCUMENT_MASTER_KEY).digest();
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const keyPath = path.join(dataDir, 'master.key');
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath);
    if (raw.length === 32) {
      return raw;
    }
  }

  // Generate new 256-bit random master key and save securely
  const newKey = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
  return newKey;
}

const MASTER_KEY = getMasterKey();

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string; // Base64 (12 bytes)
  authTag: string; // Base64 (16 bytes)
  wrappedKey: string; // Base64 (Wrapped AES-256 data key)
  checksum: string; // SHA-256 hex of original plaintext
}

/**
 * Envelope encryption:
 * 1. Generates unique 256-bit AES-GCM data key per document
 * 2. Encrypts plaintext buffer with data key
 * 3. Wraps data key using server master key (AES-256-GCM)
 * 4. Computes SHA-256 integrity checksum
 */
export function encryptDocumentBuffer(plaintextBuffer: Buffer): EncryptedPayload {
  // 1. Generate random 256-bit AES data key
  const dataKey = crypto.randomBytes(32);

  // 2. Encrypt plaintext with data key (AES-256-GCM)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. Wrap dataKey with MASTER_KEY (AES-256-GCM)
  const wrapIv = crypto.randomBytes(12);
  const wrapCipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, wrapIv);
  const wrappedKeyBytes = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
  const wrapTag = wrapCipher.getAuthTag();

  // Pack wrapped key as: wrapIv(12) + wrapTag(16) + wrappedKeyBytes(32)
  const packedWrappedKey = Buffer.concat([wrapIv, wrapTag, wrappedKeyBytes]);

  // 4. Compute SHA-256 checksum of original plaintext
  const checksum = crypto.createHash('sha256').update(plaintextBuffer).digest('hex');

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    wrappedKey: packedWrappedKey.toString('base64'),
    checksum,
  };
}

/**
 * Zero-Disk Volatile Memory Decryption:
 * Plaintext is decrypted entirely in RAM and never written to disk.
 */
export function decryptDocumentBuffer(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedKey: string;
  checksum: string;
}): Buffer {
  const packedWrappedKey = Buffer.from(payload.wrappedKey, 'base64');
  if (packedWrappedKey.length < 28) {
    throw new Error('Invalid wrapped key payload');
  }

  // Unpack wrapped key
  const wrapIv = packedWrappedKey.subarray(0, 12);
  const wrapTag = packedWrappedKey.subarray(12, 28);
  const wrappedKeyBytes = packedWrappedKey.subarray(28);

  const wrapDecipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, wrapIv);
  wrapDecipher.setAuthTag(wrapTag);
  const dataKey = Buffer.concat([wrapDecipher.update(wrappedKeyBytes), wrapDecipher.final()]);

  // Decrypt ciphertext using dataKey
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Verify SHA-256 checksum
  const actualChecksum = crypto.createHash('sha256').update(decrypted).digest('hex');
  if (actualChecksum !== payload.checksum) {
    throw new Error('Cryptographic integrity check failed: SHA-256 checksum mismatch');
  }

  return decrypted;
}

/**
 * Magic-byte MIME type validation
 */
export function validateFileMagicBytes(buffer: Buffer, fileType: string): { valid: boolean; detectedMime: string } {
  if (buffer.length < 4) {
    return { valid: false, detectedMime: 'unknown' };
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: fileType === 'pdf', detectedMime: 'application/pdf' };
  }

  // DOCX: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { valid: fileType === 'docx', detectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  // TXT or MD: Check for valid text encoding
  if (fileType === 'txt' || fileType === 'md') {
    // Check if buffer contains null bytes or binary control characters
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        return { valid: false, detectedMime: 'binary/octet-stream' };
      }
    }
    return { valid: true, detectedMime: fileType === 'md' ? 'text/markdown' : 'text/plain' };
  }

  return { valid: false, detectedMime: 'unsupported' };
}

/**
 * Hash helper for share tokens and passwords
 */
export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * HMAC-signed Viewer Session Token for authorized in-app viewing sessions
 */
const SESSION_SECRET = crypto.createHash('sha256').update(MASTER_KEY.toString('hex') + '_viewer_secret').digest();

export interface ViewerSessionData {
  shareId: string;
  recipientEmail: string;
  expiresAt: number; // unix timestamp in ms
  allowDownload: boolean;
}

export function createViewerSessionToken(data: ViewerSessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyViewerSessionToken(token: string): ViewerSessionData | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const data: ViewerSessionData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.expiresAt) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
