# Nginx 反向代理配置指南

如果你已经有 Nginx 和证书，使用此配置即可。

## 快速配置（3 步完成）

### 1. 部署应用

```bash
# 克隆项目
git clone https://github.com/yantoumu/cloudflare-manager.git
cd cloudflare-manager

# 一键部署
bash deploy.sh
```

### 2. 配置 Nginx

```bash
# 复制配置文件
sudo cp nginx.conf /etc/nginx/sites-available/cloudflare-manager

# 修改域名（重要！）
sudo nano /etc/nginx/sites-available/cloudflare-manager
# 将 server_name your-domain.com; 改为你的域名
```

**或者直接创建配置**：

```bash
sudo tee /etc/nginx/sites-available/cloudflare-manager > /dev/null <<'EOF'
server {
    listen 80;
    server_name your-domain.com;  # 修改为你的域名

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    access_log /var/log/nginx/cloudflare-manager-access.log;
    error_log /var/log/nginx/cloudflare-manager-error.log;
}
EOF
```

### 3. 启用配置并重启

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/cloudflare-manager /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 如果你已有 HTTPS 证书

修改配置文件，添加 SSL 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /path/to/your/fullchain.pem;
    ssl_certificate_key /path/to/your/privkey.pem;

    # SSL 优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    access_log /var/log/nginx/cloudflare-manager-access.log;
    error_log /var/log/nginx/cloudflare-manager-error.log;
}

# HTTP 自动跳转 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 宝塔面板用户

如果你使用宝塔面板：

1. **网站** → **添加站点** → 输入域名
2. **设置** → **反向代理** → **添加反向代理**
   - 代理名称: `cloudflare-manager`
   - 目标URL: `http://127.0.0.1:3000`
   - 发送域名: `$host`
3. **SSL** → 选择你的证书
4. 完成！

---

## 验证配置

```bash
# 测试 Nginx 配置
sudo nginx -t

# 查看 Nginx 状态
sudo systemctl status nginx

# 查看应用日志
docker compose logs -f  # v2 或 docker-compose logs -f  # v1

# 测试访问（服务器本地）
curl http://127.0.0.1:3000/health

# 测试访问（通过域名）
curl http://your-domain.com/health
```

**预期响应**：
```json
{"status":"ok","timestamp":"2025-11-04T..."}
```

---

## 常见问题

### Q: 502 Bad Gateway 错误

**原因**: 应用未启动或端口配置错误

**解决**:
```bash
# 检查容器状态
docker compose ps  # v2 或 docker-compose ps  # v1

# 检查应用是否监听 3000 端口
curl http://127.0.0.1:3000/health

# 重启应用
docker compose restart  # v2 或 docker-compose restart  # v1
```

### Q: WebSocket 连接失败

**解决**: 确保 Nginx 配置包含 WebSocket 支持：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
```

### Q: 上传文件失败

**解决**: 增加 Nginx 上传大小限制：

```nginx
client_max_body_size 10M;  # 根据需要调整
```

### Q: 如何查看 Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/cloudflare-manager-access.log

# 错误日志
sudo tail -f /var/log/nginx/cloudflare-manager-error.log
```

---

## 性能优化（可选）

### 启用 Gzip 压缩

在 `nginx.conf` 中添加：

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
```

### 启用缓存（静态资源）

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2)$ {
    proxy_pass http://127.0.0.1:3000;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 限制请求速率（防止滥用）

```nginx
# 在 http 块中添加
limit_req_zone $binary_remote_addr zone=cloudflare_limit:10m rate=10r/s;

# 在 server 块中应用
location /api/ {
    limit_req zone=cloudflare_limit burst=20 nodelay;
    proxy_pass http://127.0.0.1:3000;
    # ... 其他配置
}
```

---

## 安全建议

1. **仅监听本地端口**（已配置）
   ```yaml
   # docker-compose.yml
   ports:
     - "127.0.0.1:3000:3000"  # ✅ 只允许本地访问
   ```

2. **防火墙配置**
   ```bash
   # 不要开放 3000 端口
   sudo ufw status
   ```

3. **HTTP 跳转 HTTPS**（如上配置）

4. **定期更新证书**（如果使用 Let's Encrypt）

---

## 快速命令参考

```bash
# 重启 Nginx
sudo systemctl restart nginx

# 重载 Nginx 配置（不中断服务）
sudo systemctl reload nginx

# 测试配置
sudo nginx -t

# 查看 Nginx 状态
sudo systemctl status nginx

# 查看应用日志
docker compose logs -f  # v2 或 docker-compose logs -f  # v1

# 重启应用
docker compose restart  # v2 或 docker-compose restart  # v1

# 查看容器状态
docker compose ps  # v2 或 docker-compose ps  # v1
```

---

## 完整配置示例

**Nginx 站点配置** (`/etc/nginx/sites-available/cloudflare-manager`):

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    access_log /var/log/nginx/cloudflare-manager-access.log;
    error_log /var/log/nginx/cloudflare-manager-error.log;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

**启用并重启**:
```bash
sudo ln -s /etc/nginx/sites-available/cloudflare-manager /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

**✅ 配置完成！访问 https://your-domain.com 即可使用。**
