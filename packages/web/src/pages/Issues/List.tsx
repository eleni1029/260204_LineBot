import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Select, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { issuesApi } from '@/services/api'

interface Issue {
  id: number
  questionSummary: string | null
  status: string
  sentiment: string | null
  replyRelevanceScore: number | null
  group: { id: number; displayName: string; customer: { name: string } | null }
  triggerMessage: { member: { displayName: string } } | null
  repliedBy: { displayName: string } | null
  createdAt: string
  repliedAt: string | null
}

export function IssueList() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const navigate = useNavigate()

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const res = await issuesApi.list({ page, pageSize: 20, status })
      if (res.success && res.data) {
        setIssues(res.data as Issue[])
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
  }, [status])

  const statusColors: Record<string, string> = {
    PENDING: 'gold',
    REPLIED: 'green',
    WAITING_CUSTOMER: 'blue',
    TIMEOUT: 'red',
    RESOLVED: 'default',
    IGNORED: 'default',
  }

  const statusLabels: Record<string, string> = {
    PENDING: '待回覆',
    REPLIED: '已回覆',
    WAITING_CUSTOMER: '等待客戶',
    TIMEOUT: '超時',
    RESOLVED: '已解決',
    IGNORED: '已忽略',
  }

  const columns: ColumnsType<Issue> = [
    {
      title: '問題摘要',
      dataIndex: 'questionSummary',
      key: 'questionSummary',
      ellipsis: true,
      render: (text, record) => (
        <a onClick={() => navigate(`/issues/${record.id}`)}>{text || '(無摘要)'}</a>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => <Tag color={statusColors[s]}>{statusLabels[s]}</Tag>,
    },
    {
      title: '提問者',
      dataIndex: 'triggerMessage',
      key: 'asker',
      render: (msg) => msg?.member?.displayName || '-',
    },
    {
      title: '回覆者',
      dataIndex: 'repliedBy',
      key: 'repliedBy',
      render: (member) => member?.displayName || '-',
    },
    {
      title: '回覆分數',
      dataIndex: 'replyRelevanceScore',
      key: 'score',
      width: 100,
      render: (score) => (score !== null ? score : '-'),
    },
    {
      title: '群聊',
      dataIndex: 'group',
      key: 'group',
      render: (group) => group.displayName || '(未命名)',
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t) => new Date(t).toLocaleString(),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <span>狀態：</span>
          <Select
            value={status}
            onChange={setStatus}
            allowClear
            placeholder="全部"
            style={{ width: 150 }}
            options={[
              { value: 'PENDING', label: '待回覆' },
              { value: 'REPLIED', label: '已回覆' },
              { value: 'WAITING_CUSTOMER', label: '等待客戶' },
              { value: 'TIMEOUT', label: '超時' },
              { value: 'RESOLVED', label: '已解決' },
              { value: 'IGNORED', label: '已忽略' },
            ]}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={issues}
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
