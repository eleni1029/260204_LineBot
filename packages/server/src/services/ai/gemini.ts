import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  AIProvider,
  QuestionAnalysis,
  ReplyEvaluation,
  TagSimilarity,
  CustomerSentimentAnalysis,
} from './provider.js'

export class GeminiProvider implements AIProvider {
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>

  constructor(apiKey: string, modelName: string) {
    const client = new GoogleGenerativeAI(apiKey)
    this.model = client.getGenerativeModel({ model: modelName })
  }

  async analyzeQuestion(content: string): Promise<QuestionAnalysis> {
    const result = await this.model.generateContent(`分析以下訊息，以 JSON 格式回覆：
{
  "isQuestion": boolean,      // 是否為提問
  "summary": string,          // 問題摘要（若為提問）
  "sentiment": "positive" | "neutral" | "negative",
  "suggestedTags": string[],  // 建議的分類標籤（1-3個）
  "suggestedReply": string    // 建議回覆（若為提問）
}

只回覆 JSON，不要其他文字。

訊息內容：
${content}`)

    const text = result.response.text()
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
  }

  async evaluateReply(question: string, reply: string): Promise<ReplyEvaluation> {
    const result = await this.model.generateContent(`評估以下回覆是否相關於問題，以 JSON 格式回覆：
{
  "relevanceScore": number,     // 0-100 相關性分數
  "isCounterQuestion": boolean, // 是否為反問
  "explanation": string         // 評估說明
}

只回覆 JSON，不要其他文字。

問題：
${question}

回覆：
${reply}`)

    const text = result.response.text()
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
  }

  async findSimilarTag(newTag: string, existingTags: string[]): Promise<TagSimilarity> {
    if (existingTags.length === 0) {
      return { similarTag: null, shouldMerge: false }
    }

    const result = await this.model.generateContent(`判斷新標籤是否與現有標籤相似，以 JSON 格式回覆：
{
  "similarTag": string | null,  // 最相似的現有標籤，無則為 null
  "shouldMerge": boolean        // 是否應該合併使用現有標籤
}

只回覆 JSON，不要其他文字。

新標籤：${newTag}
現有標籤：${existingTags.join(', ')}`)

    const text = result.response.text()
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
  }

  async analyzeCustomerSentiment(recentMessages: string[]): Promise<CustomerSentimentAnalysis> {
    const result = await this.model.generateContent(`分析以下客戶近期訊息的整體情緒，以 JSON 格式回覆：
{
  "sentiment": "positive" | "neutral" | "negative" | "at_risk",
  "reason": string  // 判斷原因
}

at_risk 表示客戶可能有流失風險。只回覆 JSON，不要其他文字。

近期訊息：
${recentMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}`)

    const text = result.response.text()
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''))
  }
}
