# LINE 群聊監控與客服管理系統 - 產品需求文檔 (PRD)

> **版本**: 1.0.0
> **最後更新**: 2026-02-05
> **狀態**: 開發中

---

## 1. 產品概述

### 1.1 產品定位
一套完整的多渠道（LINE / 飛書）群聊監控與智能客服管理系統，透過 AI 分析自動識別客戶問題、追蹤處理狀態，並提供知識庫驅動的自動回覆功能。

### 1.2 目標用戶
- 客服團隊主管：監控客服效率、追蹤未處理問題
- 客服人員：查看客戶問題、管理回覆
- 系統管理員：配置系統、管理權限

### 1.3 核心價值
- **即時監控**：自動捕獲所有群組訊息，無需人工記錄
- **智能分析**：AI 自動識別問題、分析情緒、生成建議回覆
- **自動回覆**：知識庫驅動的 RAG 系統，自動回答常見問題
- **SLA 追蹤**：自動追蹤問題回覆時效，提醒超時問題
- **多渠道整合**：統一管理 LINE 和飛書渠道的客戶互動

---

## 2. 技術架構

### 2.1 系統架構
```
┌─────────────────────────────────────────────────────────────┐
│                     Web 管理後台 (React)                      │
│                  Ant Design 5 + Vite 5                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API 伺服器 (Fastify)                       │
│              JWT 認證 │ RBAC 權限 │ 活動日誌                   │
├─────────────────────────────────────────────────────────────┤
│  Webhook      │   業務服務層    │    AI 服務層                │
│  LINE/飛書    │  分析/知識庫    │  Claude/Gemini/Ollama       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL 資料庫                          │
│                   Prisma ORM + 向量索引                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技術棧
| 層級 | 技術選型 |
|------|----------|
| 前端 | React 18 + TypeScript + Ant Design 5 + Vite 5 |
| 後端 | Fastify 4 + TypeScript + Prisma 5 |
| 資料庫 | PostgreSQL 16 |
| AI 服務 | Gemini / Claude / Ollama (可插拔架構) |
| 向量搜尋 | Gemini Embedding + 餘弦相似度 |
| 部署 | Docker Compose |

### 2.3 AI Provider 支援
| Provider | 認證方式 | 用途 |
|----------|----------|------|
| gemini-oauth | Gemini CLI OAuth / GCP 服務帳號 | 推薦，免費額度高 |
| claude-code-oauth | Claude Code CLI OAuth | 支援 Max 訂閱 |
| claude | API Key | 直接 API 調用 |
| gemini | API Key | 直接 API 調用 |
| ollama | 本地服務 | 私有部署 |

---

## 3. 功能模組

### 3.1 Dashboard（儀表板）

#### 功能描述
提供系統概覽數據和快速操作入口。

#### 數據展示
- **問題統計**
  - 待處理問題數（PENDING 狀態）
  - 已超時問題數（TIMEOUT 狀態）
  - 今日新增問題數
  - 本週問題解決率

- **群組統計**
  - 活躍群組數
  - 今日訊息數
  - 自動回覆成功率

- **客戶統計**
  - 總客戶數
  - 風險客戶數（AT_RISK 情緒）

#### 快捷操作
- 觸發 AI 分析（手動執行）
- 查看最新問題列表
- 查看超時問題告警

#### 交互細節
1. 頁面載入時自動獲取統計數據
2. 每 60 秒自動刷新統計
3. 點擊統計卡片可跳轉到對應列表頁
4. AI 分析按鈕顯示執行狀態（執行中 / 完成）

---

### 3.2 對話管理（Groups）

#### 功能描述
管理和監控所有 LINE/飛書 群組與私聊對話。

#### 列表頁功能
| 欄位 | 說明 |
|------|------|
| 渠道 | LINE / 飛書 Tag |
| ID | 群組/私聊識別碼 |
| 名稱 | 群組名稱或用戶名稱 |
| 所屬客戶 | 關聯的客戶（可為空） |
| 知識庫分類 | 自動回覆使用的分類 |
| 自動回覆 | 開啟/關閉狀態 |
| 訊息數 | 累計訊息數量 |
| 成員數 | 群組成員數量 |
| 問題數 | 關聯問題數量 |
| 最後更新 | 最後訊息時間 |
| 操作 | 查看 / 編輯 / 刪除 |

#### 篩選條件
- 關鍵字搜尋（名稱、ID）
- 狀態篩選（ACTIVE / ARCHIVED）
- 渠道篩選（LINE / 飛書）
- 客戶篩選

#### 批量操作
- 批量刪除
- 批量更新知識庫分類
- 批量開啟/關閉自動回覆
- 批量綁定客戶

#### 詳情頁功能
- 基本資訊編輯（名稱、客戶綁定）
- 成員列表
- 訊息歷史（分頁）
- 問題追蹤記錄
- 知識庫分類配置
- 自動回覆開關

#### 交互細節
1. **列表載入**：分頁載入（每頁 20 條），支援排序
2. **搜尋防抖**：輸入 500ms 後觸發搜尋
3. **批量選擇**：Checkbox 選擇，顯示已選數量
4. **刪除確認**：彈窗二次確認，顯示影響的訊息數
5. **訊息歷史**：按時間倒序顯示，支援載入更多
6. **成員頭像**：懶加載，無頭像顯示預設圖
7. **獲取名稱**：點擊按鈕從 LINE API 獲取最新群組名稱

---

### 3.3 成員管理（Members）

#### 功能描述
管理所有渠道的用戶成員。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 頭像 | 用戶頭像 |
| 渠道 | LINE / 飛書 Tag |
| ID | 用戶識別碼 |
| 名稱 | 顯示名稱 |
| 角色 | STAFF / EXTERNAL_ADMIN / EXTERNAL |
| 所屬群組 | 關聯的群組數量 |
| 訊息數 | 累計發送訊息數 |
| 備註 | 自定義備註 |
| 操作 | 查看 / 編輯 |

#### 角色定義
| 角色 | 說明 | 用途 |
|------|------|------|
| STAFF | 客服人員 | 其訊息不觸發問題分析 |
| EXTERNAL_ADMIN | 外部管理員 | 客戶方主要聯繫人 |
| EXTERNAL | 外部用戶 | 一般用戶，訊息會觸發分析 |

#### 批量操作
- 批量刪除
- 批量獲取用戶資料（從 LINE API）

#### 詳情頁功能
- 基本資訊（頭像、名稱、ID）
- 角色設定
- 備註編輯
- 所屬群組列表
- 訊息歷史

#### 交互細節
1. **頭像獲取**：從 LINE API 獲取並快取
2. **角色變更**：下拉選擇，即時儲存
3. **批量獲取資料**：異步執行，顯示進度（成功/失敗數）

---

### 3.4 訊息查詢（Messages）

#### 功能描述
全域訊息搜尋和瀏覽。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 時間 | 訊息發送時間 |
| 渠道 | LINE / 飛書 |
| 群組 | 所屬群組（可點擊跳轉） |
| 發送者 | 成員名稱（可點擊跳轉） |
| 類型 | TEXT / IMAGE / FILE 等 |
| 內容 | 訊息內容（截斷顯示） |

#### 篩選條件
- 關鍵字搜尋（內容全文搜尋）
- 群組篩選
- 成員篩選
- 日期範圍
- 訊息類型

#### 交互細節
1. **內容預覽**：滑鼠懸停顯示完整內容
2. **圖片訊息**：顯示縮圖，點擊放大
3. **日期篩選**：支援快捷選項（今天、本週、本月）
4. **無限滾動**：滾動到底部自動載入更多

---

### 3.5 問題追蹤（Issues）

#### 功能描述
追蹤和管理 AI 識別出的客戶問題。

#### 問題狀態流程
```
PENDING (待處理)
    │
    ├─→ REPLIED (已回覆) ─→ RESOLVED (已解決)
    │         │
    │         └─→ WAITING_CUSTOMER (等待客戶回覆) ─→ TIMEOUT (超時)
    │
    └─→ IGNORED (已忽略)
```

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 狀態 | 當前狀態 Badge |
| 問題摘要 | AI 生成的問題描述 |
| 客戶 | 關聯客戶 |
| 群組 | 發生群組 |
| 提問者 | 提出問題的成員 |
| 情緒 | POSITIVE / NEUTRAL / NEGATIVE |
| 建議回覆 | AI 生成的建議 |
| 回覆相關度 | 實際回覆與問題的相關度 % |
| 創建時間 | 問題識別時間 |
| 操作 | 查看 / 編輯 / 刪除 |

#### 篩選條件
- 狀態篩選（多選）
- 客戶篩選
- 群組篩選
- 日期範圍
- 情緒篩選

#### 批量操作
- 批量更新狀態
- 批量刪除

#### 詳情頁功能
- 問題基本資訊
- 觸發訊息（原始提問）
- 回覆訊息（如有）
- 前後文脈絡（觸發訊息前後 5 條）
- 狀態變更
- 標籤管理

#### 交互細節
1. **狀態顏色**：
   - PENDING: 紅色
   - REPLIED: 藍色
   - WAITING_CUSTOMER: 橙色
   - TIMEOUT: 紫色
   - RESOLVED: 綠色
   - IGNORED: 灰色
2. **情緒圖示**：表情符號快速識別
3. **超時告警**：超時問題顯示告警圖示
4. **快速操作**：列表行內直接修改狀態

---

### 3.6 客戶管理（Customers）

#### 功能描述
管理外部客戶資訊和關聯的群組。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 客戶名稱 | 公司/組織名稱 |
| 聯繫人 | 主要聯繫人 |
| Email | 聯繫 Email |
| 情緒 | 整體客戶情緒 |
| 群組數 | 關聯群組數量 |
| 問題數 | 累計問題數量 |
| 最後聯繫 | 最後互動時間 |
| 操作 | 查看 / 編輯 / 刪除 |

#### 詳情頁功能
- 基本資訊編輯
- 關聯群組列表
- 問題歷史
- 備註記錄

#### 交互細節
1. **新增客戶**：彈窗表單
2. **綁定群組**：搜尋並選擇群組
3. **情緒計算**：根據最近問題的情緒加權計算

---

### 3.7 知識庫管理（Knowledge）

#### 功能描述
管理 Q&A 知識條目，支援自動回覆和語義搜尋。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 問題 | 知識條目的問題 |
| 答案 | 對應的答案（截斷顯示） |
| 分類 | 知識分類 |
| 來源 | MANUAL / FILE_IMPORT / FEISHU_SYNC |
| 狀態 | 啟用/停用 |
| 使用次數 | 被自動回覆命中次數 |
| 最後使用 | 最後被使用時間 |
| 操作 | 查看 / 編輯 / 刪除 |

#### 來源類型
| 來源 | 說明 | 顯示 |
|------|------|------|
| MANUAL | 手動新增 | 藍色 Tag |
| FILE_IMPORT | 檔案匯入 | 綠色 Tag |
| FEISHU_SYNC | 飛書同步 | 紫色 Tag |

#### 篩選條件
- 關鍵字搜尋（問題/答案）
- 分類篩選
- 來源篩選
- 狀態篩選（啟用/停用）

#### 功能操作
- **手動新增**：表單新增 Q&A
- **批量匯入**：JSON/Excel 格式
- **檔案上傳**：支援 MD/TXT/PDF/DOCX/XLSX/CSV
- **AI 智能處理**：上傳文件後 AI 自動拆分 Q&A
- **飛書同步**：從飛書知識空間同步文檔
- **生成 Embedding**：為知識條目生成向量

#### 統計面板
- 總條目數
- 啟用條目數
- 已 Embedding 數量
- 自動回覆統計（命中率、今日次數）

#### 交互細節
1. **檔案上傳**：
   - 拖拽上傳或點擊選擇
   - 顯示支援的格式提示
   - 上傳後預覽解析結果
   - 確認後批量匯入
2. **飛書同步**：
   - 需先在系統設定配置飛書
   - 按鈕灰顯當未配置
   - 同步完成顯示結果（新增/更新數量）
3. **搜尋測試**：
   - 輸入問題測試知識庫搜尋
   - 顯示匹配結果和信心分數

---

### 3.8 使用者管理（Users）

#### 功能描述
管理後台系統使用者。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 帳號 | 登入用帳號 |
| 顯示名稱 | 用戶姓名 |
| 角色 | 分配的權限角色 |
| 狀態 | 啟用/停用 |
| 最後登入 | 最後登入時間 |
| 操作 | 編輯 / 刪除 |

#### 功能操作
- 新增使用者
- 編輯資訊
- 重設密碼
- 變更角色
- 啟用/停用帳號

#### 交互細節
1. **新增用戶**：彈窗表單（帳號、密碼、名稱、角色）
2. **密碼規則**：最少 6 字元
3. **不可刪除自己**：當前登入用戶不可刪除自己
4. **系統用戶保護**：admin 帳號不可刪除

---

### 3.9 角色管理（Roles）

#### 功能描述
管理權限角色定義。

#### 權限列表
| 權限 | 說明 |
|------|------|
| customer.view/create/edit/delete | 客戶管理 |
| group.view/edit | 群組管理 |
| member.view/edit | 成員管理 |
| message.view | 訊息查看 |
| issue.view/edit | 問題追蹤 |
| analysis.run | 執行分析 |
| knowledge.view/create/edit/delete | 知識庫管理 |
| user.view/create/edit/delete | 使用者管理 |
| role.view/create/edit/delete | 角色管理 |
| setting.view/edit | 系統設定 |
| log.view | 日誌查看 |

#### 預設角色
| 角色 | 說明 | 權限範圍 |
|------|------|----------|
| admin | 管理員 | 所有權限 |
| operator | 操作員 | 業務操作（無用戶/角色/設定管理） |
| viewer | 觀察者 | 僅查看權限 |

#### 交互細節
1. **權限配置**：Checkbox 矩陣選擇
2. **系統角色保護**：預設角色不可刪除
3. **角色複製**：快速基於現有角色創建新角色

---

### 3.10 系統設定（Settings）

#### 功能描述
系統級配置管理。

#### 設定分類

##### LINE 渠道設定
| 欄位 | 說明 |
|------|------|
| Channel Secret | LINE Channel Secret |
| Channel Access Token | LINE Channel Access Token |

##### 飛書渠道設定
| 欄位 | 說明 |
|------|------|
| App ID | 飛書應用 ID |
| App Secret | 飛書應用密鑰 |
| Verification Token | Webhook 驗證 Token |
| Encrypt Key | 消息加密密鑰 |
| 知識空間 ID | 同步知識庫的空間 ID |
| 節點 Token | 同步起始節點（可選） |

##### AI 設定
| 欄位 | 說明 |
|------|------|
| AI Provider | 選擇使用的 AI 服務 |
| Model Name | 使用的模型名稱 |

##### 分析參數
| 欄位 | 說明 | 預設值 |
|------|------|--------|
| 問題超時時間 | 多少分鐘未回覆視為超時 | 30 |
| 回覆相關度閾值 | 低於此值不視為有效回覆 | 60% |
| 自動回覆信心閾值 | 高於此值才自動回覆 | 50 |

#### OAuth 狀態面板
顯示各 OAuth Provider 的認證狀態：
- Gemini CLI OAuth
- Claude Code OAuth
- 飛書連接狀態

#### 交互細節
1. **敏感欄位**：密碼欄位顯示為 ****，修改時清空
2. **即時驗證**：修改 LINE/飛書設定後驗證連接
3. **Provider 切換**：切換 AI Provider 時檢查認證狀態

---

### 3.11 活動日誌（Logs）

#### 功能描述
系統操作審計追蹤。

#### 列表頁欄位
| 欄位 | 說明 |
|------|------|
| 時間 | 操作時間 |
| 操作者 | 執行操作的用戶 |
| 實體類型 | customer/group/issue/knowledge 等 |
| 動作 | create/update/delete/login 等 |
| 詳情 | 操作詳細內容 |
| IP 位址 | 操作來源 IP |

#### 篩選條件
- 日期範圍
- 實體類型
- 動作類型
- 操作者

#### 交互細節
1. **詳情展開**：JSON 格式顯示變更內容
2. **敏感資訊過濾**：密碼等欄位顯示為 ***

---

## 4. Webhook 處理流程

### 4.1 LINE Webhook

```
LINE Platform ─→ POST /api/webhook/line
                        │
                        ▼
                  驗證簽名
                        │
                        ▼
                ┌───────┴───────┐
                │  事件類型判斷  │
                └───────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    Message         Join/Leave       Other
        │               │               │
        ▼               ▼               ▼
  儲存訊息         更新成員關係      記錄事件
        │
        ▼
  ┌─────────────────┐
  │ 自動回覆判斷     │
  │ (群組設定啟用?)  │
  └────────┬────────┘
           │
    ┌──────┴──────┐
    │  知識庫搜尋  │
    └──────┬──────┘
           │
    信心分數 >= 閾值?
           │
    ┌──────┴──────┐
    Yes          No
    │             │
    ▼             ▼
  發送回覆     記錄未命中
```

### 4.2 訊息處理規則

1. **用戶識別**：根據 lineUserId 查找或創建 Member
2. **群組識別**：根據群組類型（group/room/user）處理
3. **自我介紹解析**：檢測「我是XXX」模式，提取用戶真實姓名
4. **Staff 過濾**：STAFF 角色的訊息不觸發問題分析
5. **自動回覆**：僅啟用自動回覆的群組會自動回覆

---

## 5. AI 分析流程

### 5.1 問題分析流程

```
觸發分析（手動或排程）
        │
        ▼
  獲取待分析訊息
  (時間範圍內、外部用戶)
        │
        ▼
  ┌─────┴─────┐
  │ AI 分析   │
  │ - 是否為問題
  │ - 問題摘要
  │ - 情緒分析
  │ - 建議回覆
  │ - 標籤建議
  └─────┬─────┘
        │
  是問題？
        │
  ┌─────┴─────┐
  Yes         No
  │           │
  ▼           ▼
創建 Issue   跳過
        │
        ▼
  檢查後續回覆
  計算回覆相關度
```

### 5.2 知識庫搜尋 (RAG)

```
用戶問題
    │
    ▼
┌───────────────┐
│ 生成 Embedding │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ 向量相似度搜尋 │
│ (Top-K 結果)   │
└───────┬───────┘
        │
相似度 >= 閾值?
        │
  ┌─────┴─────┐
  Yes         No
  │           │
  ▼           ▼
返回最佳答案  關鍵字搜尋 Fallback
        │           │
        │     ┌─────┴─────┐
        │     │ AI 生成答案│
        │     └─────┬─────┘
        │           │
        └─────┬─────┘
              │
              ▼
         返回結果
```

---

## 6. 資料模型

### 6.1 核心實體關係

```
┌─────────┐     1:N      ┌──────────┐
│Customer │─────────────│LineGroup │
└─────────┘              └──────────┘
                              │
                         M:N  │  1:N
                    ┌─────────┼─────────┐
                    │         │         │
               ┌────▼───┐ ┌───▼───┐ ┌───▼────┐
               │GroupMbr│ │Message│ │ Issue  │
               └────┬───┘ └───────┘ └────────┘
                    │
               ┌────▼───┐
               │ Member │
               └────────┘
```

### 6.2 Enum 定義

```typescript
enum Channel {
  LINE
  FEISHU
}

enum GroupStatus {
  ACTIVE
  ARCHIVED
}

enum MemberRole {
  STAFF           // 客服人員
  EXTERNAL_ADMIN  // 外部管理員
  EXTERNAL        // 一般外部用戶
}

enum MessageType {
  TEXT
  IMAGE
  VIDEO
  AUDIO
  FILE
  STICKER
  LOCATION
  OTHER
}

enum IssueStatus {
  PENDING           // 待處理
  REPLIED           // 已回覆
  WAITING_CUSTOMER  // 等待客戶
  TIMEOUT           // 已超時
  RESOLVED          // 已解決
  IGNORED           // 已忽略
}

enum Sentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
  AT_RISK
}

enum KnowledgeSource {
  MANUAL       // 手動新增
  FILE_IMPORT  // 檔案匯入
  FEISHU_SYNC  // 飛書同步
}
```

---

## 7. API 端點清單

### 7.1 認證 API
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/auth/login | 登入 |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/me | 當前用戶資訊 |

### 7.2 業務 API
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET/POST/PUT/DELETE | /api/customers | 客戶 CRUD |
| GET/PUT/DELETE | /api/groups | 群組管理 |
| POST | /api/groups/batch-delete | 批量刪除群組 |
| POST | /api/groups/batch-update-categories | 批量更新分類 |
| GET/PUT/DELETE | /api/members | 成員管理 |
| POST | /api/members/batch-fetch-profile | 批量獲取資料 |
| GET | /api/messages | 訊息查詢 |
| GET/PUT/DELETE | /api/issues | 問題管理 |
| POST | /api/issues/batch-update-status | 批量更新狀態 |

### 7.3 知識庫 API
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET/POST/PUT/DELETE | /api/knowledge | 知識條目 CRUD |
| POST | /api/knowledge/import | 批量匯入 |
| POST | /api/knowledge/search | 搜尋測試 |
| GET | /api/knowledge/stats | 統計資訊 |
| GET | /api/knowledge/categories | 分類列表 |
| POST | /api/knowledge/files/upload | 上傳檔案 |
| GET | /api/knowledge/files | 檔案列表 |
| POST | /api/knowledge/files/:name/import | 從檔案匯入 |
| POST | /api/knowledge/files/ai-process | AI 智能處理 |
| POST | /api/knowledge/sync-feishu | 飛書同步 |

### 7.4 系統 API
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET/PUT | /api/settings | 系統設定 |
| GET | /api/settings/oauth/status | OAuth 狀態 |
| GET | /api/settings/channels/feishu/status | 飛書狀態 |
| GET/POST/PUT/DELETE | /api/users | 用戶管理 |
| GET/POST/PUT/DELETE | /api/roles | 角色管理 |
| GET | /api/logs | 活動日誌 |
| POST | /api/analysis/run | 執行 AI 分析 |

### 7.5 Webhook API
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | /api/webhook/line | LINE Webhook |
| POST | /api/webhook/feishu | 飛書 Webhook |

---

## 8. 部署配置

### 8.1 環境變數
```bash
# 必須配置
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret-key

# LINE 配置（可透過設定頁面配置）
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

# 飛書配置（可透過設定頁面配置）
FEISHU_APP_ID=
FEISHU_APP_SECRET=

# AI Provider (gemini-oauth|claude-code-oauth|claude|gemini|ollama)
AI_PROVIDER=gemini-oauth

# GCP 配置（gemini-oauth 使用）
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1

# API Keys（對應 provider 使用）
CLAUDE_API_KEY=
GEMINI_API_KEY=

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
```

### 8.2 Docker Compose
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: line_monitor
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  adminer:
    image: adminer
    ports:
      - "8080:8080"
```

### 8.3 初始化步驟
```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp packages/server/.env.example packages/server/.env
# 編輯 .env 配置

# 3. 啟動資料庫
docker-compose up -d

# 4. 執行資料庫遷移
npm run db:migrate

# 5. 初始化種子數據
npm run db:seed

# 6. 啟動開發伺服器
npm run dev
```

---

## 9. 安全考量

### 9.1 認證機制
- JWT Token 認證
- Token 過期時間可配置（預設 24h）
- 登出時 Token 失效

### 9.2 權限控制
- 基於角色的存取控制（RBAC）
- API 端點權限檢查
- 前端路由權限保護

### 9.3 敏感資料處理
- API Key 等敏感設定僅顯示前 8 字元
- 活動日誌過濾密碼等敏感欄位
- Webhook 簽名驗證

### 9.4 輸入驗證
- Zod Schema 驗證 API 輸入
- SQL 注入防護（Prisma ORM）
- XSS 防護（React 自動轉義）

---

## 10. 版本歷史

| 版本 | 日期 | 說明 |
|------|------|------|
| 1.0.0 | 2026-02-05 | 初版發布，包含完整功能 |

---

## 附錄 A：UI 設計規範

### 顏色定義
| 用途 | 色值 |
|------|------|
| 主色 | #1890ff |
| 成功 | #52c41a |
| 警告 | #faad14 |
| 錯誤 | #ff4d4f |
| 中性 | #8c8c8c |

### 狀態標籤顏色
| 狀態 | 顏色 |
|------|------|
| PENDING | red |
| REPLIED | blue |
| WAITING_CUSTOMER | orange |
| TIMEOUT | purple |
| RESOLVED | green |
| IGNORED | default |

### 渠道標籤
| 渠道 | 顏色 |
|------|------|
| LINE | green |
| FEISHU | blue |

### 來源標籤
| 來源 | 顏色 |
|------|------|
| MANUAL | blue |
| FILE_IMPORT | green |
| FEISHU_SYNC | purple |
