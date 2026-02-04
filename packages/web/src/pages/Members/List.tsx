import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Select, Input, Space, Button } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { membersApi } from '@/services/api'

interface Member {
  id: number
  lineUserId: string
  displayName: string | null
  role: string
  groups: { group: { id: number; displayName: string } }[]
  _count: { messages: number }
  updatedAt: string
}

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const navigate = useNavigate()

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const res = await membersApi.list({ page, pageSize: 20, role, search: search || undefined })
      if (res.success && res.data) {
        setMembers(res.data as Member[])
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
  }, [role])

  const handleSearch = () => {
    fetchData(1)
  }

  const roleColors: Record<string, string> = {
    STAFF: 'blue',
    EXTERNAL_ADMIN: 'purple',
    EXTERNAL: 'default',
  }

  const roleLabels: Record<string, string> = {
    STAFF: '員工',
    EXTERNAL_ADMIN: '外部管理者',
    EXTERNAL: '外部人員',
  }

  const columns: ColumnsType<Member> = [
    {
      title: '名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name, record) => (
        <a onClick={() => navigate(`/members/${record.id}`)}>{name || '(未知)'}</a>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (r) => <Tag color={roleColors[r]}>{roleLabels[r]}</Tag>,
    },
    {
      title: '所屬群組',
      dataIndex: 'groups',
      key: 'groups',
      render: (groups) => groups.length,
    },
    {
      title: '訊息數',
      dataIndex: '_count',
      key: 'messages',
      render: (count) => count.messages,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜尋名稱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
          />
          <Button icon={<SearchOutlined />} onClick={handleSearch}>
            搜尋
          </Button>
          <Select
            value={role}
            onChange={setRole}
            allowClear
            placeholder="角色"
            style={{ width: 150 }}
            options={[
              { value: 'STAFF', label: '員工' },
              { value: 'EXTERNAL_ADMIN', label: '外部管理者' },
              { value: 'EXTERNAL', label: '外部人員' },
            ]}
          />
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={members}
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
