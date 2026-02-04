import { FastifyPluginAsync } from 'fastify'
import { WebhookEvent, MessageEvent, TextEventMessage } from '@line/bot-sdk'
import { prisma } from '../lib/prisma.js'
import { validateSignature, getGroupMemberProfile } from '../services/line.service.js'
import { MessageType } from '@prisma/client'
import { logger } from '../utils/logger.js'

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // LINE Webhook
  app.post('/line', async (request, reply) => {
    const signature = request.headers['x-line-signature'] as string

    if (!signature) {
      return reply.status(400).send({ error: 'Missing signature' })
    }

    try {
      const body = JSON.stringify(request.body)
      const isValid = await validateSignature(body, signature)

      if (!isValid) {
        return reply.status(403).send({ error: 'Invalid signature' })
      }
    } catch (err) {
      logger.error(err, 'Signature validation error')
      // 允許在未配置時跳過驗證（開發模式）
    }

    const { events } = request.body as { events: WebhookEvent[] }

    for (const event of events) {
      try {
        await handleEvent(event)
      } catch (err) {
        logger.error(err, 'Error handling webhook event')
      }
    }

    return { success: true }
  })
}

async function handleEvent(event: WebhookEvent) {
  switch (event.type) {
    case 'message':
      await handleMessageEvent(event)
      break
    case 'join':
      await handleJoinEvent(event)
      break
    case 'leave':
      await handleLeaveEvent(event)
      break
    case 'memberJoined':
      await handleMemberJoinedEvent(event)
      break
    case 'memberLeft':
      await handleMemberLeftEvent(event)
      break
  }
}

async function handleMessageEvent(event: MessageEvent) {
  if (event.source.type !== 'group') {
    return // 只處理群組訊息
  }

  const groupId = event.source.groupId
  const userId = event.source.userId

  if (!groupId || !userId) {
    return
  }

  // 確保群組存在
  let group = await prisma.lineGroup.findUnique({
    where: { lineGroupId: groupId },
  })

  if (!group) {
    group = await prisma.lineGroup.create({
      data: { lineGroupId: groupId },
    })
  }

  // 確保成員存在
  let member = await prisma.member.findUnique({
    where: { lineUserId: userId },
  })

  if (!member) {
    const profile = await getGroupMemberProfile(groupId, userId)
    member = await prisma.member.create({
      data: {
        lineUserId: userId,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
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

  // 建立訊息記錄
  const message = event.message
  let content: string | null = null
  let mediaUrl: string | null = null
  let messageType: MessageType = MessageType.OTHER

  switch (message.type) {
    case 'text':
      content = (message as TextEventMessage).text
      messageType = MessageType.TEXT
      break
    case 'image':
      messageType = MessageType.IMAGE
      break
    case 'video':
      messageType = MessageType.VIDEO
      break
    case 'audio':
      messageType = MessageType.AUDIO
      break
    case 'file':
      messageType = MessageType.FILE
      break
    case 'sticker':
      messageType = MessageType.STICKER
      break
    case 'location':
      messageType = MessageType.LOCATION
      break
  }

  await prisma.message.create({
    data: {
      lineMessageId: message.id,
      messageType,
      content,
      mediaUrl,
      rawPayload: event as unknown as Record<string, unknown>,
      createdAt: new Date(event.timestamp),
      groupId: group.id,
      memberId: member.id,
    },
  })
}

async function handleJoinEvent(event: WebhookEvent) {
  if (event.type !== 'join' || event.source.type !== 'group') return

  const groupId = event.source.groupId
  if (!groupId) return

  await prisma.lineGroup.upsert({
    where: { lineGroupId: groupId },
    update: {},
    create: { lineGroupId: groupId },
  })
}

async function handleLeaveEvent(event: WebhookEvent) {
  if (event.type !== 'leave' || event.source.type !== 'group') return

  const groupId = event.source.groupId
  if (!groupId) return

  await prisma.lineGroup.update({
    where: { lineGroupId: groupId },
    data: { status: 'ARCHIVED' },
  })
}

async function handleMemberJoinedEvent(event: WebhookEvent) {
  if (event.type !== 'memberJoined' || event.source.type !== 'group') return

  const groupId = event.source.groupId
  if (!groupId) return

  const group = await prisma.lineGroup.findUnique({
    where: { lineGroupId: groupId },
  })

  if (!group) return

  for (const joined of event.joined.members) {
    const userId = joined.userId
    const profile = await getGroupMemberProfile(groupId, userId)

    const member = await prisma.member.upsert({
      where: { lineUserId: userId },
      update: {
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      },
      create: {
        lineUserId: userId,
        displayName: profile?.displayName,
        pictureUrl: profile?.pictureUrl,
      },
    })

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
  }
}

async function handleMemberLeftEvent(event: WebhookEvent) {
  if (event.type !== 'memberLeft' || event.source.type !== 'group') return

  const groupId = event.source.groupId
  if (!groupId) return

  const group = await prisma.lineGroup.findUnique({
    where: { lineGroupId: groupId },
  })

  if (!group) return

  for (const left of event.left.members) {
    const member = await prisma.member.findUnique({
      where: { lineUserId: left.userId },
    })

    if (member) {
      await prisma.groupMember.delete({
        where: {
          groupId_memberId: {
            groupId: group.id,
            memberId: member.id,
          },
        },
      }).catch(() => {})
    }
  }
}
