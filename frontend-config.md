# 前端配置说明

## 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# 后端服务器配置
VITE_BACKEND_URL=http://localhost:3001/api/coze

# 应用配置
VITE_APP_TITLE=AI智能助手
VITE_APP_VERSION=1.0.0
```

## 架构说明

### 修改前
```
前端 → 直接访问 Coze API
```

### 修改后
```
前端 → 后端服务器 → Coze API
```

## 主要变化

1. **前端API文件** (`src/api/cozeApi.js`)
   - 移除了所有敏感配置信息
   - 只保留后端服务器URL配置
   - 所有请求都通过后端服务器转发

2. **后端服务器** (`server/`)
   - 包含所有API配置信息
   - 处理与Coze API的通信
   - 提供统一的API接口

## 启动步骤

1. **启动后端服务器**
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **启动前端应用**
   ```bash
   npm run dev
   ```

## 优势

- 🔒 **安全性**: 敏感信息不在前端暴露
- 🌐 **网络隔离**: 前端不需要直接访问外部网络
- 🛠️ **可维护性**: 配置集中管理
- 📱 **灵活性**: 可以轻松切换API提供商

## 注意事项

- 确保后端服务器在3001端口运行
- 前端默认访问 `http://localhost:3001/api/coze`
- 如需修改端口，请同时更新前端和后端配置
