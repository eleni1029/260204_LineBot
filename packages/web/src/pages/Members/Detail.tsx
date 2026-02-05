import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Select, message, Table, Input, Space, Popconfirm } from 'antd'
import { ArrowLeftOutlined, EditOutlined, CheckOutlined, CloseOutlined, DeleteOutlined } from '@ant-design/icons'
import { membersApi, type Member } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { ChannelTag } from '@/components/ChannelTag'

export function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [member, setMember] = useState<Member | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
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

  const handleNameEdit = () => {
    setNewName(member?.displayName || '')
    setEditingName(true)
  }

  const handleNameSave = async () => {
    if (!id || !newName.trim()) return
    try {
      const res = await membersApi.update(parseInt(id), { displayName: newName.trim() })
      if (res.success) {
        message.success('名稱已更新')
        setEditingName(false)
        fetchData()
      } else {
        message.error(res.error?.message || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const handleNameCancel = () => {
    setEditingName(false)
    setNewName('')
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      const res = await membersApi.delete(parseInt(id))
      if (res.success) {
        message.success('刪除成功')
        navigate('/members')
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/members')}>
          返回
        </Button>
        {hasPermission('member.edit') && (
          <Popconfirm
            title="確定要刪除此人員嗎？"
            description="刪除後無法恢復，但訊息記錄會保留"
            onConfirm={handleDelete}
            okText="確定刪除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>
              刪除人員
            </Button>
          </Popconfirm>
        )}
      </div>

      <Card title="人員資訊">
        <Descriptions column={2}>
          <Descriptions.Item label="名稱">
            {editingName ? (
              <Space>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onPressEnter={handleNameSave}
                  style={{ width: 150 }}
                  autoFocus
                />
                <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleNameSave} />
                <Button size="small" icon={<CloseOutlined />} onClick={handleNameCancel} />
              </Space>
            ) : (
              <Space>
                <span>{member.displayName || '(未知)'}</span>
                {hasPermission('member.edit') && (
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={handleNameEdit}>
                    編輯
                  </Button>
                )}
              </Space>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="渠道">
            <ChannelTag channel={member.channel || 'LINE'} />
          </Descriptions.Item>
          <Descriptions.Item label="用戶 ID">{member.lineUserId}</Descriptions.Item>
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
              title: '渠道',
              dataIndex: ['group', 'channel'],
              width: 80,
              render: (channel) => <ChannelTag channel={channel || 'LINE'} />,
            },
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
