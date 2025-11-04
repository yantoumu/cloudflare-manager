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

# Production stage - distroless 镜像
FROM gcr.io/distroless/nodejs24-debian12:nonroot

WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=nonroot:nonroot /build/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /build/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /build/package*.json ./

# Copy public directory (frontend)
COPY --chown=nonroot:nonroot public ./public

# Create data directory (distroless 镜像已经使用 nonroot 用户，UID 65532)
# 注意: distroless 镜像中无法创建目录，需要在运行时挂载卷

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/data.db

# Start application (distroless 镜像自动使用 nonroot 用户)
CMD ["dist/index.js"]
