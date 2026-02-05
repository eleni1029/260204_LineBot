import type { AIProvider, GenerateAnswerResult, KnowledgeEntry } from './provider.js'
import { ClaudeProvider } from './claude.js'
import { ClaudeCodeOAuthProvider } from './claude-code-oauth.js'
import { GeminiProvider } from './gemini.js'
import { GeminiOAuthProvider } from './gemini-oauth.js'
import { OllamaProvider } from './ollama.js'
import { getSettings } from '../settings.service.js'

export type { AIProvider } from './provider.js'

/**
 * AI Provider 優先級（從高到低）：
 * 1. gemini-oauth      - Gemini via Gemini CLI (OAuth 認證，免費額度 60 req/min)
 * 2. claude-code-oauth - Claude via Claude Code CLI (OAuth 認證，支援 Max 訂閱額度)
 * 3. claude            - Claude via API Key
 * 4. gemini            - Gemini via API Key
 * 5. ollama            - 本地 Ollama
 */
export async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings()
  const provider = settings['ai.provider'] || 'gemini-oauth'

  switch (provider) {
    case 'gemini-oauth':
      // 使用 Gemini CLI (OAuth 認證，免費額度 60 req/min, 1000 req/day)
      return new GeminiOAuthProvider(settings['ai.gemini.model'] || undefined)
    case 'claude-code-oauth':
      // 使用 Claude Code CLI (OAuth 認證，支援 Max 訂閱額度)
      return new ClaudeCodeOAuthProvider(settings['ai.claude.model'] || undefined)
    case 'claude':
      // 使用 Claude API Key
      return new ClaudeProvider(
        settings['ai.claude.apiKey'] || '',
        settings['ai.claude.model'] || 'claude-sonnet-4-5-20250929'
      )
    case 'gemini':
      // 使用 Gemini API Key
      return new GeminiProvider(
        settings['ai.gemini.apiKey'] || '',
        settings['ai.gemini.model'] || 'gemini-1.5-flash'
      )
    case 'ollama':
      // 使用本地 Ollama
      return new OllamaProvider(
        settings['ai.ollama.baseUrl'] || 'http://localhost:11434',
        settings['ai.ollama.model'] || 'llama3'
      )
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

/**
 * 獲取所有可用的 AI Provider（按設定的優先級排序）
 * 設定的 provider 會放在第一位，其他作為 fallback
 */
async function getAllProviders(): Promise<Array<{ name: string; provider: AIProvider }>> {
  const settings = await getSettings()
  const configuredProvider = settings['ai.provider'] || 'claude-code-oauth'
  const providers: Array<{ name: string; provider: AIProvider }> = []

  // 根據設定決定優先順序，設定的 provider 放第一位
  const providerOrder = configuredProvider === 'claude-code-oauth'
    ? ['claude-code-oauth', 'gemini-oauth', 'claude', 'gemini', 'ollama']
    : ['gemini-oauth', 'claude-code-oauth', 'claude', 'gemini', 'ollama']

  for (const name of providerOrder) {
    try {
      switch (name) {
        case 'claude-code-oauth':
          providers.push({
            name: 'claude-code-oauth',
            provider: new ClaudeCodeOAuthProvider(settings['ai.claude.model'] || undefined)
          })
          break
        case 'gemini-oauth':
          providers.push({
            name: 'gemini-oauth',
            provider: new GeminiOAuthProvider(settings['ai.gemini.model'] || undefined)
          })
          break
        case 'claude':
          if (settings['ai.claude.apiKey']) {
            providers.push({
              name: 'claude',
              provider: new ClaudeProvider(
                settings['ai.claude.apiKey'],
                settings['ai.claude.model'] || 'claude-sonnet-4-5-20250929'
              )
            })
          }
          break
        case 'gemini':
          if (settings['ai.gemini.apiKey']) {
            providers.push({
              name: 'gemini',
              provider: new GeminiProvider(
                settings['ai.gemini.apiKey'],
                settings['ai.gemini.model'] || 'gemini-1.5-flash'
              )
            })
          }
          break
        case 'ollama':
          providers.push({
            name: 'ollama',
            provider: new OllamaProvider(
              settings['ai.ollama.baseUrl'] || 'http://localhost:11434',
              settings['ai.ollama.model'] || 'llama3'
            )
          })
          break
      }
    } catch { /* skip unavailable providers */ }
  }

  return providers
}

/**
 * 使用 AI 生成回答（帶自動降級）
 * 如果主要 Provider 失敗（如 429 限流），會自動嘗試下一個 Provider
 */
export async function generateAnswerWithFallback(
  query: string,
  knowledgeEntries: KnowledgeEntry[]
): Promise<GenerateAnswerResult> {
  const providers = await getAllProviders()

  for (const { name, provider } of providers) {
    try {
      console.log(`Trying AI provider: ${name}`)
      const result = await provider.generateAnswer(query, knowledgeEntries)
      console.log(`AI provider ${name} succeeded`)
      return result
    } catch (err) {
      console.error(`AI provider ${name} failed:`, err)
      // 繼續嘗試下一個 Provider
    }
  }

  // 所有 Provider 都失敗
  throw new Error('All AI providers failed')
}
