import { google } from 'googleapis'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// OAuth tokens 儲存路徑
const TOKENS_DIR = join(homedir(), '.linebot-monitor')
const GOOGLE_TOKENS_PATH = join(TOKENS_DIR, 'google-oauth-tokens.json')

// Google Cloud SDK 的公開 Client ID
// 這是 Google 官方給 CLI/桌面應用程式使用的 Client ID，不需要 client secret
// 參考: https://cloud.google.com/sdk/docs/authorizing
const GOOGLE_CLOUD_SDK_CLIENT_ID = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com'

// Google OAuth 設定
const getGoogleOAuthConfig = () => ({
  clientId: GOOGLE_CLOUD_SDK_CLIENT_ID,
  clientSecret: '', // 公開客戶端不需要 secret
  redirectUri: 'http://localhost:3000/api/oauth/google/callback',
  scopes: [
    'https://www.googleapis.com/auth/generative-language.retriever',
    'https://www.googleapis.com/auth/generative-language.tuning',
    'https://www.googleapis.com/auth/cloud-platform',
    'openid',
    'email',
  ],
})

export interface GoogleOAuthTokens {
  access_token: string
  refresh_token?: string
  expiry_date?: number
  token_type?: string
  scope?: string
}

/**
 * 檢查 Google OAuth 是否已設定（使用 Google Cloud SDK Client ID，永遠為 true）
 */
export function isGoogleOAuthConfigured(): boolean {
  return true // 使用 Google Cloud SDK 的公開 Client ID
}

/**
 * 取得 Google OAuth2 客戶端
 */
export function getGoogleOAuth2Client() {
  const config = getGoogleOAuthConfig()

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  )
}

/**
 * 產生 Google OAuth 授權 URL
 */
export function generateGoogleAuthUrl(): string {
  const config = getGoogleOAuthConfig()
  const oauth2Client = getGoogleOAuth2Client()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.scopes,
    prompt: 'consent', // 強制顯示同意畫面以取得 refresh_token
  })
}

/**
 * 使用授權碼交換 tokens
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleOAuthTokens> {
  const oauth2Client = getGoogleOAuth2Client()

  const { tokens } = await oauth2Client.getToken(code)

  // 儲存 tokens
  saveGoogleTokens(tokens as GoogleOAuthTokens)

  return tokens as GoogleOAuthTokens
}

/**
 * 儲存 Google OAuth tokens
 */
export function saveGoogleTokens(tokens: GoogleOAuthTokens): void {
  if (!existsSync(TOKENS_DIR)) {
    mkdirSync(TOKENS_DIR, { recursive: true })
  }
  writeFileSync(GOOGLE_TOKENS_PATH, JSON.stringify(tokens, null, 2))
}

/**
 * 讀取已儲存的 Google OAuth tokens
 */
export function loadGoogleTokens(): GoogleOAuthTokens | null {
  if (!existsSync(GOOGLE_TOKENS_PATH)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(GOOGLE_TOKENS_PATH, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 檢查 Google OAuth 是否已授權且有效
 */
export function isGoogleOAuthValid(): { valid: boolean; message: string; needsConfig?: boolean } {
  // 先檢查是否已設定 OAuth 憑證
  if (!isGoogleOAuthConfigured()) {
    return {
      valid: false,
      message: '未設定 Google OAuth 憑證',
      needsConfig: true,
    }
  }

  const tokens = loadGoogleTokens()

  if (!tokens) {
    return { valid: false, message: '未授權 Google OAuth' }
  }

  if (!tokens.access_token) {
    return { valid: false, message: 'Token 無效' }
  }

  // 檢查是否過期
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    if (tokens.refresh_token) {
      return { valid: true, message: 'Token 已過期但可自動更新' }
    }
    return { valid: false, message: 'Token 已過期，需重新授權' }
  }

  return { valid: true, message: 'Google OAuth 已授權' }
}

/**
 * 取得有效的 access token（自動刷新）
 */
export async function getValidGoogleAccessToken(): Promise<string | null> {
  const tokens = loadGoogleTokens()

  if (!tokens) {
    return null
  }

  // 如果 token 還沒過期，直接返回
  if (tokens.expiry_date && tokens.expiry_date > Date.now() + 60000) {
    return tokens.access_token
  }

  // 嘗試刷新 token
  if (tokens.refresh_token) {
    try {
      const oauth2Client = getGoogleOAuth2Client()
      oauth2Client.setCredentials(tokens)
      const { credentials } = await oauth2Client.refreshAccessToken()
      saveGoogleTokens(credentials as GoogleOAuthTokens)
      return credentials.access_token || null
    } catch {
      return null
    }
  }

  return null
}

/**
 * 撤銷 Google OAuth 授權
 */
export async function revokeGoogleAuth(): Promise<void> {
  const tokens = loadGoogleTokens()

  if (tokens?.access_token) {
    try {
      const oauth2Client = getGoogleOAuth2Client()
      await oauth2Client.revokeToken(tokens.access_token)
    } catch {
      // 忽略撤銷失敗
    }
  }

  // 刪除本地 tokens
  if (existsSync(GOOGLE_TOKENS_PATH)) {
    unlinkSync(GOOGLE_TOKENS_PATH)
  }
}
