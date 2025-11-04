# Docker 部署指南

## 快速开始

### 1. 服务器准备

**最低要求**:
- Docker Engine 20.10+
- Docker Compose 2.0+
- 内存: 512MB
- 磁盘: 1GB
- 端口: 3000（可自定义）

**安装 Docker（如未安装）**:
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker

# 添加当前用户到 docker 组（避免每次使用 sudo）
sudo usermod -aG docker $USER
# 重新登录生效
```

---

### 2. 下载项目代码

```bash
# 克隆仓库
git clone https://github.com/yantoumu/cloudflare-manager.git
cd cloudflare-manager
```

---

### 3. 配置环境变量 ⚠️ 重要

#### 方法1: 创建 .env 文件（推荐）

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
nano .env  # 或使用 vim/vi
```

**必须配置的环境变量**:

```bash
# ============================================
# 安全配置 (必须修改!)
# ============================================

# JWT 签名密钥 - 至少 32 字符
# 生成命令: openssl rand -base64 32
JWT_SECRET=<你的随机密钥>

# ============================================
# 可选配置
# ============================================

# 服务端口（默认 3000）
PORT=3000

# 运行环境
NODE_ENV=production

# 数据库路径（容器内路径，通常不需要改）
DB_PATH=/app/data/data.db

# 调试 Cloudflare API（生产环境建议关闭）
DEBUG_CF_API=false

# 前端访问地址（如果前后端分离部署）
# CLIENT_URL=http://your-domain.com
```

#### 生成安全的 JWT_SECRET

```bash
# 方法1: 使用 openssl（推荐）
openssl rand -base64 32

# 方法2: 使用 Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# 方法3: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**示例输出**:
```
JcATswT81oGHE9nsrBOv6DqA73qhLGGpe8NfjBg+xJk=
```

将此值复制到 `.env` 文件的 `JWT_SECRET=` 后面。

---

#### 方法2: 直接设置环境变量

如果不想创建 `.env` 文件，可以在 `docker-compose.yml` 中直接设置：

```yaml
# 编辑 docker-compose.yml
services:
  cloudflare-manager:
    environment:
      - JWT_SECRET=你的密钥  # 修改这里
      - NODE_ENV=production
      - PORT=3000
```

---

### 4. 部署应用

```bash
# 构建并启动容器（首次部署或代码更新后）
docker-compose up -d --build

# 仅启动容器（无需重新构建）
docker-compose up -d
```

**说明**:
- `-d`: 后台运行
- `--build`: 强制重新构建镜像（代码更新时必须）

---

### 5. 验证部署

```bash
# 查看容器状态
docker-compose ps

# 查看实时日志
docker-compose logs -f

# 查看最近 100 行日志
docker-compose logs --tail=100

# 测试健康检查
curl http://localhost:3000/health
```

**预期输出**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-04T03:30:00.000Z"
}
```

---

## 端口映射配置

### 修改对外端口

如果 3000 端口已被占用，可修改 `docker-compose.yml`:

```yaml
services:
  cloudflare-manager:
    ports:
      - "8080:3000"  # 外部访问 8080，内部仍是 3000
```

访问地址变为: `http://your-server-ip:8080`

---

## 数据持久化

### 数据卷说明

容器使用 **Docker Volume** 持久化数据：

```yaml
volumes:
  cloudflare-data:/app/data  # 数据库文件存储位置
```

### 数据备份

```bash
# 备份数据库
docker-compose exec cloudflare-manager cp /app/data/data.db /app/data/backup-$(date +%Y%m%d).db

# 从容器复制到宿主机
docker cp cloudflare-manager:/app/data/data.db ./backup/data.db

# 查看数据卷位置
docker volume inspect cloudflare-manager_cloudflare-data
```

### 数据恢复

```bash
# 复制备份文件到容器
docker cp ./backup/data.db cloudflare-manager:/app/data/data.db

# 重启容器
docker-compose restart
```

---

## 常用管理命令

### 容器管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 进入容器
docker-compose exec cloudflare-manager sh
```

### 更新应用

```bash
# 拉取最新代码
git pull origin master

# 重新构建并部署
docker-compose up -d --build

# 查看新容器启动日志
docker-compose logs -f --tail=50
```

### 清理资源

```bash
# 停止并删除容器（保留数据卷）
docker-compose down

# 停止、删除容器并清除数据（谨慎使用！）
docker-compose down -v

# 清理未使用的镜像
docker image prune -a
```

---

## 反向代理配置

### 使用 Nginx（推荐）

**安装 Nginx**:
```bash
sudo apt install nginx -y
```

**创建配置文件**:
```bash
sudo nano /etc/nginx/sites-available/cloudflare-manager
```

**配置内容**:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    # 前端静态文件和 API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 支持
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**启用配置**:
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/cloudflare-manager /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 配置 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 自动配置 HTTPS
sudo certbot --nginx -d your-domain.com

# 自动续期（已自动配置）
sudo certbot renew --dry-run
```

更新 `.env` 中的 `CLIENT_URL`:
```bash
CLIENT_URL=https://your-domain.com
```

重启容器:
```bash
docker-compose restart
```

---

## 安全加固

### 1. 修改默认端口

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:3000:3000"  # 仅允许本地访问
```

通过 Nginx 反向代理对外提供服务。

### 2. 启用防火墙

```bash
# UFW 防火墙
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# 不要直接开放 3000 端口
```

### 3. 使用强密钥

```bash
# 定期更换 JWT_SECRET（需要重新登录）
openssl rand -base64 48  # 更长更安全

# 更新 .env 后重启
docker-compose restart
```

### 4. 限制容器资源

```yaml
# docker-compose.yml
services:
  cloudflare-manager:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          memory: 256M
```

---

## 监控与日志

### 日志管理

```bash
# 实时查看日志
docker-compose logs -f

# 查看错误日志
docker-compose logs | grep -i error

# 限制日志大小（docker-compose.yml）
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 健康检查

```bash
# 手动健康检查
curl http://localhost:3000/health

# 检查容器健康状态
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### 性能监控

```bash
# 查看资源使用
docker stats cloudflare-manager

# 持续监控
docker stats cloudflare-manager --no-stream
```

---

## 故障排查

### 问题1: 容器启动失败

```bash
# 查看详细日志
docker-compose logs

# 常见原因:
# 1. JWT_SECRET 未设置或太短
# 2. 端口已被占用
# 3. 权限问题
```

**解决方案**:
```bash
# 检查环境变量
docker-compose config

# 检查端口占用
sudo lsof -i:3000

# 检查文件权限
ls -la /var/lib/docker/volumes/
```

### 问题2: 数据库无法写入

```bash
# 检查数据卷权限
docker volume inspect cloudflare-manager_cloudflare-data

# 重新创建数据卷
docker-compose down -v
docker-compose up -d
```

### 问题3: 无法访问服务

```bash
# 检查容器是否运行
docker-compose ps

# 检查端口映射
docker port cloudflare-manager

# 检查防火墙
sudo ufw status

# 检查 Nginx 配置
sudo nginx -t
```

### 问题4: 内存不足

```bash
# 检查内存使用
free -h
docker stats

# 限制容器内存（见上文）
# 或升级服务器配置
```

---

## 完整部署检查清单

部署前确认：

- [ ] Docker 和 Docker Compose 已安装
- [ ] 生成了强随机的 JWT_SECRET（至少32字符）
- [ ] `.env` 文件已创建并配置
- [ ] 防火墙规则已配置
- [ ] 域名 DNS 已解析（如使用域名）
- [ ] 端口 3000 未被占用
- [ ] 有足够的磁盘空间（至少1GB）

部署后验证：

- [ ] 容器状态为 `healthy`
- [ ] 健康检查接口返回 `{"status":"ok"}`
- [ ] 可以正常访问 Web 界面
- [ ] WebSocket 连接正常
- [ ] 数据库文件正常创建
- [ ] 日志无错误信息
- [ ] 反向代理配置正确（如使用）
- [ ] HTTPS 证书有效（如配置）

---

## 生产环境最佳实践

1. **定期备份**
   ```bash
   # 添加到 crontab
   0 2 * * * docker cp cloudflare-manager:/app/data/data.db /backup/cloudflare-$(date +\%Y\%m\%d).db
   ```

2. **监控告警**
   - 配置健康检查监控
   - 设置资源使用告警
   - 配置日志聚合

3. **自动更新**
   ```bash
   # 创建更新脚本 update.sh
   #!/bin/bash
   cd /path/to/cloudflare-manager
   git pull origin master
   docker-compose up -d --build
   docker-compose logs --tail=100
   ```

4. **安全审计**
   - 定期更换密钥
   - 审查访问日志
   - 更新依赖版本

---

## 快速命令参考

```bash
# 部署
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 重启
docker-compose restart

# 停止
docker-compose down

# 更新
git pull && docker-compose up -d --build

# 备份
docker cp cloudflare-manager:/app/data/data.db ./backup.db

# 健康检查
curl http://localhost:3000/health

# 清理
docker-compose down -v && docker system prune -a
```

---

## 技术支持

- **项目仓库**: https://github.com/yantoumu/cloudflare-manager
- **问题反馈**: GitHub Issues
- **文档**: README.md, DEPLOYMENT_FIX.md

---

**部署完成后，访问**: `http://your-server-ip:3000`

**首次使用需要设置主密码！**
