import { spawn, ChildProcess } from 'child_process'
import { logger } from '../utils/logger.js'

interface TunnelStatus {
  isRunning: boolean
  url: string | null
  startedAt: Date | null
  error: string | null
}

class TunnelService {
  private process: ChildProcess | null = null
  private url: string | null = null
  private startedAt: Date | null = null
  private error: string | null = null
  private outputBuffer: string = ''

  /**
   * 獲取當前 tunnel 狀態
   */
  getStatus(): TunnelStatus {
    return {
      isRunning: this.process !== null && !this.process.killed,
      url: this.url,
      startedAt: this.startedAt,
      error: this.error,
    }
  }

  /**
   * 獲取 webhook URL
   */
  getWebhookUrl(): string | null {
    return this.url ? `${this.url}/api/webhook/line` : null
  }

  /**
   * 啟動 cloudflare tunnel
   */
  async start(port: number = 3000): Promise<{ success: boolean; url?: string; error?: string }> {
    // 如果已經運行，先停止
    if (this.process && !this.process.killed) {
      await this.stop()
    }

    return new Promise((resolve) => {
      try {
        this.error = null
        this.outputBuffer = ''

        this.process = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        const timeout = setTimeout(() => {
          if (!this.url) {
            this.error = '啟動超時，未能獲取 tunnel URL'
            resolve({ success: false, error: this.error })
          }
        }, 30000)

        const handleOutput = (data: Buffer) => {
          const output = data.toString()
          this.outputBuffer += output

          // 解析 URL
          const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
          if (urlMatch && !this.url) {
            this.url = urlMatch[0]
            this.startedAt = new Date()
            clearTimeout(timeout)
            logger.info({ url: this.url }, 'Cloudflare tunnel started')
            resolve({ success: true, url: this.url })
          }
        }

        this.process.stdout?.on('data', handleOutput)
        this.process.stderr?.on('data', handleOutput)

        this.process.on('error', (err) => {
          this.error = `啟動失敗: ${err.message}`
          this.process = null
          clearTimeout(timeout)
          logger.error({ error: err }, 'Cloudflare tunnel error')
          resolve({ success: false, error: this.error })
        })

        this.process.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            this.error = `Tunnel 異常退出，代碼: ${code}`
            logger.warn({ code }, 'Cloudflare tunnel exited')
          }
          this.process = null
          this.url = null
          this.startedAt = null
        })

      } catch (err) {
        this.error = `啟動異常: ${err instanceof Error ? err.message : String(err)}`
        resolve({ success: false, error: this.error })
      }
    })
  }

  /**
   * 停止 tunnel
   */
  async stop(): Promise<{ success: boolean }> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM')

      // 等待進程結束
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        this.process?.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }

    this.process = null
    this.url = null
    this.startedAt = null
    this.error = null

    logger.info('Cloudflare tunnel stopped')
    return { success: true }
  }

  /**
   * 重啟 tunnel（獲取新 URL）
   */
  async restart(port: number = 3000): Promise<{ success: boolean; url?: string; error?: string }> {
    await this.stop()
    return this.start(port)
  }

  /**
   * 檢查 webhook URL 是否有效
   */
  async checkHealth(): Promise<{
    isValid: boolean
    latency?: number
    error?: string
  }> {
    if (!this.url) {
      return { isValid: false, error: '沒有可用的 tunnel URL' }
    }

    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(`${this.url}/health`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeout)
      const latency = Date.now() - startTime

      if (response.ok) {
        return { isValid: true, latency }
      } else {
        return {
          isValid: false,
          latency,
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }
    } catch (err) {
      return {
        isValid: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
}

// 單例
export const tunnelService = new TunnelService()
