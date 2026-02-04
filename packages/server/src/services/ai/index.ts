import type { AIProvider } from './provider.js'
import { ClaudeProvider } from './claude.js'
import { GeminiProvider } from './gemini.js'
import { OllamaProvider } from './ollama.js'
import { getSettings } from '../settings.service.js'

export type { AIProvider } from './provider.js'

export async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings()
  const provider = settings['ai.provider'] || 'gemini'

  switch (provider) {
    case 'claude':
      return new ClaudeProvider(settings['ai.claude.apiKey'] || '', settings['ai.claude.model'] || 'claude-sonnet-4-5-20250929')
    case 'gemini':
      return new GeminiProvider(
        settings['ai.gemini.apiKey'] || '',
        settings['ai.gemini.model'] || 'gemini-1.5-flash'
      )
    case 'ollama':
      return new OllamaProvider(
        settings['ai.ollama.baseUrl'] || 'http://localhost:11434',
        settings['ai.ollama.model'] || 'llama3'
      )
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}
