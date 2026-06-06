# 越群山知识库RAG系统 - 前端

基于 Vue3 + Vite + Element Plus 的知识库RAG前端界面。

## 技术栈

- **Vue 3.5** + Composition API
- **Vite 5** 构建工具
- **TypeScript** 类型支持
- **Element Plus** UI组件库
- **Pinia** 状态管理
- **Vue Router** 路由
- **Axios** HTTP请求
- **marked** + **highlight.js** Markdown渲染

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

默认在 http://localhost:5173 启动，API请求自动代理到 http://localhost:8000。

### 3. 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/kb` | 知识库管理 | 创建/删除/重命名知识库，卡片式列表 |
| `/documents` | 文档管理 | 文件上传/解析/分块预览/删除 |
| `/chat` | RAG问答 | 对话界面，流式输出，溯源面板 |
| `/history` | 对话历史 | 历史会话查看/续聊/导出 |
| `/vector` | 向量管理 | 向量状态/重建任务/清理 |
| `/settings` | 系统设置 | LLM/Embedding配置/连接检测 |

## Docker 部署

```bash
docker build -t ox-web .
docker run -p 80:80 ox-web
```

## 项目结构

```
ox-web/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── Dockerfile
├── nginx.conf
├── src/
│   ├── main.ts            # 入口
│   ├── App.vue            # 布局（左侧导航）
│   ├── router/            # 路由配置
│   ├── stores/            # Pinia 状态
│   ├── api/               # Axios + 接口模块
│   ├── views/             # 6个页面组件
│   └── assets/            # 样式
└── public/
```
