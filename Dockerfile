# ============================================
# Stage 1: Builder - 编译和构建
# ============================================
FROM node:18-alpine AS builder

WORKDIR /build

# 安装构建依赖（better-sqlite3 需要原生模块编译）
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci --quiet

# 复制源代码
COPY tsconfig.json ./
COPY src ./src

# 编译 TypeScript
RUN npm run build

# 清理开发依赖，保留生产依赖和原生模块
RUN npm prune --omit=dev

# ============================================
# Stage 2: Runtime - 最小化运行镜像
# ============================================
FROM node:18-alpine AS runtime

WORKDIR /app

# 只安装运行时必需的工具
RUN apk add --no-cache \
    wget \
    ca-certificates \
    sqlite-libs

# 从 builder 复制编译后的应用
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package*.json ./

# 复制前端静态文件
COPY public ./public

# 创建数据目录（确保权限正确）
RUN mkdir -p /app/data && chmod 777 /app/data

# 暴露端口
EXPOSE 3000

# 环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/data.db

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# 启动应用（保持 root 用户以确保 volume 可写）
CMD ["node", "dist/index.js"]
