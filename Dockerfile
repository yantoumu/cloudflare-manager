# Build stage - 编译 TypeScript 和安装依赖
FROM node:18-bookworm AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Install production dependencies only in separate directory
RUN npm ci --omit=dev --ignore-scripts

# Production stage - 运行时镜像
FROM node:18-bookworm-slim AS runtime

WORKDIR /app

# 安装运行时所需的工具 (用于健康检查等)
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder --chown=node:node /build/dist ./dist
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/package*.json ./

# Copy public directory (frontend)
COPY --chown=node:node public ./public

# 准备数据目录
RUN mkdir -p /app/data && chown node:node /app/data

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/data.db

# 保持默认 root 用户以确保挂载卷可写

# Start application
CMD ["node", "dist/index.js"]
