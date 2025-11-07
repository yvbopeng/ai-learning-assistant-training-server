# AI Learning Assistant training Server

本项目为 AI 学习助理启动器后端服务，基于 TypeScript、Express、TypeORM、PostgreSQL 构建，支持用户管理、每日总结、课程安排、学习记录、AI 交互等功能。

## 注意事项

每当修改或新增接口的方法名、路由、参数或返回值时，需重启项目服务，才能在接口文档和实际 API 中看到最新的变更。否则文档和接口不会自动更新。

## 启动与打包命令

### 1. 安装依赖
```bash
npm install
```

### 2. 热更新开发启动（推荐开发时使用）
```bash
npm run dev
# 或
npx nodemon
```

### 3. 普通启动（编译后运行）
```bash
npm start         # 启动编译后的 JS
```

### 4. 打包（仅 Node 运行环境部署）
```bash
npm run build     # 生成 dist 目录
# 将 dist/ 及 package.json、package-lock.json 、.env 拷贝到服务器
```

### 5. 启动后访问接口文档
http://localhost:3000/docs

---

### 6. 数据库初始化脚本

`src/scripts/initDB.ts`：数据库自动创建脚本。

- 作用：用于在 PostgreSQL 中自动创建项目所需的数据库（如数据库不存在时自动创建，已存在则跳过）。
- 使用方法：
	```bash
	npm run db:init # 一般不需要自己执行 启动程序时候会自动执行
	```
	该命令会根据 `.env` 配置连接数据库服务器，自动检查并创建数据库，适合首次部署或本地开发初始化数据库环境。
---

### 7. 容器内数据库初始化脚本
从数据库导出sql文件
```shell
pg_dump -h localhost -p 5432 -U postgres -C ai_learning_db -F p -f backup.sql
```
将导出的文件存放为项目的[init.sql](init.sql)，这样打包出来的容器就会带有这些数据了

## 接口设计注意事项 (控制器接口命名与路由规范)

- **单表基础操作**（不涉及连表/复杂业务）：
	- 推荐统一使用如下 路由 和 方法名：
		- `search`：分页/条件查询（如 searchUsers、searchCourses）
		- `getById`：主键查询单条（如 getUserById、getCourseById）
		- `add`：新增（如 addUser、addCourse）
		- `update`：更新（如 updateUser、updateCourse）
		- `delete`：删除（如 deleteUser、deleteCourse）
	- 这样便于前后端协作、接口文档自动生成、维护统一性。
- **涉及连表、特殊业务或复杂功能**：
	- 可根据实际业务自定义方法名和路由，如 `getUserWithCourses`、`getCourseChaptersSectionsByUser`。
	- 建议方法名和路由能清晰表达业务含义，避免歧义。
- 每次新增或修改接口后，需重启服务以刷新接口文档。
- **扩展模型或接口**：
	- 请参考 `src/models/` 与 `src/controllers/` 目录，在 `src/models/` 添加model后需要在 `config/database.ts`  添加引用。

## 项目结构

```
├── combined.log                # 请求日志
├── error.log                   # 错误日志
├── nodemon.json                # nodemon 配置
├── package.json                # 项目依赖与脚本
├── tsconfig.json               # TypeScript 配置
├── .env                        # 服务器和数据库配置文件
├── src/
│   ├── app.ts                  # 应用入口
│   ├──build/                   # 此文件夹下为 tsoa 自动生成的路由
│   ├── config/
│   │   └── database.ts         # 数据库配置与连接,新创建model后需要添加再此处
│   ├── controllers/            # 控制器
│   │   ├── baseController.ts   # 统一响应基类
│   │   ├── userController.ts   # 用户相关接口
│   │   └── dailySummaryController.ts # 每日总结接口
│   ├── middleware/
│   │   └── errorHandler.ts     # 错误处理中间件
│   ├── models/                 # 数据表模型
│   │   ├── index.ts            # 模型汇总与同步
│   │   ├── user.ts             # 用户模型
│   │   ├── dailySummary.ts     # 每日总结模型
│   │   ├── courseSchedule.ts   # 课程安排模型
│   │   ├── learningRecord.ts   # 学习记录模型
│   │   ├── title.ts            # 称号模型
│   │   └── aiInteraction.ts    # AI 交互模型
│   └── scripts/
│       └── initDB.ts           # 数据库自动创建脚本
│   ├── types/                  # 接口的扩展类型，里面存放接口请求和相应的类型
│   │   ├── express.ts          # 扩展类型定义
│   │   ├── user.ts             # 用户类型
│   │   └── dailySummary.ts     # 每日总结类型
│   └── utils/
│       └── logger.ts           # 日志工具
```

## 技术栈与主要依赖

- **TypeScript**：类型安全的 JavaScript 超集
- **Express**：Web 服务框架
- **TypeORM**：ORM，支持 PostgreSQL
- **PostgreSQL**：关系型数据库
- **tsoa**：基于注解的接口文档与路由生成
- **Multer**：文件上传中间件（可选，支持头像上传）
- **dotenv**：环境变量管理
- **helmet/cors/morgan**：安全、跨域、日志中间件

## 主要功能
- 用户注册、信息管理
- 每日学习总结增删改查
- 课程安排、学习记录、AI 交互等扩展
- 统一 API 响应格式
- 支持 OpenAPI/Swagger 文档自动生成

