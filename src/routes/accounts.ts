import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import Database from 'better-sqlite3';
import type { AuthRequest } from '../middleware/auth.js';
import type { Account } from '../models/types.js';
import { CloudflareAPI } from '../services/CloudflareAPI.js';
import { encryptField, decryptField, maskSensitive } from '../utils/crypto.js';
import { logAudit, AuditAction } from '../services/auditLog.js';

/**
 * 将数据库行映射为Account对象，自动解密和脱敏
 * @param row 数据库行
 * @param showFull 是否显示完整凭证（默认false脱敏）
 */
function mapAccount(row: any, showFull: boolean = false): Account {
  // 解密敏感字段
  const apiToken = row.api_token ? decryptField(row.api_token) : null;
  const authEmail = row.auth_email ? decryptField(row.auth_email) : null;
  const authKey = row.auth_key ? decryptField(row.auth_key) : null;

  return {
    id: row.id,
    name: row.name,
    authType: row.auth_type,
    accountId: row.account_id,
    // 根据showFull决定显示完整值还是脱敏值
    apiToken: (showFull ? apiToken : maskSensitive(apiToken)) || undefined,
    authEmail: (showFull ? authEmail : maskSensitive(authEmail)) || undefined,
    authKey: (showFull ? authKey : maskSensitive(authKey)) || undefined,
    subdomain: row.subdomain,
    status: row.status,
    lastCheck: row.last_check,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAccountsRouter(db: Database.Database): Router {
  const router = Router();

  // 获取所有账号（默认脱敏）
  router.get('/', (req: AuthRequest, res: Response) => {
    try {
      const showFull = req.query.showFull === 'true'; // 内部使用时可传递?showFull=true
      const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as any[];
      const result = accounts.map(row => mapAccount(row, showFull));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 导出所有账号配置（需要解密）
  router.get('/export', (req: AuthRequest, res: Response) => {
    try {
      const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as any[];

      const exportLines: string[] = [];
      accounts.forEach(row => {
        // 解密后导出
        if (row.auth_type === 'token' && row.api_token) {
          const token = decryptField(row.api_token);
          exportLines.push(`${row.account_id},${token}`);
        } else if (row.auth_type === 'email-key' && row.auth_email && row.auth_key) {
          const email = decryptField(row.auth_email);
          const key = decryptField(row.auth_key);
          exportLines.push(`${row.account_id},${email},${key}`);
        }
      });

      const exportContent = exportLines.join('\n');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `cloudflare-accounts-${timestamp}.txt`;

      // 记录审计日志
      logAudit(
        db,
        AuditAction.EXPORT_ACCOUNTS,
        req.userId || 'admin',
        null,
        req.clientIp || null,
        req.headers['user-agent'] || null,
        { count: accounts.length }
      );

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取单个账号（默认脱敏）
  router.get('/:id', (req: AuthRequest, res: Response) => {
    try {
      const showFull = req.query.showFull === 'true';
      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
      if (!row) {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.json(mapAccount(row, showFull));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 创建账号
  router.post('/', (req: AuthRequest, res: Response) => {
    try {
      const { name, authType, accountId, apiToken, authEmail, authKey } = req.body;

      if (!name || !authType || !accountId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (authType === 'token' && !apiToken) {
        return res.status(400).json({ error: 'apiToken required for token auth' });
      }

      if (authType === 'email-key' && (!authEmail || !authKey)) {
        return res.status(400).json({ error: 'authEmail and authKey required for email-key auth' });
      }

      const id = nanoid();
      const now = new Date().toISOString();

      // 加密敏感字段后存储
      const encryptedToken = apiToken ? encryptField(apiToken) : null;
      const encryptedEmail = authEmail ? encryptField(authEmail) : null;
      const encryptedKey = authKey ? encryptField(authKey) : null;

      db.prepare(
        `INSERT INTO accounts (id, name, auth_type, account_id, api_token, auth_email, auth_key, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name, authType, accountId, encryptedToken, encryptedEmail, encryptedKey, 'active', now, now);

      // 记录审计日志
      logAudit(
        db,
        AuditAction.CREATE_ACCOUNT,
        req.userId || 'admin',
        id,
        req.clientIp || null,
        req.headers['user-agent'] || null,
        { name, accountId: accountId.substring(0, 8) + '***' }
      );

      const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
      res.status(201).json({
        id: account.id,
        name: account.name,
        authType: account.auth_type,
        accountId: account.account_id,
        status: account.status,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 批量导入账号
  router.post('/import', (req: AuthRequest, res: Response) => {
    try {
      const { accounts } = req.body;

      if (!Array.isArray(accounts) || accounts.length === 0) {
        return res.status(400).json({ error: 'accounts array required' });
      }

      const inserted: string[] = [];
      const errors: Array<{ line: number; error: string }> = [];

      accounts.forEach((acc, index) => {
        try {
          const { name, authType, accountId, apiToken, authEmail, authKey } = acc;

          if (!authType || !accountId) {
            throw new Error('Missing authType or accountId');
          }

          if (authType === 'token' && !apiToken) {
            throw new Error('apiToken required');
          }

          if (authType === 'email-key' && (!authEmail || !authKey)) {
            throw new Error('authEmail and authKey required');
          }

          const id = nanoid();
          const now = new Date().toISOString();
          const accountName = name || `Account ${accountId.substring(0, 8)}`;

          // 加密敏感字段
          const encryptedToken = apiToken ? encryptField(apiToken) : null;
          const encryptedEmail = authEmail ? encryptField(authEmail) : null;
          const encryptedKey = authKey ? encryptField(authKey) : null;

          db.prepare(
            `INSERT INTO accounts (id, name, auth_type, account_id, api_token, auth_email, auth_key, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            id,
            accountName,
            authType,
            accountId,
            encryptedToken,
            encryptedEmail,
            encryptedKey,
            'active',
            now,
            now
          );

          inserted.push(id);
        } catch (error: any) {
          errors.push({ line: index + 1, error: error.message });
        }
      });

      // 记录审计日志
      logAudit(
        db,
        AuditAction.IMPORT_ACCOUNTS,
        req.userId || 'admin',
        null,
        req.clientIp || null,
        req.headers['user-agent'] || null,
        { total: accounts.length, imported: inserted.length, failed: errors.length }
      );

      res.json({
        success: true,
        imported: inserted.length,
        failed: errors.length,
        errors,
        accountIds: inserted,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 更新账号
  router.put('/:id', (req: AuthRequest, res: Response) => {
    try {
      const { name, authType, accountId, apiToken, authEmail, authKey } = req.body;

      const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const now = new Date().toISOString();

      // 加密敏感字段
      const encryptedToken = apiToken ? encryptField(apiToken) : null;
      const encryptedEmail = authEmail ? encryptField(authEmail) : null;
      const encryptedKey = authKey ? encryptField(authKey) : null;

      db.prepare(
        `UPDATE accounts
         SET name = ?, auth_type = ?, account_id = ?, api_token = ?, auth_email = ?, auth_key = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        name,
        authType,
        accountId,
        encryptedToken,
        encryptedEmail,
        encryptedKey,
        now,
        req.params.id
      );

      // 记录审计日志
      logAudit(
        db,
        AuditAction.UPDATE_ACCOUNT,
        req.userId || 'admin',
        req.params.id,
        req.clientIp || null,
        req.headers['user-agent'] || null,
        { name, accountId: accountId.substring(0, 8) + '***' }
      );

      const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
      res.json({
        id: updated.id,
        name: updated.name,
        authType: updated.auth_type,
        accountId: updated.account_id,
        status: updated.status,
        updatedAt: updated.updated_at,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 删除账号
  router.delete('/:id', (req: AuthRequest, res: Response) => {
    try {
      const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
      if (!existing) {
        return res.status(404).json({ error: 'Account not found' });
      }

      // 记录审计日志
      logAudit(
        db,
        AuditAction.DELETE_ACCOUNT,
        req.userId || 'admin',
        req.params.id,
        req.clientIp || null,
        req.headers['user-agent'] || null,
        { name: existing.name, accountId: existing.account_id.substring(0, 8) + '***' }
      );

      db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 健康检查账号（使用获取子域接口）
  router.post('/:id/health-check', async (req: AuthRequest, res: Response) => {
    try {
      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
      if (!row) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const account: Account = {
        id: row.id,
        name: row.name,
        authType: row.auth_type,
        accountId: row.account_id,
        apiToken: row.api_token,
        authEmail: row.auth_email,
        authKey: row.auth_key,
        subdomain: row.subdomain,
        status: row.status,
        lastCheck: row.last_check,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      const api = new CloudflareAPI(account);

      let isHealthy = false;
      let subdomain: string | null = null;
      let errorMessage: string | null = null;

      try {
        // 使用获取子域接口作为健康检查
        subdomain = await api.getSubdomain();
        isHealthy = true;
      } catch (error: any) {
        isHealthy = false;
        errorMessage = error.message;
      }

      const status = isHealthy ? 'active' : 'error';
      const now = new Date().toISOString();

      // 同时更新状态、子域信息和错误信息
      db.prepare('UPDATE accounts SET status = ?, subdomain = ?, last_check = ?, last_error = ? WHERE id = ?').run(
        status,
        subdomain,
        now,
        errorMessage,
        req.params.id
      );

      res.json({
        healthy: isHealthy,
        status,
        subdomain,
        lastCheck: now,
        error: errorMessage
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
