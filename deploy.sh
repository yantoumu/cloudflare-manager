#!/bin/bash

###############################################################################
# Cloudflare Manager - 一键部署脚本
# 用法: bash deploy.sh
###############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

###############################################################################
# 1. 环境检查
###############################################################################

info "检查运行环境..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    error "Docker 未安装！"
    info "请先安装 Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
success "Docker 已安装: $(docker --version)"

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    error "Docker Compose 未安装！"
    exit 1
fi
success "Docker Compose 已安装"

# 检查端口占用
if lsof -i:3000 &> /dev/null; then
    warning "端口 3000 已被占用！"
    read -p "是否要停止占用进程？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti:3000 | xargs kill -9 || true
        success "已停止占用进程"
    else
        info "请修改 docker-compose.yml 中的端口映射"
        exit 1
    fi
fi

###############################################################################
# 2. 环境变量配置
###############################################################################

info "配置环境变量..."

if [ ! -f .env ]; then
    info "未找到 .env 文件，开始创建..."

    # 生成 JWT_SECRET
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -base64 32)
    elif command -v python3 &> /dev/null; then
        JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
    else
        error "无法生成 JWT_SECRET，请手动创建 .env 文件"
        exit 1
    fi

    # 创建 .env 文件
    cat > .env <<EOF
# 由部署脚本自动生成
# 生成时间: $(date)

# ============================================
# 安全配置
# ============================================

JWT_SECRET=${JWT_SECRET}

# ============================================
# 服务配置
# ============================================

PORT=3000
NODE_ENV=production
DB_PATH=/app/data/data.db
DEBUG_CF_API=false

# ============================================
# CORS 配置 (如果前后端分离部署请修改)
# ============================================

# CLIENT_URL=http://your-domain.com
EOF

    success "已创建 .env 文件"
    info "JWT_SECRET: ${JWT_SECRET:0:16}... (已自动生成)"
else
    success ".env 文件已存在"

    # 检查 JWT_SECRET
    if ! grep -q "^JWT_SECRET=.\\{32,\\}" .env; then
        error "JWT_SECRET 未设置或长度不足 32 字符！"
        info "请编辑 .env 文件设置 JWT_SECRET"
        info "生成命令: openssl rand -base64 32"
        exit 1
    fi
    success "JWT_SECRET 配置正确"
fi

###############################################################################
# 3. 构建和部署
###############################################################################

info "开始构建 Docker 镜像..."
docker-compose build --no-cache

success "镜像构建完成"

info "启动容器..."
docker-compose up -d

success "容器已启动"

###############################################################################
# 4. 部署验证
###############################################################################

info "等待服务启动..."
sleep 5

# 检查容器状态
if ! docker-compose ps | grep -q "Up"; then
    error "容器启动失败！"
    info "查看日志: docker-compose logs"
    exit 1
fi
success "容器运行正常"

# 健康检查
info "执行健康检查..."
for i in {1..10}; do
    if curl -s http://localhost:3000/health > /dev/null; then
        success "健康检查通过！"
        break
    fi
    if [ $i -eq 10 ]; then
        warning "健康检查失败，请查看日志"
        docker-compose logs --tail=50
        exit 1
    fi
    sleep 2
done

###############################################################################
# 5. 显示部署信息
###############################################################################

echo ""
echo "=========================================="
echo -e "${GREEN}部署成功！${NC}"
echo "=========================================="
echo ""
echo "📋 服务信息:"
echo "  - 访问地址: http://$(hostname -I | awk '{print $1}'):3000"
echo "  - 健康检查: http://localhost:3000/health"
echo "  - 容器名称: cloudflare-manager"
echo ""
echo "📝 常用命令:"
echo "  - 查看日志: docker-compose logs -f"
echo "  - 重启服务: docker-compose restart"
echo "  - 停止服务: docker-compose down"
echo "  - 更新应用: git pull && docker-compose up -d --build"
echo ""
echo "⚠️  重要提示:"
echo "  1. 首次访问需要设置主密码"
echo "  2. 请妥善保管 .env 文件中的 JWT_SECRET"
echo "  3. 建议配置 Nginx 反向代理和 HTTPS"
echo "  4. 定期备份数据库文件"
echo ""
echo "📖 详细文档: DOCKER_DEPLOYMENT.md"
echo "=========================================="
echo ""

# 询问是否查看日志
read -p "是否查看实时日志？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose logs -f
fi
