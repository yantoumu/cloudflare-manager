import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getSystemConfig, setSystemConfig } from '../db/schema.js';
import Database from 'better-sqlite3';

// 强制检查 JWT_SECRET 环境变量
if (!process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. ' +
    'Generate one with: openssl rand -base64 32'
  );
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET must be at least 32 characters long for security. ' +
    'Generate one with: openssl rand -base64 32'
  );
}

const JWT_SECRET = process.env.JWT_SECRET;
const MASTER_PASSWORD_KEY = 'master_password_hash';

export interface AuthRequest extends Request {
  userId?: string;
  clientIp?: string;  // 客户端IP地址，由中间件设置
}

// 初始化主密码
export async function initMasterPassword(db: Database.Database, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  setSystemConfig(db, MASTER_PASSWORD_KEY, hash);
}

// 验证主密码
export async function verifyMasterPassword(db: Database.Database, password: string): Promise<boolean> {
  const hash = getSystemConfig(db, MASTER_PASSWORD_KEY);
  if (!hash) {
    throw new Error('Master password not initialized');
  }
  return bcrypt.compare(password, hash);
}

// 检查主密码是否已设置
export function isMasterPasswordSet(db: Database.Database): boolean {
  return getSystemConfig(db, MASTER_PASSWORD_KEY) !== null;
}

// 生成JWT token
export function generateToken(userId: string = 'admin'): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

// JWT验证中间件
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
