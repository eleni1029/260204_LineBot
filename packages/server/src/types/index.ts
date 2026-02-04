import { FastifyRequest, FastifyReply } from 'fastify'

export interface JWTPayload {
  id: number
  username: string
  roleId: number
  permissions: string[]
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
    user: JWTPayload
  }
}

export interface PaginationQuery {
  page?: number
  pageSize?: number
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface SuccessResponse<T> {
  success: true
  data: T
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

export const PERMISSIONS = {
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
} as const

export type PermissionCode = keyof typeof PERMISSIONS
