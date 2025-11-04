# Dokploy 部署指南

本项目使用 **distroless** 镜像进行生产部署，所有编译工作在构建阶段完成，容器只负责运行。

## 架构说明

### 多阶段构建

- **Build Stage**: 使用 `node:18-bookworm` 镜像编译 TypeScript 和安装依赖
- **Production Stage**: 使用 `gcr.io/distroless/nodejs24-debian12:nonroot` 运行应用

### Distroless 镜像优势

- **安全性**: 最小化攻击面，没有包管理器、shell 等工具
- **体积小**: 只包含运行时必需的文件
- **非 root 用户**: 自动使用 `nonroot` 用户 (UID 65532) 运行

## 部署步骤

### 1. 准备 Git 仓库

确保代码已推送到 Git 仓库（GitHub/GitLab/Gitea 等）:

```bash
git add .
git commit -m "feat: add distroless dockerfile and dokploy config"
git push origin main
```

### 2. 在 Dokploy 中创建应用

#### 方式 A: 使用 Dokploy 面板（推荐）

1. 登录 Dokploy 管理面板
2. 创建新项目 → 选择 **Docker** 类型
3. 配置仓库信息:
   - **Repository URL**: `https://github.com/yourusername/cloudflare-manager`
   - **Branch**: `main`
   - **Dockerfile Path**: `./Dockerfile`
   - **Build Context**: `.`

4. 配置环境变量:
   ```
   NODE_ENV=production
   PORT=3000
   DB_PATH=/app/data/data.db
   JWT_SECRET=<使用 openssl rand -base64 32 生成>
   CLIENT_URL=https://your-frontend-domain.com
   ```

5. 配置持久化存储:
   - **Volume Name**: `cloudflare-data`
   - **Mount Path**: `/app/data`

6. 配置端口映射:
   - **Container Port**: `3000`
   - **Host Port**: `3000` (或其他可用端口)

7. 启用健康检查（可选）:
   - **Health Check Command**: `wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1`
   - **Interval**: `30s`
   - **Timeout**: `10s`
   - **Retries**: `3`

#### 方式 B: 使用配置文件（如果 Dokploy 支持）

如果 Dokploy 支持导入配置文件，可以直接导入 `dokploy.yaml`:

```bash
# 在 Dokploy 中导入配置
dokploy app create --config dokploy.yaml
```

### 3. 构建和部署

点击 **Deploy** 按钮，Dokploy 会自动:
1. 克隆 Git 仓库
2. 执行多阶段 Docker 构建
3. 创建持久化卷
4. 启动容器

### 4. 验证部署

```bash
# 检查容器状态
curl https://your-domain.com/health

# 查看日志
dokploy logs cloudflare-manager -f
```

## 本地测试 Distroless 构建

在推送到 Dokploy 之前，可以本地测试构建:

```bash
# 构建镜像
docker build -t cloudflare-manager:distroless .

# 查看镜像大小
docker images cloudflare-manager:distroless

# 运行容器
docker run -d \
  --name cloudflare-manager-test \
  -p 3000:3000 \
  -v cloudflare-data:/app/data \
  -e JWT_SECRET=your-test-secret \
  -e CLIENT_URL=http://localhost:5173 \
  cloudflare-manager:distroless

# 测试健康检查
curl http://localhost:3000/health

# 查看日志
docker logs cloudflare-manager-test

# 清理
docker stop cloudflare-manager-test
docker rm cloudflare-manager-test
```

## 环境变量说明

| 变量 | 说明 | 必需 | 示例 |
|------|------|------|------|
| `NODE_ENV` | 运行环境 | 是 | `production` |
| `PORT` | HTTP 服务端口 | 否 | `3000` |
| `DB_PATH` | SQLite 数据库路径 | 否 | `/app/data/data.db` |
| `JWT_SECRET` | JWT 签名密钥 | **是** | 使用 `openssl rand -base64 32` 生成 |
| `CLIENT_URL` | 前端 CORS 来源 | 否 | `https://your-domain.com` |
| `DEBUG_CF_API` | Cloudflare API 调试 | 否 | `false` |

## 持久化存储

**重要**: 必须挂载 `/app/data` 目录，否则数据库会在容器重启时丢失。

在 Dokploy 中配置 Volume:
- **Volume Type**: Named Volume（推荐）
- **Volume Name**: `cloudflare-data`
- **Mount Path**: `/app/data`

## 数据库备份

```bash
# 从运行中的容器备份数据库
docker cp <container-id>:/app/data/data.db ./data.db.backup

# 或使用 Dokploy CLI
dokploy exec cloudflare-manager -- cat /app/data/data.db > data.db.backup
```

## 故障排查

### 容器无法启动

```bash
# 查看容器日志
dokploy logs cloudflare-manager --tail 100

# 检查环境变量
dokploy env list cloudflare-manager
```

### 数据库权限问题

Distroless 镜像使用 `nonroot` 用户 (UID 65532)，确保挂载的卷有正确权限:

```bash
# 检查卷权限
docker volume inspect cloudflare-data

# 如果需要修复权限（使用临时容器）
docker run --rm -v cloudflare-data:/data alpine chown -R 65532:65532 /data
```

### 健康检查失败

Distroless 镜像没有 `curl` 或 `wget`，健康检查需要 Dokploy 从外部执行:

```bash
# 手动测试健康检查端点
curl http://your-domain.com/health
```

如果 Dokploy 需要在容器内执行健康检查，可能需要修改 Dockerfile 使用 `debug` 变体:

```dockerfile
# 如果需要调试工具
FROM gcr.io/distroless/nodejs24-debian12:debug-nonroot
```

## 更新部署

### 方式 A: 通过 Git 触发

1. 推送代码到 Git 仓库
2. Dokploy 自动触发重新构建（如果配置了 Webhook）
3. 或手动点击 **Redeploy** 按钮

### 方式 B: 使用 Dokploy CLI

```bash
dokploy app deploy cloudflare-manager --branch main
```

## 性能优化

### 构建缓存

Dokploy 会自动缓存 Docker 层，但可以优化构建速度:

1. 确保 `.dockerignore` 排除不必要的文件
2. 多阶段构建中，依赖安装层会被缓存

### 资源限制

在 Dokploy 中设置合理的资源限制:

```yaml
resources:
  limits:
    memory: 512M
    cpus: '0.5'
  reservations:
    memory: 256M
    cpus: '0.25'
```

## 安全建议

1. **JWT_SECRET**: 必须使用强随机密钥，至少 32 字节
2. **环境变量**: 敏感信息通过 Dokploy 密钥管理，不要提交到 Git
3. **HTTPS**: 使用 Dokploy 的 SSL/TLS 配置或反向代理（Nginx/Traefik）
4. **CORS**: 正确配置 `CLIENT_URL` 限制跨域访问
5. **定期更新**: 关注 Node.js 和依赖包的安全更新

## 监控和日志

```bash
# 实时查看日志
dokploy logs cloudflare-manager -f

# 查看容器状态
dokploy ps cloudflare-manager

# 查看资源使用
dokploy stats cloudflare-manager
```

## 回滚

如果新版本有问题，可以快速回滚:

```bash
# 回滚到上一个版本
dokploy app rollback cloudflare-manager

# 或指定版本
dokploy app rollback cloudflare-manager --version <commit-hash>
```

## 扩展阅读

- [Distroless Images](https://github.com/GoogleContainerTools/distroless)
- [Dokploy Documentation](https://dokploy.com/docs)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
