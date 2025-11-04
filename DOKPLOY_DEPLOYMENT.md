# Dokploy 部署指南

本指南介绍如何将 Cloudflare Manager 部署到 Dokploy。

## 前置要求

1. **GitHub 仓库**: 代码已推送到 GitHub
2. **Dokploy 实例**: 已安装并运行 Dokploy
3. **域名** (可选): 配置域名指向 Dokploy 服务器

## 部署步骤

### 1. 在 Dokploy 创建项目并绑定 GitHub

1. 登录 Dokploy 控制面板
2. 创建新项目
3. 选择 "GitHub Repository" 作为源
4. 连接并选择你的 GitHub 仓库 (cloudflare-manager)
5. 配置构建设置:
   - Dockerfile 路径: `./Dockerfile`
   - 自动部署: 启用 (推送到 master/main 分支时自动部署)
6. 配置环境变量:

```bash
JWT_SECRET=your-strong-jwt-secret-here  # 使用 openssl rand -base64 32 生成
CLIENT_URL=https://your-frontend-domain.com
NODE_ENV=production
PORT=3000
DB_PATH=/app/data/data.db
```

7. 配置卷挂载:
   - 卷名: `cloudflare-data`
   - 挂载点: `/app/data`

8. 配置端口映射:
   - 容器端口: `3000`
   - 公开端口: `3000` 或自定义

9. (可选) 配置域名和 SSL

### 2. 触发部署

部署会在以下情况自动触发:
- 推送代码到 `main` 或 `master` 分支
- 在 Dokploy 控制面板手动点击 "Deploy"

### 3. 验证部署

1. **检查 Dokploy**:
2. **访问应用**:
   ```bash
   curl https://your-domain.com/api/health
   ```

## 自动化部署流程

Dokploy 已绑定 GitHub 仓库,部署流程如下:

1. **代码推送**: 推送代码到 GitHub master/main 分支
2. **自动触发**: Dokploy 检测到仓库变化,自动触发构建
3. **构建镜像**: 使用项目中的 Dockerfile 构建镜像
4. **部署更新**: 自动部署新版本并重启容器

### 配置文件

- **dokploy.json**: Dokploy 项目配置参考 (可选)
- **Dockerfile**: 容器构建配置

## 手动触发部署

在 Dokploy 控制面板中点击项目的 "Deploy" 按钮即可手动触发部署。

## 数据持久化

**重要**: 数据存储在 `/app/data` 目录,必须挂载卷以避免数据丢失:

- **卷名**: `cloudflare-data` (由 Dokploy 管理)
- **挂载点**: `/app/data`
- **包含文件**: 
  - `data.db`: SQLite 数据库
  - `data.db-wal`: WAL 日志
  - `data.db-shm`: 共享内存

### 数据备份

```bash
# 在 Dokploy 服务器上
docker exec <container-id> sqlite3 /app/data/data.db ".backup /app/data/backup.db"
docker cp <container-id>:/app/data/backup.db ./backup-$(date +%Y%m%d).db
```

## 环境变量详解

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | **是** | - | JWT 签名密钥,至少 32 字符 |
| `CLIENT_URL` | 否 | `http://localhost:5173` | 前端 URL,用于 CORS |
| `NODE_ENV` | 否 | `production` | 运行环境 |
| `PORT` | 否 | `3000` | 服务端口 |
| `DB_PATH` | 否 | `/app/data/data.db` | 数据库路径 |
| `DEBUG_CF_API` | 否 | `false` | 调试 Cloudflare API |

## 更新应用

推送代码到 GitHub 后,Dokploy 会自动:
1. 检测到仓库变化
2. 构建新镜像
3. 部署并重启容器

## 故障排查

### 问题 1: 部署失败

**检查步骤**:
```bash
# 查看 Dokploy 日志
docker logs <container-name>

# 检查环境变量
docker exec <container-name> env | grep JWT_SECRET
```

### 问题 2: 数据丢失

**原因**: 卷未正确挂载

**解决**:
1. 确认 Dokploy 中配置了卷挂载
2. 检查卷是否存在: `docker volume ls`
3. 重新创建卷并恢复备份

### 问题 3: 自动部署未触发

**检查**:
1. Dokploy 是否正确绑定了 GitHub 仓库
2. 自动部署选项是否已启用
3. Webhook 是否配置正确

### 问题 4: 容器无法启动

**常见原因**:
- `JWT_SECRET` 未设置或太短
- 端口冲突
- 卷权限问题

**解决**:
```bash
# 查看详细错误
docker logs <container-name> --tail 100

# 检查端口占用
netstat -tulpn | grep 3000
```

## 安全建议

1. **强 JWT Secret**: 使用 `openssl rand -base64 32` 生成
2. **HTTPS**: 在 Dokploy 中配置 SSL 证书
3. **防火墙**: 仅暴露必要端口
4. **定期备份**: 设置自动数据库备份
5. **日志监控**: 配置 Dokploy 日志告警

## 相关资源

- [Dokploy 官方文档](https://docs.dokploy.com)
- [Docker 部署指南](./README.md#docker-deployment)

## 需要帮助?

遇到问题请检查:
1. Dokploy 部署日志
2. 容器运行日志: `docker logs <container-name>`
3. GitHub Webhook 日志 (在 GitHub 仓库 Settings → Webhooks 中查看)
