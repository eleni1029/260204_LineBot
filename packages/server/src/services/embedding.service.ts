import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSettings } from './settings.service.js'
import { prisma } from '../lib/prisma.js'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import path from 'path'

// Embedding 維度（Gemini gemini-embedding-001 使用 3072 維）
const EMBEDDING_DIMENSION = 3072

// 緩存 Gemini 客戶端
let geminiClient: GoogleGenerativeAI | null = null

// Gemini OAuth Client（與 Gemini CLI 相同）
const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com'
const OAUTH_CLIENT_SECRET = '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'

interface GeminiCliCredentials {
  access_token?: string
  refresh_token?: string
  expiry_date?: number
}

let cachedCredentials: GeminiCliCredentials | null = null
let credentialsLastRead = 0

/**
 * 讀取 Gemini CLI OAuth credentials
 */
async function getGeminiOAuthCredentials(): Promise<GeminiCliCredentials | null> {
  const cacheMaxAge = 60000 // 1 分鐘

  if (cachedCredentials && Date.now() - credentialsLastRead < cacheMaxAge) {
    return cachedCredentials
  }

  const credPath = path.join(homedir(), '.gemini', 'oauth_creds.json')

  try {
    const content = await fs.readFile(credPath, 'utf-8')
    cachedCredentials = JSON.parse(content)
    credentialsLastRead = Date.now()
    return cachedCredentials
  } catch {
    return null
  }
}

/**
 * 刷新 OAuth Token
 */
async function refreshOAuthToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as { access_token?: string }
    return data.access_token || null
  } catch {
    return null
  }
}

/**
 * 獲取有效的 Access Token
 */
async function getAccessToken(): Promise<string | null> {
  const creds = await getGeminiOAuthCredentials()
  if (!creds) return null

  // 檢查 token 是否過期
  const isExpired = creds.expiry_date && Date.now() >= creds.expiry_date

  if (!isExpired && creds.access_token) {
    return creds.access_token
  }

  // 嘗試刷新 token
  if (creds.refresh_token) {
    const newToken = await refreshOAuthToken(creds.refresh_token)
    if (newToken) return newToken
  }

  return creds.access_token || null
}

async function getGeminiClient(): Promise<GoogleGenerativeAI | null> {
  if (!geminiClient) {
    const settings = await getSettings()
    // 優先使用環境變數，再使用設定
    const apiKey = process.env.GEMINI_API_KEY || settings['ai.gemini.apiKey']
    if (!apiKey) {
      return null
    }
    geminiClient = new GoogleGenerativeAI(apiKey)
  }
  return geminiClient
}

/**
 * 使用 Vertex AI 生成 Embedding（透過 cloud-platform scope）
 */
async function generateEmbeddingWithVertexAI(text: string): Promise<number[]> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new Error('No Gemini OAuth credentials available')
  }

  // 從設定取得 project ID 和 location
  const settings = await getSettings()
  const projectId = settings['ai.gemini.projectId'] || 'dominicclaudecode'
  const location = settings['ai.gemini.location'] || 'us-central1'

  // Vertex AI Embedding endpoint
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-004:predict`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Vertex AI embedding failed: ${response.status} - ${error}`)
  }

  const data = await response.json() as {
    predictions?: Array<{ embeddings?: { values?: number[] } }>
  }

  if (!data.predictions?.[0]?.embeddings?.values) {
    throw new Error('No embedding in Vertex AI response')
  }

  return data.predictions[0].embeddings.values
}

/**
 * 使用 Gemini API Key 生成 Embedding
 * 注意：使用 gemini-embedding-001 而非 text-embedding-004
 *       因為 text-embedding-004 對中文文本有 bug（所有中文返回相同向量）
 */
async function generateEmbeddingWithGeminiApiKey(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    const settings = await getSettings()
    const settingsKey = settings['ai.gemini.apiKey']
    if (!settingsKey) {
      throw new Error('Gemini API Key not configured')
    }
  }

  const key = process.env.GEMINI_API_KEY || (await getSettings())['ai.gemini.apiKey']
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini embedding failed: ${response.status} - ${error}`)
  }

  const data = await response.json() as {
    embedding?: { values?: number[] }
  }

  if (!data.embedding?.values) {
    throw new Error('No embedding in Gemini response')
  }

  return data.embedding.values
}

/**
 * 使用 Ollama 生成 Embedding
 */
async function generateEmbeddingWithOllama(text: string): Promise<number[]> {
  const settings = await getSettings()
  const baseUrl = settings['ai.ollama.baseUrl'] || 'http://localhost:11434'
  const model = 'nomic-embed-text' // 標準的 Ollama 嵌入模型

  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ollama embedding failed: ${response.status} - ${error}`)
  }

  const data = await response.json() as { embedding?: number[] }

  if (!data.embedding) {
    throw new Error('No embedding in Ollama response')
  }

  return data.embedding
}

/**
 * 生成文本的 Embedding 向量（自動選擇提供者）
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // 清理文本，移除多餘空白
  const cleanText = text.trim().replace(/\s+/g, ' ')

  if (!cleanText) {
    throw new Error('Empty text cannot be embedded')
  }

  // 方法 1: 嘗試使用 Gemini API Key
  try {
    const client = await getGeminiClient()
    if (client) {
      const embedding = await generateEmbeddingWithGeminiApiKey(cleanText)
      return embedding
    }
  } catch (err) {
    console.warn('Gemini API Key embedding failed:', err)
  }

  // 方法 2: 嘗試使用 Vertex AI (透過 OAuth)
  try {
    const embedding = await generateEmbeddingWithVertexAI(cleanText)
    return embedding
  } catch (err) {
    console.warn('Vertex AI embedding failed:', err)
  }

  // 方法 3: 嘗試使用 Ollama (本地模型)
  try {
    const embedding = await generateEmbeddingWithOllama(cleanText)
    return embedding
  } catch (err) {
    throw new Error(`All embedding providers failed. Please configure one of: Gemini API Key, Vertex AI with billing, or Ollama with nomic-embed-text model.`)
  }
}

/**
 * 批量生成 Embedding
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = []

  for (const text of texts) {
    try {
      const embedding = await generateEmbedding(text)
      results.push(embedding)
    } catch (err) {
      console.error(`Failed to embed text: ${text.substring(0, 50)}...`, err)
      results.push([])
    }
  }

  return results
}

/**
 * 為知識庫條目生成並存儲 Embedding
 */
export async function embedKnowledgeEntry(entryId: number): Promise<boolean> {
  const entry = await prisma.knowledgeEntry.findUnique({
    where: { id: entryId },
  })

  if (!entry) {
    return false
  }

  // 組合問題和答案的前 500 字作為 embedding 內容
  const content = `問題：${entry.question}\n答案：${entry.answer.substring(0, 500)}`

  try {
    const embedding = await generateEmbedding(content)

    // 使用原生 SQL 存儲向量
    await prisma.$executeRaw`
      UPDATE knowledge_entries
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${entryId}
    `

    return true
  } catch (err) {
    console.error(`Failed to embed entry ${entryId}:`, err)
    return false
  }
}

/**
 * 批量為知識庫條目生成 Embedding
 */
export async function embedAllKnowledgeEntries(
  options: { force?: boolean; batchSize?: number } = {}
): Promise<{ success: number; failed: number; skipped: number }> {
  const { force = false, batchSize = 10 } = options

  // 查詢需要處理的條目
  const entries = await prisma.knowledgeEntry.findMany({
    where: { isActive: true },
    select: { id: true, question: true, answer: true },
  })

  // 如果不強制更新，檢查哪些已經有 embedding
  let entriesToProcess = entries
  if (!force) {
    const entriesWithEmbedding = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM knowledge_entries WHERE embedding IS NOT NULL AND "isActive" = true
    `
    const idsWithEmbedding = new Set(entriesWithEmbedding.map(e => e.id))
    entriesToProcess = entries.filter(e => !idsWithEmbedding.has(e.id))
  }

  const results = { success: 0, failed: 0, skipped: entries.length - entriesToProcess.length }

  console.log(`Embedding ${entriesToProcess.length} entries (${results.skipped} skipped)...`)

  // 分批處理
  for (let i = 0; i < entriesToProcess.length; i += batchSize) {
    const batch = entriesToProcess.slice(i, i + batchSize)

    for (const entry of batch) {
      const content = `問題：${entry.question}\n答案：${entry.answer.substring(0, 500)}`

      try {
        const embedding = await generateEmbedding(content)

        await prisma.$executeRaw`
          UPDATE knowledge_entries
          SET embedding = ${JSON.stringify(embedding)}::vector
          WHERE id = ${entry.id}
        `

        results.success++
      } catch (err) {
        console.error(`Failed to embed entry ${entry.id}:`, err)
        results.failed++
      }
    }

    // 批次間稍微延遲，避免 rate limiting
    if (i + batchSize < entriesToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`Embedding complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`)
  return results
}

/**
 * 使用向量相似度搜索知識庫
 */
export async function searchByVector(
  query: string,
  options: { limit?: number; threshold?: number; categories?: string[] } = {}
): Promise<Array<{ id: number; question: string; answer: string; category: string | null; similarity: number }>> {
  const { limit = 5, threshold = 0.5, categories } = options

  // 生成查詢的 embedding
  const queryEmbedding = await generateEmbedding(query)

  // 構建 SQL 查詢
  let results: Array<{ id: number; question: string; answer: string; category: string | null; similarity: number }>

  if (categories && categories.length > 0) {
    results = await prisma.$queryRaw`
      SELECT
        id,
        question,
        answer,
        category,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM knowledge_entries
      WHERE "isActive" = true
        AND embedding IS NOT NULL
        AND category = ANY(${categories})
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `
  } else {
    results = await prisma.$queryRaw`
      SELECT
        id,
        question,
        answer,
        category,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM knowledge_entries
      WHERE "isActive" = true
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `
  }

  // 過濾低於閾值的結果
  return results.filter(r => r.similarity >= threshold)
}

/**
 * 檢查知識庫的 Embedding 狀態
 */
export async function getEmbeddingStats(): Promise<{
  total: number
  embedded: number
  notEmbedded: number
  percentage: number
}> {
  const total = await prisma.knowledgeEntry.count({ where: { isActive: true } })

  // 檢查 embedding 欄位是否存在
  try {
    const columnCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_entries'
        AND column_name = 'embedding'
      ) as exists
    `

    if (!columnCheck[0]?.exists) {
      // embedding 欄位不存在，返回 0
      return {
        total,
        embedded: 0,
        notEmbedded: total,
        percentage: 0,
      }
    }

    const embedded = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM knowledge_entries
      WHERE "isActive" = true AND embedding IS NOT NULL
    `

    const embeddedCount = Number(embedded[0].count)

    return {
      total,
      embedded: embeddedCount,
      notEmbedded: total - embeddedCount,
      percentage: total > 0 ? Math.round((embeddedCount / total) * 100) : 0,
    }
  } catch {
    // 如果查詢失敗，返回預設值
    return {
      total,
      embedded: 0,
      notEmbedded: total,
      percentage: 0,
    }
  }
}
