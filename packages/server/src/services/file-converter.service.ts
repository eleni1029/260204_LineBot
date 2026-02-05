import fs from 'fs/promises'
import path from 'path'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

// pdf-parse v2 ESM import
async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()
  return { text: result.text }
}

// 知識庫文件存儲路徑
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge')

// 確保知識庫目錄存在
async function ensureKnowledgeDir() {
  try {
    await fs.access(KNOWLEDGE_DIR)
  } catch {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true })
  }
}

/**
 * 支援的文件類型
 */
export const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx', '.xlsx', '.xls', '.csv']

/**
 * 從 PDF 提取文字
 */
async function extractPdf(buffer: Buffer): Promise<string> {
  const data = await parsePdf(buffer)
  return data.text
}

/**
 * 從 DOCX 提取文字
 */
async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * 從 Excel 提取文字
 */
function extractExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheets: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    sheets.push(`## ${sheetName}\n`)

    // 轉換為 Markdown 表格
    if (data.length > 0) {
      const rows = data
      if (rows.length > 0) {
        // 第一行作為標題
        const headers = rows[0] as string[]
        if (headers && headers.length > 0) {
          sheets.push('| ' + headers.join(' | ') + ' |')
          sheets.push('| ' + headers.map(() => '---').join(' | ') + ' |')

          // 其餘行作為數據
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as string[]
            if (row && row.length > 0) {
              sheets.push('| ' + row.map(cell => cell ?? '').join(' | ') + ' |')
            }
          }
        }
      }
    }

    sheets.push('')
  }

  return sheets.join('\n')
}

/**
 * 從 CSV 提取文字（轉為 Markdown 表格）
 */
function extractCsv(content: string): string {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) return ''

  const result: string[] = []

  // 解析 CSV
  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const firstLine = lines[0]
  if (!firstLine) return ''
  const headers = parseRow(firstLine)
  result.push('| ' + headers.join(' | ') + ' |')
  result.push('| ' + headers.map(() => '---').join(' | ') + ' |')

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const row = parseRow(line)
    result.push('| ' + row.join(' | ') + ' |')
  }

  return result.join('\n')
}

/**
 * 根據文件類型轉換為 Markdown
 */
export async function convertToMarkdown(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<{ content: string; error?: string }> {
  const ext = path.extname(filename).toLowerCase()

  try {
    let content: string

    switch (ext) {
      case '.md':
      case '.txt':
        content = buffer.toString('utf-8')
        break

      case '.pdf':
        content = await extractPdf(buffer)
        break

      case '.docx':
        content = await extractDocx(buffer)
        break

      case '.xlsx':
      case '.xls':
        content = extractExcel(buffer)
        break

      case '.csv':
        content = extractCsv(buffer.toString('utf-8'))
        break

      default:
        return { content: '', error: `不支援的文件類型: ${ext}` }
    }

    return { content }
  } catch (err) {
    return { content: '', error: `轉換失敗: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 保存轉換後的 Markdown 文件
 */
export async function saveKnowledgeFile(
  filename: string,
  content: string
): Promise<{ path: string; error?: string }> {
  await ensureKnowledgeDir()

  // 生成唯一文件名
  const baseName = path.basename(filename, path.extname(filename))
  const timestamp = Date.now()
  const mdFilename = `${baseName}_${timestamp}.md`
  const filePath = path.join(KNOWLEDGE_DIR, mdFilename)

  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return { path: filePath }
  } catch (err) {
    return { path: '', error: `保存失敗: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 列出知識庫目錄中的所有文件
 */
export async function listKnowledgeFiles(): Promise<{
  files: Array<{
    name: string
    path: string
    size: number
    createdAt: Date
    modifiedAt: Date
  }>
}> {
  await ensureKnowledgeDir()

  try {
    const files = await fs.readdir(KNOWLEDGE_DIR)
    const fileInfos = await Promise.all(
      files
        .filter(f => f.endsWith('.md'))
        .map(async (name) => {
          const filePath = path.join(KNOWLEDGE_DIR, name)
          const stat = await fs.stat(filePath)
          return {
            name,
            path: filePath,
            size: stat.size,
            createdAt: stat.birthtime,
            modifiedAt: stat.mtime,
          }
        })
    )

    return { files: fileInfos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()) }
  } catch {
    return { files: [] }
  }
}

/**
 * 讀取知識庫文件內容
 */
export async function readKnowledgeFile(filename: string): Promise<{ content: string; error?: string }> {
  const filePath = path.join(KNOWLEDGE_DIR, filename)

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { content }
  } catch (err) {
    return { content: '', error: `讀取失敗: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 刪除知識庫文件
 */
export async function deleteKnowledgeFile(filename: string): Promise<{ success: boolean; error?: string }> {
  const filePath = path.join(KNOWLEDGE_DIR, filename)

  try {
    await fs.unlink(filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: `刪除失敗: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 從 Markdown 內容解析知識條目
 * 支援格式：
 * ## 問題標題
 * 答案內容
 *
 * 或
 *
 * Q: 問題
 * A: 答案
 */
export function parseKnowledgeEntries(content: string): Array<{
  question: string
  answer: string
  category?: string
}> {
  const entries: Array<{ question: string; answer: string; category?: string }> = []

  // 嘗試解析 Q/A 格式
  const qaPattern = /Q[:：]\s*(.+?)[\n\r]+A[:：]\s*([\s\S]+?)(?=Q[:：]|$)/gi
  let match
  while ((match = qaPattern.exec(content)) !== null) {
    const questionMatch = match[1]
    const answerMatch = match[2]
    if (questionMatch && answerMatch) {
      const question = questionMatch.trim()
      const answer = answerMatch.trim()
      if (question && answer) {
        entries.push({ question, answer })
      }
    }
  }

  // 如果找到 Q/A 格式，直接返回
  if (entries.length > 0) {
    return entries
  }

  // 嘗試解析 Markdown 標題格式
  const sections = content.split(/^##\s+/m).filter(s => s.trim())

  for (const section of sections) {
    const lines = section.split('\n')
    const question = lines[0]?.trim()
    const answer = lines.slice(1).join('\n').trim()

    if (question && answer) {
      entries.push({ question, answer })
    }
  }

  // 如果都沒有找到格式，嘗試按段落分割
  if (entries.length === 0) {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim())
    for (let i = 0; i < paragraphs.length - 1; i += 2) {
      const question = paragraphs[i]?.trim()
      const answer = paragraphs[i + 1]?.trim()
      if (question && answer && question.length < 200) {
        entries.push({ question, answer })
      }
    }
  }

  return entries
}
