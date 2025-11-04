# 部署问题修复记录

## 修复日期
2025-11-04

## 问题总结

### 问题1: JWT_SECRET 环境变量未加载 ❌

**错误信息**:
```
Error: FATAL: JWT_SECRET environment variable is not set.
Generate one with: openssl rand -base64 32
```

**根本原因**:
ES Modules 导入顺序问题导致环境变量验证在 `dotenv.config()` 执行前就运行了。

**解决方案**:
1. 创建统一配置模块 `src/config.ts`
2. 在所有模块之前加载并验证环境变量
3. 修改 `src/index.ts` 和 `src/middleware/auth.ts` 使用统一配置

**修改文件**:
- ✅ 新建: `src/config.ts`
- ✅ 修改: `src/middleware/auth.ts`
- ✅ 修改: `src/index.ts`

---

### 问题2: better-sqlite3 与 Node.js 24 不兼容 ❌

**错误信息**:
```
Error: Could not locate the bindings file
error: "C++20 or later required."
```

**根本原因**:
- Node.js 24.4.1 要求 C++20 支持
- better-sqlite3@9.2.2 不支持 Node.js 24

**解决方案**:
升级 better-sqlite3 到最新版本 (12.4.1)

```bash
npm install better-sqlite3@latest --save
```

**版本变更**:
- 旧版本: better-sqlite3@9.2.2
- 新版本: better-sqlite3@12.4.1

---

## 验证结果 ✅

### 1. 配置加载成功
```
✅ Configuration loaded successfully
   Environment: development
   Port: 3000
   Database: ./data.db
   JWT Secret: JcATswT8... (44 chars)
```

### 2. 数据库初始化成功
```
Running migration: Inserting initial script templates...
Migration completed: Inserted 3 initial templates
Database initialized
```

### 3. 服务器启动成功
```
Server running on port 3000
WebSocket ready for connections
```

### 4. 健康检查通过
```bash
$ curl http://localhost:3000/health
{
  "status": "ok",
  "timestamp": "2025-11-04T03:18:30.008Z"
}
```

### 5. JWT 验证正常
```bash
$ curl http://localhost:3000/api/templates
{
  "error": "No token provided"
}
```

---

## 技术细节

### 统一配置模块设计

`src/config.ts` 负责:
1. **环境变量加载**: 在所有模块之前执行 `dotenv.config()`
2. **环境变量验证**: 检查必需的配置项（JWT_SECRET、长度等）
3. **配置导出**: 提供类型安全的统一配置对象
4. **启动日志**: 输出关键配置信息（脱敏）

### ES Modules 导入顺序
```typescript
// src/index.ts
// ✅ 正确：首先导入配置
import { config } from './config.js';

// ✅ 然后导入其他模块
import { authenticateToken } from './middleware/auth.js';
```

### better-sqlite3 升级影响
- ✅ 支持 Node.js 24.x
- ✅ 性能提升
- ✅ 更好的 TypeScript 支持
- ⚠️ API 保持向后兼容

---

## 环境要求

### 必需环境变量
```bash
JWT_SECRET=<至少32字符的随机密钥>
```

### 可选环境变量
```bash
PORT=3000
NODE_ENV=development
DB_PATH=./data.db
CLIENT_URL=http://localhost:5173
DEBUG_CF_API=false
```

### 生成 JWT_SECRET
```bash
openssl rand -base64 32
```

---

## 部署检查清单

- [x] 环境变量正确配置
- [x] JWT_SECRET 至少32字符
- [x] better-sqlite3 版本 >= 12.0.0
- [x] Node.js 版本 >= 18.0.0
- [x] 数据库文件路径可写
- [x] 端口 3000 未被占用
- [x] 健康检查接口正常
- [x] JWT 验证中间件正常

---

## 相关文件

### 新增文件
- `src/config.ts` - 统一配置模块

### 修改文件
- `src/index.ts` - 使用统一配置
- `src/middleware/auth.ts` - 使用统一配置

### 依赖更新
- `package.json` - better-sqlite3@12.4.1

---

## 参考资料

- [better-sqlite3 官方文档](https://github.com/WiseLibs/better-sqlite3)
- [Node.js ES Modules](https://nodejs.org/api/esm.html)
- [dotenv 文档](https://github.com/motdotla/dotenv)

---

## 下一步建议

1. **生产部署**:
   ```bash
   # 使用 Docker（推荐）
   docker-compose up -d
   ```

2. **本地开发**:
   ```bash
   npm run dev
   ```

3. **生产构建**:
   ```bash
   npm run build
   npm start
   ```

4. **环境变量管理**:
   - 生产环境使用独立的 `.env.production`
   - 不要将 `.env` 文件提交到 Git
   - 使用密钥管理服务（如 AWS Secrets Manager）

5. **监控建议**:
   - 配置应用监控（如 PM2）
   - 设置健康检查告警
   - 监控数据库文件大小和性能

---

## 常见问题

### Q: JWT_SECRET 错误仍然出现？
A: 确保 `.env` 文件在项目根目录，且 `JWT_SECRET` 值至少32字符

### Q: better-sqlite3 编译失败？
A: 升级到最新版本：`npm install better-sqlite3@latest`

### Q: 端口已被占用？
A: 修改 `.env` 中的 `PORT` 值，或停止占用进程：
```bash
lsof -ti:3000 | xargs kill -9
```

### Q: Docker 部署推荐吗？
A: 是的！Docker 使用 Node.js 18 LTS，稳定且避免本地环境差异

---

**修复完成时间**: 2025-11-04 11:18 CST
**修复人员**: Claude Code AI Assistant
**状态**: ✅ 已验证，服务正常运行
