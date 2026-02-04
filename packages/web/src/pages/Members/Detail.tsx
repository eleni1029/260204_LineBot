import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Select, message, Table } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { membersApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Member {
  id: number
  lineUserId: string
  displayName: string | null
  pictureUrl: string | null
  role: string
  notes: string | null
  groups: { group: { id: number; displayName: string; customer: { name: string } | null } }[]
  createdAt: string
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [member, setMember] = useState<Member | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [memberRes, messagesRes] = await Promise.all([
        membersApi.get(parseInt(id)),
        membersApi.messages(parseInt(id), { pageSize: 50 }),
      ])
      if (memberRes.success) setMember(memberRes.data as Member)
      if (messagesRes.success) setMessages(messagesRes.data as any[])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleRoleChange = async (role: string) => {
    if (!id) return
    try {
      const res = await membersApi.update(parseInt(id), { role })
      if (res.success) {
        message.success('更新成功')
        fetchData()
      } else {
        message.error(res.error?.message || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const roleColors: Record<string, string> = {
    STAFF: 'blue',
    EXTERNAL_ADMIN: 'purple',
    EXTERNAL: 'default',
  }

  if (loading || !member) {
    return <Card loading={loading} />
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/members')} style={{ marginBottom: 16 }}>
        返回
      </Button>

      <Card title="人員資訊">
        <Descriptions column={2}>
          <Descriptions.Item label="名稱">{member.displayName || '(未知)'}</Descriptions.Item>
          <Descriptions.Item label="LINE User ID">{member.lineUserId}</Descriptions.Item>
          <Descriptions.Item label="角色">
            {hasPermission('member.edit') ? (
              <Select
                value={member.role}
                onChange={handleRoleChange}
                style={{ width: 150 }}
                options={[
                  { value: 'STAFF', label: '員工' },
                  { value: 'EXTERNAL_ADMIN', label: '外部管理者' },
                  { value: 'EXTERNAL', label: '外部人員' },
                ]}
              />
            ) : (
              <Tag color={roleColors[member.role]}>{member.role}</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="備註">{member.notes || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="所屬群組" style={{ marginTop: 16 }}>
        <Table
          dataSource={member.groups}
          rowKey={(r) => r.group.id}
          columns={[
            {
              title: '群聊',
              dataIndex: ['group', 'displayName'],
              render: (name, record) => (
                <a onClick={() => navigate(`/groups/${record.group.id}`)}>{name || '(未命名)'}</a>
              ),
            },
            { title: '客戶', dataIndex: ['group', 'customer', 'name'], render: (n) => n || '-' },
          ]}
          pagination={false}
        />
      </Card>

      <Card title="發言記錄" style={{ marginTop: 16 }}>
        <Table
          dataSource={messages}
          rowKey="id"
          columns={[
            { title: '內容', dataIndex: 'content', ellipsis: true },
            { title: '群聊', dataIndex: ['group', 'displayName'] },
            { title: '時間', dataIndex: 'createdAt', render: (t) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
        />
      </Card>
    </div>
  )
}
