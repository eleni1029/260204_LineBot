import { useEffect, useState } from 'react'
import { Table, Select, DatePicker, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { logsApi } from '@/services/api'

const { RangePicker } = DatePicker

interface Log {
  id: number
  entityType: string
  entityId: number | null
  action: string
  details: any
  user: { username: string; displayName: string } | null
  ipAddress: string | null
  createdAt: string
}

export function LogList() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)
  const [entityType, setEntityType] = useState<string | undefined>()
  const [action, setAction] = useState<string | undefined>()
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize: 50 }
      if (entityType) params.entityType = entityType
      if (action) params.action = action
      if (dateRange) {
        params.startDate = dateRange[0].toISOString()
        params.endDate = dateRange[1].toISOString()
      }
      const res = await logsApi.list(params)
      if (res.success && res.data) {
        setLogs(res.data as Log[])
        if (res.pagination) {
          setPagination({
            current: res.pagination.page,
            pageSize: res.pagination.pageSize,
            total: res.pagination.total,
          })
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [entityType, action, dateRange])

  const columns: ColumnsType<Log> = [
    { title: '類型', dataIndex: 'entityType', key: 'entityType', width: 100 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 100 },
    { title: 'Entity ID', dataIndex: 'entityId', key: 'entityId', width: 100 },
    {
      title: '操作者',
      dataIndex: 'user',
      key: 'user',
      render: (user) => user?.displayName || user?.username || '系統',
    },
    {
      title: '詳情',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (details) => (details ? JSON.stringify(details) : '-'),
    },
    { title: 'IP', dataIndex: 'ipAddress', key: 'ipAddress', width: 120 },
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t) => new Date(t).toLocaleString(),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            value={entityType}
            onChange={setEntityType}
            allowClear
            placeholder="類型"
            style={{ width: 120 }}
            options={[
              { value: 'customer', label: '客戶' },
              { value: 'group', label: '群聊' },
              { value: 'member', label: '人員' },
              { value: 'issue', label: '問題' },
              { value: 'user', label: '用戶' },
              { value: 'role', label: '角色' },
              { value: 'setting', label: '設定' },
              { value: 'analysis', label: '分析' },
            ]}
          />
          <Select
            value={action}
            onChange={setAction}
            allowClear
            placeholder="操作"
            style={{ width: 120 }}
            options={[
              { value: 'create', label: '新增' },
              { value: 'update', label: '更新' },
              { value: 'delete', label: '刪除' },
              { value: 'login', label: '登入' },
              { value: 'logout', label: '登出' },
              { value: 'analyze', label: '分析' },
            ]}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          onChange: (page) => fetchData(page),
        }}
      />
    </div>
  )
}
