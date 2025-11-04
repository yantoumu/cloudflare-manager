import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// 审计操作类型常量
export const AuditAction = {
  // 认证相关
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  INIT_PASSWORD: 'INIT_PASSWORD',
  
  // 账号管理
  CREATE_ACCOUNT: 'CREATE_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_ACCOUNT',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  EXPORT_ACCOUNTS: 'EXPORT_ACCOUNTS',
  IMPORT_ACCOUNTS: 'IMPORT_ACCOUNTS',
  
  // 账号操作
  HEALTH_CHECK: 'HEALTH_CHECK',
  
  // Job相关 (可选，根据需要记录)
  CREATE_JOB: 'CREATE_JOB',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

export interface AuditLogEntry {
  id: string;
  action: AuditActionType;
  userId: string | null;
  target: string | null;      // 目标资源ID（如accountId, jobId等）
  ipAddress: string | null;
  userAgent: string | null;
  details: string | null;     // JSON格式的额外信息
  createdAt: string;
}

/**
 * 记录审计日志
 */
export function logAudit(
  db: Database.Database,
  action: AuditActionType,
  userId: string | null = null,
  target: string | null = null,
  ipAddress: string | null = null,
  userAgent: string | null = null,
  details?: any
): void {
  try {
    const id = nanoid();
    const detailsJson = details ? JSON.stringify(details) : null;

    db.prepare(
      `INSERT INTO audit_logs (id, action, user_id, target, ip_address, user_agent, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(id, action, userId, target, ipAddress, userAgent, detailsJson);
  } catch (error: any) {
    // 审计日志失败不应阻塞业务逻辑，仅记录错误
    console.error('Failed to log audit:', error.message);
  }
}

/**
 * 查询审计日志
 */
export function getAuditLogs(
  db: Database.Database,
  options: {
    limit?: number;
    action?: AuditActionType;
    userId?: string;
    target?: string;
  } = {}
): AuditLogEntry[] {
  const { limit = 100, action, userId, target } = options;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }

  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  if (target) {
    query += ' AND target = ?';
    params.push(target);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(row => ({
    id: row.id,
    action: row.action,
    userId: row.user_id,
    target: row.target,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    details: row.details,
    createdAt: row.created_at,
  }));
}
