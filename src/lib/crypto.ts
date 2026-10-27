import { EncryptedPayload } from '../types';

/**
 * Web Crypto API AES-256-GCM In-Memory Encryption & Decryption Engine
 * All operations take place strictly in volatile RAM.
 */

// Master system secret used for default document vault encryption
const SYSTEM_SECRET_KEY = 'haven-vault-aes256gcm-zerodisk-master-key-seed';

/**
 * Derives an AES-GCM 256-bit CryptoKey from a salt and master passphrase using PBKDF2
 */
async function deriveKey(salt: Uint8Array, secret: string = SYSTEM_SECRET_KEY): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary binary buffer or text using AES-256-GCM.
 * Never writes unencrypted bytes to disk.
 */
export async function encryptBuffer(data: ArrayBuffer | Uint8Array | string): Promise<EncryptedPayload> {
  let rawBytes: Uint8Array;
  if (typeof data === 'string') {
    rawBytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    rawBytes = data;
  } else {
    rawBytes = new Uint8Array(data);
  }

  // Generate cryptographic 12-byte IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  // Generate 16-byte salt for key derivation
  const salt = window.crypto.getRandomValues(new Uint8Array(16));

  const key = await deriveKey(salt);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128, // 16-byte auth tag
    },
    key,
    rawBytes as unknown as BufferSource
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
    algorithm: 'AES-256-GCM',
  };
}

/**
 * Decrypts an encrypted payload strictly in memory.
 * Returns decrypted bytes as Uint8Array.
 */
export async function decryptToBytes(payload: EncryptedPayload): Promise<Uint8Array> {
  const salt = base64ToBuffer(payload.salt);
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  if (salt.length === 0 || iv.length === 0 || ciphertext.length === 0) {
    throw new Error('Encrypted payload missing valid cryptographic parameters');
  }

  const key = await deriveKey(salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    key,
    ciphertext as unknown as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Decrypts an encrypted payload strictly in memory and parses as UTF-8 string.
 */
export async function decryptToString(payload: EncryptedPayload): Promise<string> {
  const bytes = await decryptToBytes(payload);
  return new TextDecoder().decode(bytes);
}

/**
 * Calculates SHA-256 hex string for tamper-evident hash chaining and checksums.
 */
export async function sha256(input: string | Uint8Array | ArrayBuffer): Promise<string> {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates high-entropy cryptographically secure random token (URL-safe)
 */
export function generateSecureToken(byteLength = 24): string {
  const randomBytes = window.crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a 6-digit numeric OTP code
 */
export function generateOtpCode(): string {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  const code = (100000 + (array[0] % 900000)).toString();
  return code;
}

/**
 * Generates unique tracking download ID e.g. DL-8492
 */
export function generateTrackingId(): string {
  const array = new Uint16Array(1);
  window.crypto.getRandomValues(array);
  const num = 1000 + (array[0] % 9000);
  return `DL-${num}`;
}

// Helper conversions
/**
 * Safely decodes base64 / base64url / data-URI strings without throwing
 * DOMException: Failed to execute 'atob' on 'Window': The string did not match the expected pattern.
 */
export function safeAtob(input: string): string {
  if (!input || typeof input !== 'string') return '';
  // Strip any data URI prefix: data:...;base64,
  let cleaned = input.includes(',') ? input.split(',')[1] : input;
  // Remove all whitespace, line breaks, and carriage returns
  cleaned = cleaned.replace(/\s+/g, '');
  // Convert URL-safe base64 (- and _) to standard (+ and /)
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' if length is not a multiple of 4
  const mod = cleaned.length % 4;
  if (mod === 2) cleaned += '==';
  else if (mod === 3) cleaned += '=';
  else if (mod === 1) {
    return '';
  }

  // Ensure only valid base64 alphabet characters exist before invoking window.atob
  if (!/^[A-Za-z0-9+/=]*$/.test(cleaned)) {
    return '';
  }

  try {
    return window.atob(cleaned);
  } catch (err) {
    console.warn('[Crypto] safeAtob decoding error:', err);
    return '';
  }
}

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return window.btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  if (!base64 || typeof base64 !== 'string') return new Uint8Array(0);
  try {
    const binary = safeAtob(base64);
    if (!binary) return new Uint8Array(0);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error('[Crypto] base64ToBuffer failed:', e);
    return new Uint8Array(0);
  }
}

