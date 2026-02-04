export interface QuestionAnalysis {
  isQuestion: boolean
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  suggestedTags: string[]
  suggestedReply?: string
}

export interface ReplyEvaluation {
  relevanceScore: number // 0-100
  isCounterQuestion: boolean
  explanation: string
}

export interface TagSimilarity {
  similarTag: string | null
  shouldMerge: boolean
}

export interface CustomerSentimentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative' | 'at_risk'
  reason: string
}

export interface AIProvider {
  /**
   * 分析訊息是否為提問
   */
  analyzeQuestion(content: string): Promise<QuestionAnalysis>

  /**
   * 評估回覆相關性
   */
  evaluateReply(question: string, reply: string): Promise<ReplyEvaluation>

  /**
   * 判斷標籤相似性
   */
  findSimilarTag(newTag: string, existingTags: string[]): Promise<TagSimilarity>

  /**
   * 分析客戶整體情緒
   */
  analyzeCustomerSentiment(recentMessages: string[]): Promise<CustomerSentimentAnalysis>
}
