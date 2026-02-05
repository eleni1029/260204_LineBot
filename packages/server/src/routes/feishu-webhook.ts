import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { logger } from '../utils/logger.js'
import { MessageType, IssueStatus, Sentiment, Channel } from '@prisma/client'
import { getSettings } from '../services/settings.service.js'
import { getAIProvider } from '../services/ai/index.js'
import { searchKnowledge, logAutoReply } from '../services/knowledge.service.js'
import {
  FeishuEvent,
  isFeishuConfigured,
  validateVerificationToken,
  getFeishuUserInfo,
  getFeishuChatInfo,
  replyFeishuMessage,
  sendFeishuMessage,
  parseFeishuMessageContent,
} from '../services/feishu.service.js'

export const feishuWebhookRoutes: FastifyPluginAsync = async (app) => {
  // 飛書 Webhook
  app.post('/feishu', async (request, reply) => {
    const body = request.body as FeishuEvent

    logger.info({ body }, 'Feishu webhook received')

    // 檢查飛書是否已配置
    const configured = await isFeishuConfigured()
    if (!configured) {
      logger.warn('Feishu not configured')
      return reply.status(400).send({ error: 'Feishu not configured' })
    }

    // 處理 URL 驗證請求
    if (body.type === 'url_verification' && body.challenge) {
      const isValid = await validateVerificationToken(body.token || '')
      if (!isValid) {
        return reply.status(403).send({ error: 'Invalid token' })
      }
      return { challenge: body.challenge }
    }

    // 處理事件回調
    if (body.header && body.event) {
      const eventType = body.header.event_type

      try {
        switch (eventType) {
          case 'im.message.receive_v1':
            await handleFeishuMessage(body)
            break
          default:
            logger.info({ eventType }, 'Unhandled Feishu event type')
        }
      } catch (err) {
        logger.error(err, 'Error handling Feishu webhook event')
      }
    }

    return { success: true }
  })
}

/**
 * 處理飛書消息事件
 */
async function handleFeishuMessage(body: FeishuEvent) {
  const event = body.event
  if (!event?.message || !event?.sender) {
    return
  }

  const message = event.message
  const sender = event.sender

  // 獲取發送者 ID
  const openId = sender.sender_id?.open_id
  if (!openId) {
    logger.warn('Missing sender open_id')
    return
  }

  // 獲取群組 ID（私聊時使用 open_id 作為虛擬群組）
  const chatId = message.chat_id
  const isPrivateChat = message.chat_type === 'p2p'
  const groupId = isPrivateChat ? `feishu_user_${openId}` : chatId

  // 確保群組存在
  let group = await prisma.lineGroup.findUnique({
    where: { lineGroupId: groupId },
  })

  if (!group) {
    let displayName = isPrivateChat ? '飛書私聊' : undefined
    if (!isPrivateChat) {
      const chatInfo = await getFeishuChatInfo(chatId)
      displayName = chatInfo?.name || undefined
    }

    group = await prisma.lineGroup.create({
      data: {
        lineGroupId: groupId,
        channel: Channel.FEISHU,
        displayName,
      },
    })
  }

  // 確保成員存在
  let member = await prisma.member.findUnique({
    where: { lineUserId: openId },
  })

  if (!member) {
    const userInfo = await getFeishuUserInfo(openId)
    member = await prisma.member.create({
      data: {
        lineUserId: openId,
        channel: Channel.FEISHU,
        displayName: userInfo?.name,
        pictureUrl: userInfo?.avatar_url,
      },
    })
  }

  // 確保群組成員關聯
  await prisma.groupMember.upsert({
    where: {
      groupId_memberId: {
        groupId: group.id,
        memberId: member.id,
      },
    },
    update: {},
    create: {
      groupId: group.id,
      memberId: member.id,
    },
  })

  // 解析消息內容
  const parsed = parseFeishuMessageContent(message.message_type, message.content)
  const content = parsed.text
  let messageType: MessageType = MessageType.TEXT

  switch (parsed.type) {
    case 'text':
      messageType = MessageType.TEXT
      break
    case 'image':
      messageType = MessageType.IMAGE
      break
    case 'file':
      messageType = MessageType.FILE
      break
    default:
      messageType = MessageType.OTHER
  }

  // 保存消息記錄
  const savedMessage = await prisma.message.create({
    data: {
      lineMessageId: message.message_id,
      messageType,
      content,
      rawPayload: JSON.parse(JSON.stringify(body)),
      createdAt: new Date(parseInt(message.create_time)),
      groupId: group.id,
      memberId: member.id,
    },
  })

  // 如果是文字消息，處理自動回覆
  if (content && messageType === MessageType.TEXT) {
    await handleFeishuAutoReply(
      message.message_id,
      chatId,
      savedMessage.id,
      group.id,
      member.id,
      content
    )
  }
}

/**
 * 使用 AI 分析是否為問題
 */
async function analyzeQuestionWithAI(content: string): Promise<{
  isQuestion: boolean
  confidence: number
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
}> {
  try {
    const ai = await getAIProvider()
    const analysis = await ai.analyzeQuestion(content)
    return {
      isQuestion: analysis.isQuestion,
      confidence: analysis.confidence || 0,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
    }
  } catch (err) {
    logger.error(err, 'AI question analysis failed')
    return {
      isQuestion: true,
      confidence: 50,
      summary: content.length > 100 ? content.substring(0, 100) + '...' : content,
      sentiment: 'neutral',
    }
  }
}

/**
 * 檢查是否提及 Bot 名稱
 */
function checkBotNameMentioned(content: string, botName: string | null): boolean {
  if (!botName || botName.trim() === '') {
    return false
  }

  const names = botName.split(',').map(n => n.trim()).filter(n => n.length > 0)
  const contentLower = content.toLowerCase()

  for (const name of names) {
    if (contentLower.includes(name.toLowerCase())) {
      return true
    }
  }

  return false
}

/**
 * 處理飛書自動回覆
 */
async function handleFeishuAutoReply(
  feishuMessageId: string,
  chatId: string,
  messageId: number,
  groupId: number,
  memberId: number,
  question: string
) {
  try {
    const settings = await getSettings()
    const autoReplyEnabled = settings['bot.autoReply'] === 'true'
    const botName = settings['bot.name'] || null
    const confidenceThreshold = parseInt(settings['bot.confidenceThreshold'] || '50', 10)

    // 取得群組資訊
    const group = await prisma.lineGroup.findUnique({
      where: { id: groupId },
      select: { customerId: true, autoReplyEnabled: true },
    })

    // 檢查群組是否啟用自動回覆
    if (group && !group.autoReplyEnabled) {
      logger.info({ groupId }, 'Auto reply disabled for this Feishu group')
      return
    }

    // Step 1: 檢查是否提及 Bot 名稱
    const botNameMentioned = checkBotNameMentioned(question, botName)

    // Step 2: 決定是否需要處理這條訊息
    let shouldProcess = botNameMentioned
    let isQuestion = false
    let questionConfidence = 0
    let questionSummary = question
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'

    if (!botNameMentioned) {
      const analysis = await analyzeQuestionWithAI(question)
      isQuestion = analysis.isQuestion
      questionConfidence = analysis.confidence
      questionSummary = analysis.summary
      sentiment = analysis.sentiment
      shouldProcess = isQuestion && questionConfidence >= confidenceThreshold
    } else {
      isQuestion = true
      questionConfidence = 100
    }

    logger.info({
      botNameMentioned,
      isQuestion,
      questionConfidence,
      confidenceThreshold,
      shouldProcess,
      autoReplyEnabled,
    }, 'Feishu message analysis result')

    if (!autoReplyEnabled) {
      if (isQuestion && questionConfidence >= confidenceThreshold) {
        await createIssueForQuestion({
          messageId,
          groupId,
          customerId: group?.customerId || null,
          summary: questionSummary,
          sentiment,
          autoReplied: false,
        })
      }
      return
    }

    if (!shouldProcess) {
      logger.info({ questionConfidence, confidenceThreshold }, 'Feishu message not processed')
      return
    }

    // Step 3: 搜尋知識庫
    const result = await searchKnowledge(question, groupId)
    const knowledgeConfidence = result?.confidence || 0
    const hasGoodMatch = result && knowledgeConfidence >= confidenceThreshold

    logger.info({
      knowledgeConfidence,
      confidenceThreshold,
      hasGoodMatch,
      botNameMentioned,
    }, 'Feishu knowledge search result')

    // Step 4: 決定是否回覆
    const shouldReply = botNameMentioned || hasGoodMatch
    let didReply = false
    let replyAnswer: string | null = null

    if (shouldReply) {
      if (hasGoodMatch && result) {
        replyAnswer = result.generatedAnswer || result.entry.answer
        const replyId = await replyFeishuMessage(feishuMessageId, replyAnswer)
        didReply = !!replyId

        await logAutoReply({
          messageId,
          groupId,
          memberId,
          question,
          answer: replyAnswer,
          knowledgeId: result.entry.id,
          matched: true,
          confidence: knowledgeConfidence,
        })

        logger.info({ knowledgeId: result.entry.id, knowledgeConfidence }, 'Feishu auto reply sent')
      } else if (botNameMentioned && result) {
        replyAnswer = result.generatedAnswer || result.entry.answer
        const replyId = await replyFeishuMessage(feishuMessageId, replyAnswer)
        didReply = !!replyId

        await logAutoReply({
          messageId,
          groupId,
          memberId,
          question,
          answer: replyAnswer,
          knowledgeId: result.entry.id,
          matched: true,
          confidence: knowledgeConfidence,
        })
      } else if (botNameMentioned) {
        const notFoundReply = settings['bot.notFoundReply'] || '抱歉，我目前無法回答這個問題。請稍候，會有專人為您服務。'
        const replyId = await replyFeishuMessage(feishuMessageId, notFoundReply)
        replyAnswer = notFoundReply
        didReply = !!replyId

        await logAutoReply({
          messageId,
          groupId,
          memberId,
          question,
          answer: notFoundReply,
          knowledgeId: null,
          matched: false,
          confidence: 0,
        })
      }
    } else {
      await logAutoReply({
        messageId,
        groupId,
        memberId,
        question,
        answer: null,
        knowledgeId: result?.entry.id || null,
        matched: false,
        confidence: knowledgeConfidence,
      })
    }

    // Step 5: 如果是問題，創建 Issue 進行追蹤
    if (isQuestion && questionConfidence >= confidenceThreshold) {
      await createIssueForQuestion({
        messageId,
        groupId,
        customerId: group?.customerId || null,
        summary: questionSummary,
        sentiment,
        autoReplied: didReply,
        autoReplyAnswer: replyAnswer || undefined,
        confidence: questionConfidence,
      })
    }

  } catch (err) {
    logger.error(err, 'Feishu auto reply error')
  }
}

/**
 * 為問題創建 Issue 進行追蹤
 */
async function createIssueForQuestion(params: {
  messageId: number
  groupId: number
  customerId: number | null
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  autoReplied: boolean
  autoReplyAnswer?: string
  confidence?: number
}): Promise<number> {
  const settings = await getSettings()
  const timeoutMinutes = parseInt(settings['issue.timeoutMinutes'] || '15', 10)
  const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000)

  const sentimentMap: Record<string, Sentiment> = {
    positive: Sentiment.POSITIVE,
    neutral: Sentiment.NEUTRAL,
    negative: Sentiment.NEGATIVE,
  }

  const issue = await prisma.issue.create({
    data: {
      questionSummary: params.summary,
      status: params.autoReplied ? IssueStatus.REPLIED : IssueStatus.PENDING,
      isQuestion: true,
      sentiment: sentimentMap[params.sentiment] || Sentiment.NEUTRAL,
      suggestedReply: params.autoReplyAnswer,
      timeoutAt,
      groupId: params.groupId,
      customerId: params.customerId,
      triggerMessageId: params.messageId,
      ...(params.autoReplied && {
        repliedAt: new Date(),
      }),
    },
  })

  logger.info({ issueId: issue.id, autoReplied: params.autoReplied }, 'Issue created for Feishu question')
  return issue.id
}
