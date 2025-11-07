# 第一阶段：构建应用
FROM node:20-alpine AS app-builder

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./
COPY tsconfig.json ./
COPY tsoa.json ./
COPY .npmrc ./

# 安装所有依赖（包括开发依赖）
RUN npm i
# 不是重复代码，不知道为什么要执行两遍npm i才正常
RUN npm i

# 复制源代码
COPY src/ ./src/

# 构建应用
RUN npm run build:tsoa && npm run build

#第二阶段：构建前端代码
FROM node:20-alpine AS app-front-builder

RUN apk add git

# 设置工作目录
WORKDIR /app

RUN git clone --depth 1 https://github.com/ai-learning-assistant-dev/ai-learning-assistant-training-front.git

WORKDIR /app/ai-learning-assistant-training-front

# 安装所有依赖（包括开发依赖）
RUN npm i

RUN npm run build

# 第三阶段：最终镜像
FROM postgres:17-alpine

# 安装Node.js运行时
RUN apk add --no-cache nodejs npm

# 设置工作目录
WORKDIR /app

COPY --from=app-builder /app/node_modules ./node_modules
COPY --from=app-builder /app/dist ./dist
COPY --from=app-builder /app/package.json ./

# 复制环境配置文件
COPY .env ./
# 复制前端代码
COPY --from=app-front-builder /app/ai-learning-assistant-training-front/dist ./public

# 创建数据库初始化脚本目录
RUN mkdir -p /docker-entrypoint-initdb.d
COPY init.sql /docker-entrypoint-initdb.d/

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV POSTGRES_PASSWORD=123456

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pg_isready -U postgres || exit 1

# 启动命令 - 同时启动PostgreSQL和应用
CMD ["sh", "-c", "docker-entrypoint.sh postgres & sleep 10 && node dist/src/app.js"]
