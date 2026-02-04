# LINE 群聊監控與客服管理系統

## 需求規格文檔 v1.0

---

## 1. 系統概述

### 1.1 專案目標
建立一個 LINE 群聊監控系統，用於：
- 記錄所有 LINE 群組的訊息
- 自動識別客戶提問並追蹤回覆狀態
- AI 分析問題分類與客戶情緒
- 管理客戶、群聊、人員資訊
- 監控客服回覆時效

### 1.2 核心功能
1. **訊息記錄**：即時接收並存儲 LINE Webhook 訊息
2. **問答追蹤**：識別提問、配對回覆、計算回覆時效
3. **AI 分析**：語義判斷、情緒分析、問題分類
4. **管理後台**：客戶、群聊、人員、權限管理
5. **操作日誌**：完整的審計軌跡

---

## 2. 技術架構

### 2.1 技術選型

| 層級 | 技術 | 版本 |
|------|------|------|
| **後端框架** | Fastify | ^4.x |
| **前端框架** | React + Vite | React 18, Vite 5 |
| **UI 組件庫** | Ant Design | ^5.x |
| **路由** | React Router | ^6.x |
| **資料庫** | PostgreSQL | 16 |
| **ORM** | Prisma | ^5.x |
| **容器化** | Docker Compose | - |
| **AI Provider** | Claude / Gemini / Ollama | 可切換 |

### 2.2 專案結構（Monorepo）

```
line-service-monitor/
├── docker-compose.yml
├── package.json
├── README.md
│
├── packages/
│   ├── server/                 # 後端
│   │   ├── src/
│   │   │   ├── index.ts                # 入口
│   │   │   ├── app.ts                  # Fastify 實例
│   │   │   ├── config/
│   │   │   │   └── index.ts            # 環境配置
│   │   │   ├── routes/
│   │   │   │   ├── webhook.ts          # LINE Webhook
│   │   │   │   ├── auth.ts             # 認證
│   │   │   │   ├── customers.ts        # 客戶管理
│   │   │   │   ├── groups.ts           # 群聊管理
│   │   │   │   ├── members.ts          # 人員管理
│   │   │   │   ├── messages.ts         # 訊息記錄
│   │   │   │   ├── issues.ts           # 問題/工單
│   │   │   │   ├── users.ts            # 後台用戶
│   │   │   │   ├── roles.ts            # 角色權限
│   │   │   │   ├── settings.ts         # 系統設定
│   │   │   │   └── analysis.ts         # AI 分析觸發
│   │   │   ├── services/
│   │   │   │   ├── line.service.ts     # LINE API 操作
│   │   │   │   ├── ai/
│   │   │   │   │   ├── provider.ts     # AI 抽象介面
│   │   │   │   │   ├── claude.ts       # Claude 實作
│   │   │   │   │   ├── gemini.ts       # Gemini 實作
│   │   │   │   │   └── ollama.ts       # Ollama 實作
│   │   │   │   ├── analysis.service.ts # 分析邏輯
│   │   │   │   └── auth.service.ts     # 認證邏輯
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.ts             # JWT 驗證
│   │   │   │   └── permission.ts       # 權限檢查
│   │   │   ├── utils/
│   │   │   │   └── logger.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # 前端
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── router/
│       │   │   └── index.tsx
│       │   ├── pages/
│       │   │   ├── Login/
│       │   │   ├── Dashboard/          # 預留
│       │   │   ├── Customers/
│       │   │   ├── Groups/
│       │   │   ├── Members/
│       │   │   ├── Messages/
│       │   │   ├── Issues/
│       │   │   ├── Users/
│       │   │   ├── Roles/
│       │   │   ├── Settings/
│       │   │   └── Logs/
│       │   ├── components/
│       │   │   ├── Layout/
│       │   │   └── common/
│       │   ├── services/
│       │   │   └── api.ts
│       │   ├── stores/
│       │   │   └── auth.ts
│       │   ├── hooks/
│       │   └── utils/
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
└── docs/
    └── REQUIREMENTS.md         # 本文件
```

---

## 3. 資料模型

詳見 `packages/server/prisma/schema.prisma`

---

## 4. 功能模組詳細規格

### 4.1 LINE Webhook 接收

**路由**: `POST /api/webhook/line`

**功能**:
1. 驗證 LINE Signature
2. 解析 webhook events
3. 處理 message event：
   - 查詢或建立 Group
   - 查詢或建立 Member
   - 建立 GroupMember 關聯
   - 儲存 Message
4. 處理 join/leave event（群組加入/離開）
5. 處理 memberJoined/memberLeft event（成員變動）

**不做即時 AI 分析**，分析由手動觸發。

---

### 4.2 匯總分析功能

**路由**: `POST /api/analysis/run`

**參數**:
```typescript
{
  groupId?: number      // 指定群組，不填則分析全部
  since?: string        // 起始時間，預設最後一次分析時間
}
```

---

### 4.3 客戶管理

**頁面**: `/customers`

**API**:
- `GET /api/customers` - 列表
- `GET /api/customers/:id` - 詳情
- `POST /api/customers` - 新增
- `PUT /api/customers/:id` - 更新
- `DELETE /api/customers/:id` - 刪除
- `PUT /api/customers/:id/groups` - 更新綁定群聊

---

### 4.4 群聊管理

**頁面**: `/groups`

**API**:
- `GET /api/groups` - 列表
- `GET /api/groups/:id` - 詳情
- `PUT /api/groups/:id` - 更新
- `GET /api/groups/:id/messages` - 訊息歷史
- `GET /api/groups/:id/issues` - 問答記錄

---

### 4.5 人員管理

**頁面**: `/members`

**API**:
- `GET /api/members` - 列表
- `GET /api/members/:id` - 詳情
- `PUT /api/members/:id` - 更新（標記角色）
- `GET /api/members/:id/messages` - 發言歷史

---

### 4.6 訊息記錄

**頁面**: `/messages`

**API**:
- `GET /api/messages` - 列表（支援篩選）
- `GET /api/messages/:id` - 詳情

---

### 4.7 問題追蹤

**頁面**: `/issues`

**API**:
- `GET /api/issues` - 列表
- `GET /api/issues/:id` - 詳情
- `PUT /api/issues/:id` - 更新狀態

---

### 4.8-4.11 後台管理

- 用戶管理 `/users`
- 角色權限 `/roles`
- 系統設定 `/settings`
- 操作日誌 `/logs`

---

## 5. 開發指令

```bash
# 啟動資料庫
docker-compose up -d postgres

# 安裝依賴
npm install

# 資料庫遷移
npm run db:migrate

# 初始化資料
npm run db:seed

# 啟動開發伺服器
npm run dev
```

---

## 6. 預設帳號

- 帳號: `admin`
- 密碼: `admin123`

---

**文檔版本**: 1.0
**最後更新**: 2026-02-04
