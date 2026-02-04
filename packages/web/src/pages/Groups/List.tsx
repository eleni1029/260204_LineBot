import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Select, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { groupsApi } from '@/services/api'

interface Group {
  id: number
  lineGroupId: string
  displayName: string | null
  status: string
  customer: { id: number; name: string } | null
  _count: { messages: number; members: number; issues: number }
  updatedAt: string
}

export function GroupList() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const navigate = useNavigate()

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const res = await groupsApi.list({ page, pageSize: 20, status })
      if (res.success && res.data) {
        setGroups(res.data as Group[])
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

  const columns: ColumnsType<Group> = [
    {
      title: '群聊名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name, record) => (
        <a onClick={() => navigate(`/groups/${record.id}`)}>{name || record.lineGroupId}</a>
      ),
    },
    {
      title: '綁定客戶',
      dataIndex: 'customer',
      key: 'customer',
      render: (customer) =>
        customer ? (
          <a onClick={() => navigate(`/customers/${customer.id}`)}>{customer.name}</a>
        ) : (
          '-'
        ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag>,
    },
    {
      title: '成員數',
      dataIndex: '_count',
      key: 'members',
      render: (count) => count.members,
    },
    {
      title: '訊息數',
      dataIndex: '_count',
      key: 'messages',
      render: (count) => count.messages,
    },
    {
      title: '問題數',
      dataIndex: '_count',
      key: 'issues',
      render: (count) => count.issues,
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
            style={{ width: 120 }}
            options={[
              { value: 'ACTIVE', label: '活躍' },
              { value: 'ARCHIVED', label: '歸檔' },
            ]}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
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
