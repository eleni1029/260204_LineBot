import { FastifyPluginAsync } from 'fastify'
import { spawn } from 'child_process'
import {
  generateGoogleAuthUrl,
  exchangeGoogleCode,
  isGoogleOAuthValid,
  isGoogleOAuthConfigured,
  revokeGoogleAuth,
} from '../services/oauth.service.js'

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  /**
   * 啟動 Gemini CLI OAuth 授權流程
   * 這會啟動 Gemini CLI 並打開瀏覽器進行 Google OAuth 授權
   */
  app.post('/gemini/start-auth', async () => {
    return new Promise((resolve) => {
      // 使用 Gemini CLI 啟動 OAuth 流程
      // --prompt 會觸發非互動模式，但這會讓 CLI 先完成授權
      const child = spawn('gemini', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: { ...process.env },
      })

      // 不等待完成，讓用戶在瀏覽器中完成授權
      child.unref()

      // 給一點時間讓 CLI 啟動
      setTimeout(() => {
        resolve({
          success: true,
          data: {
            message: 'Gemini CLI 已啟動，請在打開的瀏覽器中完成授權',
          },
        })
      }, 1000)
    })
  })

  /**
   * 取得 Google OAuth 授權 URL
   * 使用 Google Cloud SDK 的公開 Client ID，不需要額外設定
   */
  app.get('/google/auth-url', async () => {
    try {
      const authUrl = generateGoogleAuthUrl()
      return {
        success: true,
        data: { authUrl },
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: err instanceof Error ? err.message : '無法產生授權 URL',
        },
      }
    }
  })

  /**
   * Google OAuth 回調處理
   * Google 授權後會重導向到這裡
   */
  app.get<{ Querystring: { code?: string; error?: string } }>(
    '/google/callback',
    async (request, reply) => {
      const { code, error } = request.query

      if (error) {
        // 授權被拒絕或發生錯誤
        return reply.type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>授權失敗</title>
            <style>
              body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
              .error { color: #dc3545; }
              button { margin-top: 20px; padding: 10px 20px; cursor: pointer; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2 class="error">授權失敗</h2>
              <p>錯誤: ${error}</p>
              <button onclick="window.close()">關閉視窗</button>
            </div>
          </body>
          </html>
        `)
      }

      if (!code) {
        return reply.type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>授權失敗</title>
            <style>
              body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
              .error { color: #dc3545; }
              button { margin-top: 20px; padding: 10px 20px; cursor: pointer; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2 class="error">授權失敗</h2>
              <p>未收到授權碼</p>
              <button onclick="window.close()">關閉視窗</button>
            </div>
          </body>
          </html>
        `)
      }

      try {
        await exchangeGoogleCode(code)

        return reply.type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>授權成功</title>
            <style>
              body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
              .success { color: #28a745; }
              button { margin-top: 20px; padding: 10px 20px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 4px; }
            </style>
            <script>
              // 通知父視窗授權成功
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS' }, '*');
              }
              // 3 秒後自動關閉
              setTimeout(() => window.close(), 3000);
            </script>
          </head>
          <body>
            <div class="card">
              <h2 class="success">✓ 授權成功</h2>
              <p>Google OAuth 授權已完成</p>
              <p>此視窗將自動關閉...</p>
              <button onclick="window.close()">立即關閉</button>
            </div>
          </body>
          </html>
        `)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知錯誤'
        return reply.type('text/html').send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>授權失敗</title>
            <style>
              body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
              .error { color: #dc3545; }
              button { margin-top: 20px; padding: 10px 20px; cursor: pointer; }
              pre { text-align: left; background: #f8f9fa; padding: 10px; border-radius: 4px; overflow: auto; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2 class="error">授權失敗</h2>
              <p>交換 Token 時發生錯誤</p>
              <pre>${errorMessage}</pre>
              <button onclick="window.close()">關閉視窗</button>
            </div>
          </body>
          </html>
        `)
      }
    }
  )

  /**
   * 檢查 Google OAuth 狀態
   */
  app.get('/google/status', async () => {
    const status = isGoogleOAuthValid()
    return {
      success: true,
      data: {
        provider: 'google-oauth',
        ...status,
      },
    }
  })

  /**
   * 撤銷 Google OAuth 授權
   */
  app.post('/google/revoke', async () => {
    await revokeGoogleAuth()
    return {
      success: true,
      data: { message: '已撤銷 Google OAuth 授權' },
    }
  })
}
