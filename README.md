# LINE 群聊監控與客服管理系統

LINE 群組訊息監控、問答追蹤與 AI 分析系統。

## 功能特色

- **訊息記錄**：即時接收並存儲 LINE Webhook 訊息
- **問答追蹤**：識別提問、配對回覆、計算回覆時效
- **AI 分析**：語義判斷、情緒分析、問題分類
- **管理後台**：客戶、群聊、人員、權限管理
- **操作日誌**：完整的審計軌跡

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端框架 | Fastify ^4.x |
| 前端框架 | React 18 + Vite 5 |
| UI 組件庫 | Ant Design ^5.x |
| 資料庫 | PostgreSQL 16 |
| ORM | Prisma ^5.x |
| 容器化 | Docker Compose |
| AI Provider | Claude / Gemini / Ollama |

## 快速開始

### 1. 啟動資料庫

```bash
docker-compose up -d postgres
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設定環境變數

```bash
cp packages/server/.env.example packages/server/.env
# 編輯 .env 設定資料庫連線等
```

### 4. 資料庫遷移與初始化

```bash
npm run db:migrate
npm run db:seed
```

### 5. 啟動開發伺服器

```bash
# 同時啟動前後端
npm run dev

# 或分別啟動
npm run dev:server
npm run dev:web
```

## 專案結構

```
line-service-monitor/
├── docker-compose.yml
├── package.json
├── README.md
├── packages/
│   ├── server/          # 後端 (Fastify)
│   └── web/             # 前端 (React + Vite)
└── docs/
    └── REQUIREMENTS.md  # 需求規格文檔
```

## 預設帳號

- 帳號: `admin`
- 密碼: `admin123`

> 請在正式環境更改預設密碼

## License

MIT
