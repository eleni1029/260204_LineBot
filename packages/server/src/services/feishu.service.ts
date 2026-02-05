import crypto from 'crypto'
import { getSettings } from './settings.service.js'
import { logger } from '../utils/logger.js'

/**
 * 飛書 API 相關類型定義
 */
interface FeishuTokenResponse {
  code: number
  msg: string
  tenant_access_token?: string
  expire?: number
}

interface FeishuUserInfo {
  open_id: string
  user_id?: string
  name?: string
  avatar_url?: string
}

interface FeishuChatInfo {
  chat_id: string
  name?: string
  description?: string
  owner_id?: string
}

interface FeishuMessageResponse {
  code: number
  msg: string
  data?: {
    message_id: string
  }
}

/**
 * 飛書 Webhook 事件類型
 */
export interface FeishuEvent {
  schema?: string
  header?: {
    event_id: string
    event_type: string
    create_time: string
    token: string
    app_id: string
    tenant_key: string
  }
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string
        user_id?: string
      }
      sender_type?: string
    }
    message?: {
      message_id: string
      root_id?: string
      parent_id?: string
      create_time: string
      chat_id: string
      chat_type: string
      message_type: string
      content: string
    }
  }
  // URL 驗證請求
  challenge?: string
  token?: string
  type?: string
}

// 緩存 tenant_access_token
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * 獲取飛書設定
 */
async function getFeishuSettings() {
  const settings = await getSettings()
  return {
    appId: settings['feishu.appId'] || '',
    appSecret: settings['feishu.appSecret'] || '',
    verificationToken: settings['feishu.verificationToken'] || '',
    encryptKey: settings['feishu.encryptKey'] || '',
    enabled: settings['feishu.enabled'] === 'true',
  }
}

/**
 * 檢查飛書是否已配置
 */
export async function isFeishuConfigured(): Promise<boolean> {
  const settings = await getFeishuSettings()
  return !!(settings.appId && settings.appSecret && settings.enabled)
}

/**
 * 獲取 tenant_access_token
 */
async function getTenantAccessToken(): Promise<string> {
  // 檢查緩存
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token
  }

  const settings = await getFeishuSettings()
  if (!settings.appId || !settings.appSecret) {
    throw new Error('飛書 App ID 或 App Secret 未配置')
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      app_id: settings.appId,
      app_secret: settings.appSecret,
    }),
  })

  const data = await response.json() as FeishuTokenResponse

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`獲取飛書 token 失敗: ${data.msg}`)
  }

  // 緩存 token
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire || 7200) * 1000,
  }

  return data.tenant_access_token
}

/**
 * 重置 token 緩存（當設定變更時調用）
 */
export function resetFeishuToken() {
  cachedToken = null
}

/**
 * 驗證飛書 webhook 簽名
 */
export async function validateFeishuSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string
): Promise<boolean> {
  const settings = await getFeishuSettings()
  if (!settings.encryptKey) {
    // 如果沒有配置加密密鑰，跳過驗證
    return true
  }

  const content = timestamp + nonce + settings.encryptKey + body
  const hash = crypto.createHash('sha256').update(content).digest('hex')
  return hash === signature
}

/**
 * 驗證 verification token
 */
export async function validateVerificationToken(token: string): Promise<boolean> {
  const settings = await getFeishuSettings()
  return settings.verificationToken === token
}

/**
 * 解密飛書消息（如果啟用了加密）
 */
export async function decryptMessage(encrypt: string): Promise<string> {
  const settings = await getFeishuSettings()
  if (!settings.encryptKey) {
    throw new Error('飛書加密密鑰未配置')
  }

  const key = crypto.createHash('sha256').update(settings.encryptKey).digest()
  const encryptedBuffer = Buffer.from(encrypt, 'base64')

  // AES-256-CBC 解密
  const iv = encryptedBuffer.slice(0, 16)
  const encrypted = encryptedBuffer.slice(16)

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  // 移除 PKCS7 padding 和前導隨機字節
  const content = decrypted.toString('utf-8')
  // 飛書加密格式：隨機字節(16) + 消息長度(4) + 消息內容 + app_id
  const msgLength = decrypted.readUInt32BE(16)
  return content.substring(20, 20 + msgLength)
}

/**
 * 獲取用戶信息
 */
export async function getFeishuUserInfo(openId: string): Promise<FeishuUserInfo | null> {
  try {
    const token = await getTenantAccessToken()

    const response = await fetch(`https://open.feishu.cn/open-apis/contact/v3/users/${openId}?user_id_type=open_id`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const data = await response.json() as { code: number; data?: { user?: FeishuUserInfo } }

    if (data.code === 0 && data.data?.user) {
      return {
        open_id: openId,
        name: data.data.user.name,
        avatar_url: data.data.user.avatar_url,
      }
    }
    return null
  } catch (err) {
    logger.error(err, 'Failed to get Feishu user info')
    return null
  }
}

/**
 * 獲取群組信息
 */
export async function getFeishuChatInfo(chatId: string): Promise<FeishuChatInfo | null> {
  try {
    const token = await getTenantAccessToken()

    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/chats/${chatId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const data = await response.json() as { code: number; data?: FeishuChatInfo }

    if (data.code === 0 && data.data) {
      return data.data
    }
    return null
  } catch (err) {
    logger.error(err, 'Failed to get Feishu chat info')
    return null
  }
}

/**
 * 發送文字消息
 */
export async function sendFeishuMessage(
  receiveId: string,
  content: string,
  receiveIdType: 'chat_id' | 'open_id' = 'chat_id'
): Promise<string | null> {
  try {
    const token = await getTenantAccessToken()

    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }),
    })

    const data = await response.json() as FeishuMessageResponse

    if (data.code === 0 && data.data?.message_id) {
      return data.data.message_id
    }

    logger.error({ code: data.code, msg: data.msg }, 'Failed to send Feishu message')
    return null
  } catch (err) {
    logger.error(err, 'Failed to send Feishu message')
    return null
  }
}

/**
 * 回覆消息
 */
export async function replyFeishuMessage(messageId: string, content: string): Promise<string | null> {
  try {
    const token = await getTenantAccessToken()

    const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }),
    })

    const data = await response.json() as FeishuMessageResponse

    if (data.code === 0 && data.data?.message_id) {
      return data.data.message_id
    }

    logger.error({ code: data.code, msg: data.msg }, 'Failed to reply Feishu message')
    return null
  } catch (err) {
    logger.error(err, 'Failed to reply Feishu message')
    return null
  }
}

/**
 * 解析飛書消息內容
 */
export function parseFeishuMessageContent(messageType: string, content: string): {
  text: string | null
  type: 'text' | 'image' | 'file' | 'other'
} {
  try {
    const parsed = JSON.parse(content)

    switch (messageType) {
      case 'text':
        return { text: parsed.text || '', type: 'text' }
      case 'image':
        return { text: '[圖片]', type: 'image' }
      case 'file':
        return { text: `[文件: ${parsed.file_name || '未知'}]`, type: 'file' }
      case 'post':
        // 富文本消息，提取純文字
        let postText = ''
        if (parsed.content) {
          for (const paragraph of parsed.content) {
            for (const element of paragraph) {
              if (element.tag === 'text') {
                postText += element.text || ''
              }
            }
            postText += '\n'
          }
        }
        return { text: postText.trim() || parsed.title || '', type: 'text' }
      default:
        return { text: null, type: 'other' }
    }
  } catch {
    return { text: content, type: 'text' }
  }
}

/**
 * 檢查飛書連接狀態
 */
export async function checkFeishuConnection(): Promise<{
  connected: boolean
  message: string
}> {
  try {
    const settings = await getFeishuSettings()

    if (!settings.enabled) {
      return { connected: false, message: '飛書渠道未啟用' }
    }

    if (!settings.appId || !settings.appSecret) {
      return { connected: false, message: '飛書 App ID 或 App Secret 未配置' }
    }

    // 嘗試獲取 token 來驗證憑證
    await getTenantAccessToken()
    return { connected: true, message: '連接正常' }
  } catch (err) {
    return {
      connected: false,
      message: err instanceof Error ? err.message : '連接失敗'
    }
  }
}

/**
 * Wiki 節點類型定義
 */
interface WikiNode {
  space_id: string
  node_token: string
  obj_token: string
  obj_type: string  // 'doc' | 'docx' | 'sheet' | 'mindnote' | 'bitable' | 'file'
  parent_node_token?: string
  node_type: string
  title: string
  has_child: boolean
}

interface WikiNodesResponse {
  code: number
  msg: string
  data?: {
    items?: WikiNode[]
    page_token?: string
    has_more?: boolean
  }
}

interface WikiDocResponse {
  code: number
  msg: string
  data?: {
    content?: string
    title?: string
  }
}

/**
 * 獲取飛書知識空間的所有節點（遞歸）
 */
export async function fetchWikiSpaceNodes(
  spaceId: string,
  parentNodeToken?: string,
  allNodes: WikiNode[] = []
): Promise<WikiNode[]> {
  try {
    const token = await getTenantAccessToken()
    let pageToken: string | undefined

    do {
      const url = new URL('https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node')
      url.searchParams.set('space_id', spaceId)
      if (parentNodeToken) {
        url.searchParams.set('parent_node_token', parentNodeToken)
      }
      if (pageToken) {
        url.searchParams.set('page_token', pageToken)
      }
      url.searchParams.set('page_size', '50')

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json() as WikiNodesResponse

      if (data.code !== 0) {
        logger.error({ code: data.code, msg: data.msg }, 'Failed to fetch Wiki nodes')
        break
      }

      if (data.data?.items) {
        for (const node of data.data.items) {
          allNodes.push(node)

          // 如果有子節點，遞歸獲取
          if (node.has_child) {
            await fetchWikiSpaceNodes(spaceId, node.node_token, allNodes)
          }
        }
      }

      pageToken = data.data?.page_token
    } while (pageToken)

    return allNodes
  } catch (err) {
    logger.error(err, 'Failed to fetch Wiki space nodes')
    return allNodes
  }
}

/**
 * 獲取飛書文檔內容
 */
export async function fetchWikiDocument(docToken: string): Promise<string | null> {
  try {
    const token = await getTenantAccessToken()

    // 使用 docx API 獲取文檔內容（純文字格式）
    const response = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}/raw_content`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const data = await response.json() as WikiDocResponse

    if (data.code === 0 && data.data?.content) {
      return data.data.content
    }

    // 如果 docx API 失敗，嘗試使用舊版 doc API
    const legacyResponse = await fetch(`https://open.feishu.cn/open-apis/doc/v2/${docToken}/raw_content`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    const legacyData = await legacyResponse.json() as WikiDocResponse

    if (legacyData.code === 0 && legacyData.data?.content) {
      return legacyData.data.content
    }

    logger.error({ code: data.code, msg: data.msg }, 'Failed to fetch Wiki document')
    return null
  } catch (err) {
    logger.error(err, 'Failed to fetch Wiki document')
    return null
  }
}
