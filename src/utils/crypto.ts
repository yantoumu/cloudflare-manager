import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT = 'cloudflare-manager-salt'; // 固定salt用于密钥派生

// 获取加密密钥（从环境变量派生）
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set for encryption');
  }

  // 使用scrypt从密钥派生固定长度的加密密钥
  return crypto.scryptSync(secret, SALT, KEY_LENGTH);
}

/**
 * 加密敏感字段
 * @param plaintext 明文
 * @returns 加密后的字符串，格式: iv:authTag:ciphertext (base64编码)
 */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error: any) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt field');
  }
}

/**
 * 解密敏感字段
 * @param encrypted 加密字符串，格式: iv:authTag:ciphertext
 * @returns 解密后的明文
 */
export function decryptField(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;

  // 如果不包含冒号，可能是未加密的明文（向后兼容）
  if (!encrypted.includes(':')) {
    console.warn('Attempting to decrypt unencrypted field, returning as-is');
    return encrypted;
  }

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt field');
  }
}

/**
 * 脱敏显示敏感信息
 * @param value 敏感值
 * @param showLength 显示前N个字符，默认8
 * @returns 脱敏后的字符串，如 "abcd1234***"
 */
export function maskSensitive(value: string | null | undefined, showLength: number = 8): string | null {
  if (!value) return null;
  
  if (value.length <= showLength) {
    return '***';
  }

  return value.substring(0, showLength) + '***';
}

/**
 * 检查字段是否已加密（通过格式判断）
 * @param value 待检查的值
 * @returns true=已加密, false=明文
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  // 加密格式: base64:base64:base64 (包含两个冒号)
  return value.split(':').length === 3;
}
