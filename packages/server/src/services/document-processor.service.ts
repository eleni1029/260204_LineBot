import { prisma } from '../lib/prisma.js'
import { getAIProvider } from './ai/index.js'

/**
 * 文檔處理服務
 *
 * 功能：
 * 1. 讀取上傳的文檔內容
 * 2. 使用 AI 分析和總結文檔
 * 3. 將文檔拆分為 Q&A 對
 * 4. 存入知識庫供 RAG 使用
 */

interface ExtractedQA {
  question: string
  answer: string
  keywords: string[]
  category?: string
}

interface ProcessResult {
  success: boolean
  totalQAs: number
  created: number
  updated: number
  errors: string[]
}

/**
 * 處理文檔並提取 Q&A 對
 *
 * @param content 文檔原始內容
 * @param filename 文件名（用於分類）
 * @param maxChunkSize 每個 chunk 的最大字符數
 */
export async function processDocumentToKnowledge(
  content: string,
  filename: string,
  maxChunkSize: number = 8000
): Promise<ProcessResult> {
  const result: ProcessResult = {
    success: false,
    totalQAs: 0,
    created: 0,
    updated: 0,
    errors: [],
  }

  try {
    // 根據文件名推斷類別
    const category = inferCategory(filename)

    // 將文檔分割成較小的 chunks
    const chunks = splitIntoChunks(content, maxChunkSize)
    console.log(`Document split into ${chunks.length} chunks for processing`)

    const allQAs: ExtractedQA[] = []

    // 處理每個 chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (!chunk) continue
      console.log(`Processing chunk ${i + 1}/${chunks.length}...`)
      try {
        const qas = await extractQAsFromChunk(chunk, category)
        allQAs.push(...qas)
        console.log(`Extracted ${qas.length} Q&A pairs from chunk ${i + 1}`)
      } catch (err) {
        const errorMsg = `Failed to process chunk ${i + 1}: ${err}`
        console.error(errorMsg)
        result.errors.push(errorMsg)
      }
    }

    result.totalQAs = allQAs.length
    console.log(`Total Q&A pairs extracted: ${allQAs.length}`)

    // 存入知識庫
    for (const qa of allQAs) {
      try {
        // 檢查是否已存在相似問題
        const existing = await prisma.knowledgeEntry.findFirst({
          where: {
            question: qa.question,
          },
        })

        if (existing) {
          // 更新現有條目
          await prisma.knowledgeEntry.update({
            where: { id: existing.id },
            data: {
              answer: qa.answer,
              keywords: qa.keywords,
              category: qa.category || existing.category,
              isSyncedToAI: false,
            },
          })
          result.updated++
        } else {
          // 創建新條目
          await prisma.knowledgeEntry.create({
            data: {
              question: qa.question,
              answer: qa.answer,
              keywords: qa.keywords,
              category: qa.category,
              isActive: true,
              isSyncedToAI: false,
            },
          })
          result.created++
        }
      } catch (err) {
        result.errors.push(`Failed to save Q&A "${qa.question.substring(0, 30)}...": ${err}`)
      }
    }

    result.success = result.errors.length === 0 || result.created + result.updated > 0
    return result

  } catch (err) {
    result.errors.push(`Document processing failed: ${err}`)
    return result
  }
}

/**
 * 從文檔 chunk 中提取 Q&A 對
 */
async function extractQAsFromChunk(content: string, category?: string): Promise<ExtractedQA[]> {
  const provider = await getAIProvider()

  const prompt = `你是一個專業的知識庫整理專家。請分析以下文檔內容，並將其轉換為問答對。

要求：
1. 識別文檔中的關鍵知識點
2. 為每個知識點創建一個清晰的問題
3. 提供簡潔但完整的答案
4. 提取關鍵字用於搜索
5. 答案應該可以獨立理解，不需要參考原文
6. 如果是操作步驟，請保持步驟完整性

文檔內容：
${content}

請以 JSON 格式回覆，格式如下：
{
  "qaPairs": [
    {
      "question": "問題（用自然語言提問）",
      "answer": "完整的答案",
      "keywords": ["關鍵字1", "關鍵字2"]
    }
  ]
}

注意：
- 每個問答對應該是獨立且有意義的
- 問題應該用用戶可能會問的方式表達
- 答案要完整，包含所有必要的步驟或信息
- 只回覆 JSON，不要其他文字`

  const response = await provider.generate(prompt)

  // 解析 JSON 回應
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  return (parsed.qaPairs || []).map((qa: { question: string; answer: string; keywords?: string[] }) => ({
    question: qa.question,
    answer: qa.answer,
    keywords: qa.keywords || [],
    category,
  }))
}

/**
 * 根據文件名推斷類別
 */
function inferCategory(filename: string): string {
  const lower = filename.toLowerCase()

  if (lower.includes('課程') || lower.includes('course')) {
    return '課程管理'
  }
  if (lower.includes('建課') || lower.includes('create')) {
    return '建立課程'
  }
  if (lower.includes('章節') || lower.includes('chapter')) {
    return '章節管理'
  }
  if (lower.includes('產品') || lower.includes('product')) {
    return '產品介紹'
  }
  if (lower.includes('使用') || lower.includes('guide') || lower.includes('教學')) {
    return '使用教學'
  }
  if (lower.includes('faq') || lower.includes('常見問題')) {
    return 'FAQ'
  }

  return '一般'
}

/**
 * 將文檔分割成較小的 chunks
 */
function splitIntoChunks(content: string, maxSize: number): string[] {
  const chunks: string[] = []

  // 先按照段落分割
  const paragraphs = content.split(/\n\n+/)

  let currentChunk = ''

  for (const paragraph of paragraphs) {
    // 如果單個段落就超過限制，需要進一步分割
    if (paragraph.length > maxSize) {
      // 先保存當前 chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // 分割長段落（按句子）
      const sentences = paragraph.split(/(?<=[。！？.!?])\s*/)
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxSize) {
          if (currentChunk) {
            chunks.push(currentChunk.trim())
          }
          currentChunk = sentence
        } else {
          currentChunk += sentence
        }
      }
    } else if (currentChunk.length + paragraph.length + 2 > maxSize) {
      // 當前 chunk 加上新段落會超過限制
      chunks.push(currentChunk.trim())
      currentChunk = paragraph
    } else {
      // 添加段落到當前 chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  // 保存最後一個 chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

/**
 * 重新處理所有現有的知識庫文件
 */
export async function reprocessAllKnowledgeFiles(): Promise<{
  processed: number
  errors: string[]
}> {
  // 讀取所有現有的知識庫條目（假設有原始文檔內容）
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      // 選擇答案較長的條目（可能是原始文檔）
      answer: {
        // Prisma 不支持 length 過濾，這裡我們處理所有條目
      }
    },
    orderBy: { id: 'asc' },
  })

  const errors: string[] = []
  let processed = 0

  for (const entry of entries) {
    // 如果答案很長（可能是原始文檔），重新處理
    if (entry.answer.length > 1000) {
      try {
        const result = await processDocumentToKnowledge(
          entry.answer,
          entry.question,
          8000
        )
        if (result.success) {
          processed++
          // 可選：標記原始條目為已處理或刪除
        } else {
          errors.push(`Failed to reprocess entry ${entry.id}: ${result.errors.join(', ')}`)
        }
      } catch (err) {
        errors.push(`Error reprocessing entry ${entry.id}: ${err}`)
      }
    }
  }

  return { processed, errors }
}
