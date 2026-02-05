import { prisma } from '../lib/prisma.js'
import { getAIProvider } from './ai/index.js'
import { getSettings } from './settings.service.js'
import { Sentiment, IssueStatus, MemberRole } from '@prisma/client'

interface AnalysisParams {
  groupId?: number
  since?: Date
}

export async function runAnalysis(params: AnalysisParams) {
  const settings = await getSettings()
  const replyThreshold = parseInt(settings['issue.replyThreshold'] || '60', 10)
  const timeoutMinutes = parseInt(settings['issue.timeoutMinutes'] || '15', 10)

  const ai = await getAIProvider()

  // 取得待分析的訊息
  const whereClause: Record<string, unknown> = {}
  if (params.groupId) {
    whereClause.groupId = params.groupId
  }
  if (params.since) {
    whereClause.createdAt = { gte: params.since }
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    include: {
      member: true,
      group: { include: { customer: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const results = {
    messagesAnalyzed: 0,
    issuesCreated: 0,
    issuesReplied: 0,
    tagsCreated: 0,
  }

  // 取得所有現有標籤
  const existingTags = await prisma.issueTag.findMany()
  const tagNames = existingTags.map((t) => t.name)

  for (const message of messages) {
    // 只分析外部人員的訊息
    if (message.member.role === MemberRole.STAFF) {
      continue
    }

    if (!message.content) {
      continue
    }

    results.messagesAnalyzed++

    // 檢查是否已有關聯的 issue
    const existingIssue = await prisma.issue.findUnique({
      where: { triggerMessageId: message.id },
    })

    if (existingIssue) {
      continue
    }

    // AI 分析訊息
    const analysis = await ai.analyzeQuestion(message.content)

    if (!analysis.isQuestion) {
      continue
    }

    // 建立 Issue
    const timeoutAt = new Date(message.createdAt.getTime() + timeoutMinutes * 60 * 1000)

    const issue = await prisma.issue.create({
      data: {
        questionSummary: analysis.summary,
        status: IssueStatus.PENDING,
        isQuestion: true,
        sentiment: mapSentiment(analysis.sentiment),
        suggestedReply: analysis.suggestedReply,
        timeoutAt,
        groupId: message.groupId,
        customerId: message.group.customerId,
        triggerMessageId: message.id,
      },
    })

    results.issuesCreated++

    // 處理標籤（追蹤已添加的標籤避免重複）
    const addedTagIds = new Set<number>()
    for (const tagName of analysis.suggestedTags) {
      const similarity = await ai.findSimilarTag(tagName, tagNames)

      let tagToUse: string
      if (similarity.shouldMerge && similarity.similarTag) {
        tagToUse = similarity.similarTag
      } else {
        tagToUse = tagName
        if (!tagNames.includes(tagName)) {
          await prisma.issueTag.create({ data: { name: tagName } })
          tagNames.push(tagName)
          results.tagsCreated++
        }
      }

      const tag = await prisma.issueTag.findUnique({ where: { name: tagToUse } })
      if (tag && !addedTagIds.has(tag.id)) {
        addedTagIds.add(tag.id)
        await prisma.issueTagRelation.create({
          data: { issueId: issue.id, tagId: tag.id },
        })
        await prisma.issueTag.update({
          where: { id: tag.id },
          data: { usageCount: { increment: 1 } },
        })
      }
    }

    // 檢查後續我方回覆
    const subsequentMessages = await prisma.message.findMany({
      where: {
        groupId: message.groupId,
        createdAt: { gt: message.createdAt },
        member: { role: MemberRole.STAFF },
      },
      include: { member: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    })

    for (const reply of subsequentMessages) {
      if (!reply.content) continue

      const evaluation = await ai.evaluateReply(message.content, reply.content)

      if (evaluation.relevanceScore >= replyThreshold) {
        await prisma.issue.update({
          where: { id: issue.id },
          data: {
            status: IssueStatus.REPLIED,
            replyMessageId: reply.id,
            repliedById: reply.memberId,
            repliedAt: reply.createdAt,
            replyRelevanceScore: evaluation.relevanceScore,
          },
        })
        results.issuesReplied++
        break
      } else if (evaluation.isCounterQuestion) {
        await prisma.issue.update({
          where: { id: issue.id },
          data: {
            status: IssueStatus.WAITING_CUSTOMER,
            replyMessageId: reply.id,
            repliedById: reply.memberId,
            repliedAt: reply.createdAt,
            replyRelevanceScore: evaluation.relevanceScore,
          },
        })
        break
      }
    }
  }

  // 更新客戶情緒
  const customerIds = [...new Set(messages.map((m) => m.group.customerId).filter(Boolean))]

  for (const customerId of customerIds) {
    if (!customerId) continue

    const recentCustomerMessages = await prisma.message.findMany({
      where: {
        group: { customerId },
        member: { role: { not: MemberRole.STAFF } },
        content: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    if (recentCustomerMessages.length > 0) {
      const sentimentAnalysis = await ai.analyzeCustomerSentiment(
        recentCustomerMessages.map((m) => m.content!).reverse()
      )

      await prisma.customer.update({
        where: { id: customerId },
        data: { sentiment: mapSentimentExtended(sentimentAnalysis.sentiment) },
      })
    }
  }

  return results
}

function mapSentiment(sentiment: 'positive' | 'neutral' | 'negative'): Sentiment {
  switch (sentiment) {
    case 'positive':
      return Sentiment.POSITIVE
    case 'negative':
      return Sentiment.NEGATIVE
    default:
      return Sentiment.NEUTRAL
  }
}

function mapSentimentExtended(
  sentiment: 'positive' | 'neutral' | 'negative' | 'at_risk'
): Sentiment {
  switch (sentiment) {
    case 'positive':
      return Sentiment.POSITIVE
    case 'negative':
      return Sentiment.NEGATIVE
    case 'at_risk':
      return Sentiment.AT_RISK
    default:
      return Sentiment.NEUTRAL
  }
}
