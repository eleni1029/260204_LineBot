import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const PERMISSIONS = {
  // 客戶
  'customer.view': '查看客戶',
  'customer.create': '新增客戶',
  'customer.edit': '編輯客戶',
  'customer.delete': '刪除客戶',

  // 群聊
  'group.view': '查看群聊',
  'group.edit': '編輯群聊',

  // 人員
  'member.view': '查看人員',
  'member.edit': '編輯人員（標記角色）',

  // 訊息
  'message.view': '查看訊息',

  // 問題
  'issue.view': '查看問題',
  'issue.edit': '編輯問題',

  // 分析
  'analysis.run': '執行分析',

  // 用戶
  'user.view': '查看用戶',
  'user.create': '新增用戶',
  'user.edit': '編輯用戶',
  'user.delete': '刪除用戶',

  // 角色
  'role.view': '查看角色',
  'role.create': '新增角色',
  'role.edit': '編輯角色',
  'role.delete': '刪除角色',

  // 設定
  'setting.view': '查看設定',
  'setting.edit': '編輯設定',

  // 日誌
  'log.view': '查看日誌',
}

async function main() {
  console.log('Seeding database...')

  // 建立預設角色
  const superAdmin = await prisma.role.upsert({
    where: { name: '超級管理員' },
    update: {},
    create: {
      name: '超級管理員',
      description: '擁有所有權限',
      permissions: Object.keys(PERMISSIONS),
      isSystem: true,
    },
  })
  console.log('Created role: 超級管理員')

  const admin = await prisma.role.upsert({
    where: { name: '管理員' },
    update: {},
    create: {
      name: '管理員',
      description: '除角色管理外的所有權限',
      permissions: Object.keys(PERMISSIONS).filter((p) => !p.startsWith('role.')),
      isSystem: true,
    },
  })
  console.log('Created role: 管理員')

  const agent = await prisma.role.upsert({
    where: { name: '客服' },
    update: {},
    create: {
      name: '客服',
      description: '查看與處理客戶問題',
      permissions: [
        'customer.view',
        'group.view',
        'member.view',
        'message.view',
        'issue.view',
        'issue.edit',
      ],
      isSystem: true,
    },
  })
  console.log('Created role: 客服')

  // 建立預設管理員帳號
  const passwordHash = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash,
      displayName: '系統管理員',
      roleId: superAdmin.id,
    },
  })
  console.log('Created user: admin')

  // 建立預設系統設定
  const defaultSettings = [
    { key: 'ai.provider', value: 'gemini', description: 'AI Provider' },
    { key: 'ai.claude.apiKey', value: '', description: 'Claude API Key' },
    { key: 'ai.claude.model', value: 'claude-sonnet-4-5-20250929', description: 'Claude Model' },
    { key: 'ai.gemini.apiKey', value: '', description: 'Gemini API Key' },
    { key: 'ai.gemini.model', value: 'gemini-1.5-flash', description: 'Gemini Model' },
    { key: 'ai.ollama.baseUrl', value: 'http://localhost:11434', description: 'Ollama Base URL' },
    { key: 'ai.ollama.model', value: 'llama3', description: 'Ollama Model' },
    { key: 'issue.timeoutMinutes', value: '15', description: '問題超時時間（分鐘）' },
    { key: 'issue.replyThreshold', value: '60', description: '回覆相關性閾值' },
    { key: 'line.channelSecret', value: '', description: 'LINE Channel Secret' },
    { key: 'line.channelAccessToken', value: '', description: 'LINE Channel Access Token' },
  ]

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }
  console.log('Created default settings')

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
