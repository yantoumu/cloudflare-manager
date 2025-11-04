# 🚀 快速开始 - 3 分钟部署

## 方法1: 一键部署脚本（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/yantoumu/cloudflare-manager.git
cd cloudflare-manager

# 2. 运行部署脚本
bash deploy.sh
```

**就这么简单！** 脚本会自动：
- ✅ 检查环境（Docker、端口）
- ✅ 生成安全的 JWT_SECRET
- ✅ 创建 .env 配置文件
- ✅ 构建并启动容器
- ✅ 执行健康检查

---

## 方法2: 手动部署

```bash
# 1. 克隆项目
git clone https://github.com/yantoumu/cloudflare-manager.git
cd cloudflare-manager

# 2. 生成 JWT 密钥
openssl rand -base64 32

# 3. 创建 .env 文件
cat > .env <<EOF
JWT_SECRET=<粘贴上面生成的密钥>
NODE_ENV=production
PORT=3000
EOF

# 4. 启动服务
docker-compose up -d --build
```

---

## 访问应用

部署完成后访问: **http://你的服务器IP:3000**

**首次使用**: 系统会要求设置主密码

---

## 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新应用
git pull && docker-compose up -d --build

# 备份数据
docker cp cloudflare-manager:/app/data/data.db ./backup.db

# 健康检查
curl http://localhost:3000/health
```

---

## 环境要求

| 项目 | 要求 |
|------|------|
| Docker | 20.10+ |
| Docker Compose | 2.0+ |
| 内存 | 512MB+ |
| 磁盘 | 1GB+ |
| 端口 | 3000（可修改） |

---

## 配置 HTTPS（可选）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期（已自动配置）
```

---

## 遇到问题？

**端口被占用**:
```bash
# 查看占用进程
sudo lsof -i:3000

# 停止占用进程
lsof -ti:3000 | xargs kill -9
```

**容器启动失败**:
```bash
# 查看详细日志
docker-compose logs

# 常见原因：JWT_SECRET 未设置或太短
```

**数据库问题**:
```bash
# 重新创建数据库
docker-compose down -v
docker-compose up -d
```

---

## 详细文档

- **完整部署指南**: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
- **问题修复记录**: [DEPLOYMENT_FIX.md](DEPLOYMENT_FIX.md)
- **项目文档**: [README.md](README.md)

---

## 安全建议

✅ **必须做**:
1. 使用强随机 JWT_SECRET（至少32字符）
2. 配置防火墙只开放必要端口
3. 定期备份数据库文件
4. 使用 HTTPS（生产环境）

⚠️ **不要做**:
1. 不要将 .env 文件提交到 Git
2. 不要使用默认或弱密码
3. 不要直接暴露 3000 端口（使用 Nginx）

---

**🎉 完成！开始管理你的 Cloudflare Workers 吧！**
