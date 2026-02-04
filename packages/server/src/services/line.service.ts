import * as line from '@line/bot-sdk'
import { getSettings } from './settings.service.js'

let clientInstance: line.messagingApi.MessagingApiClient | null = null

export async function getLineClient() {
  if (!clientInstance) {
    const settings = await getSettings()
    const accessToken = settings['line.channelAccessToken']
    if (!accessToken) {
      throw new Error('LINE Channel Access Token not configured')
    }
    clientInstance = new line.messagingApi.MessagingApiClient({
      channelAccessToken: accessToken,
    })
  }
  return clientInstance
}

export async function getGroupMemberProfile(groupId: string, userId: string) {
  const client = await getLineClient()
  try {
    return await client.getGroupMemberProfile(groupId, userId)
  } catch {
    return null
  }
}

export async function validateSignature(body: string, signature: string): Promise<boolean> {
  const settings = await getSettings()
  const channelSecret = settings['line.channelSecret']
  if (!channelSecret) {
    throw new Error('LINE Channel Secret not configured')
  }
  return line.validateSignature(body, channelSecret, signature)
}

export function resetClient() {
  clientInstance = null
}
