import { useAuthStore } from '@/stores/auth'

const API_BASE = '/api'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = useAuthStore.getState().token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  return response.json()
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, {
      method: 'DELETE',
    }),
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ accessToken: string; user: unknown }>('/auth/login', { username, password }),

  me: () => api.get<unknown>('/auth/me'),

  logout: () => api.post('/auth/logout'),
}

// Customers API
export const customersApi = {
  list: (params?: { page?: number; pageSize?: number; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/customers${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/customers/${id}`),
  create: (data: unknown) => api.post<unknown>('/customers', data),
  update: (id: number, data: unknown) => api.put<unknown>(`/customers/${id}`, data),
  delete: (id: number) => api.delete(`/customers/${id}`),
  updateGroups: (id: number, groupIds: number[]) =>
    api.put<unknown>(`/customers/${id}/groups`, { groupIds }),
}

// Groups API
export const groupsApi = {
  list: (params?: { page?: number; pageSize?: number; status?: string; customerId?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/groups${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/groups/${id}`),
  update: (id: number, data: unknown) => api.put<unknown>(`/groups/${id}`, data),
  messages: (id: number, params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/groups/${id}/messages${query ? `?${query}` : ''}`)
  },
  issues: (id: number, params?: { page?: number; pageSize?: number; status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/groups/${id}/issues${query ? `?${query}` : ''}`)
  },
}

// Members API
export const membersApi = {
  list: (params?: { page?: number; pageSize?: number; role?: string; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/members${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/members/${id}`),
  update: (id: number, data: unknown) => api.put<unknown>(`/members/${id}`, data),
  messages: (id: number, params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/members/${id}/messages${query ? `?${query}` : ''}`)
  },
}

// Messages API
export const messagesApi = {
  list: (params?: {
    page?: number
    pageSize?: number
    groupId?: number
    memberId?: number
    search?: string
    startDate?: string
    endDate?: string
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/messages${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/messages/${id}`),
}

// Issues API
export const issuesApi = {
  list: (params?: {
    page?: number
    pageSize?: number
    status?: string
    customerId?: number
    groupId?: number
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/issues${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/issues/${id}`),
  update: (id: number, data: unknown) => api.put<unknown>(`/issues/${id}`, data),
  stats: () => api.get<unknown>('/issues/stats/summary'),
}

// Users API
export const usersApi = {
  list: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/users${query ? `?${query}` : ''}`)
  },
  get: (id: number) => api.get<unknown>(`/users/${id}`),
  create: (data: unknown) => api.post<unknown>('/users', data),
  update: (id: number, data: unknown) => api.put<unknown>(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
}

// Roles API
export const rolesApi = {
  list: () => api.get<unknown[]>('/roles'),
  get: (id: number) => api.get<unknown>(`/roles/${id}`),
  create: (data: unknown) => api.post<unknown>('/roles', data),
  update: (id: number, data: unknown) => api.put<unknown>(`/roles/${id}`, data),
  delete: (id: number) => api.delete(`/roles/${id}`),
  permissions: () => api.get<Record<string, string>>('/roles/permissions'),
}

// Settings API
export const settingsApi = {
  get: () => api.get<Record<string, string>>('/settings'),
  update: (data: Record<string, string>) => api.put('/settings', data),
}

// Analysis API
export const analysisApi = {
  run: (params?: { groupId?: number; since?: string }) =>
    api.post<unknown>('/analysis/run', params),
}

// Logs API
export const logsApi = {
  list: (params?: {
    page?: number
    pageSize?: number
    entityType?: string
    action?: string
    userId?: number
    startDate?: string
    endDate?: string
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<unknown[]>(`/logs${query ? `?${query}` : ''}`)
  },
}
