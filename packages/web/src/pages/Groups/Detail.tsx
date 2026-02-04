import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Table, Tabs } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { groupsApi } from '@/services/api'

interface Group {
  id: number
  lineGroupId: string
  displayName: string | null
  status: string
  customer: { id: number; name: string } | null
  members: { member: { id: number; displayName: string; role: string } }[]
  createdAt: string
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [groupRes, messagesRes, issuesRes] = await Promise.all([
        groupsApi.get(parseInt(id)),
        groupsApi.messages(parseInt(id), { pageSize: 50 }),
        groupsApi.issues(parseInt(id), { pageSize: 20 }),
      ])
      if (groupRes.success) setGroup(groupRes.data as Group)
      if (messagesRes.success) setMessages(messagesRes.data as any[])
      if (issuesRes.success) setIssues(issuesRes.data as any[])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const roleColors: Record<string, string> = {
    STAFF: 'blue',
    EXTERNAL_ADMIN: 'purple',
    EXTERNAL: 'default',
  }

  if (loading || !group) {
    return <Card loading={loading} />
  }

  const tabItems = [
    {
      key: 'members',
      label: '成員',
      children: (
        <Table
          dataSource={group.members}
          rowKey={(r) => r.member.id}
          columns={[
            {
              title: '名稱',
              dataIndex: ['member', 'displayName'],
              render: (name, record) => (
                <a onClick={() => navigate(`/members/${record.member.id}`)}>{name || '(未知)'}</a>
              ),
            },
            {
              title: '角色',
              dataIndex: ['member', 'role'],
              render: (role) => <Tag color={roleColors[role]}>{role}</Tag>,
            },
          ]}
          pagination={false}
        />
      ),
    },
    {
      key: 'messages',
      label: '訊息',
      children: (
        <Table
          dataSource={messages}
          rowKey="id"
          columns={[
            { title: '發送者', dataIndex: ['member', 'displayName'] },
            { title: '內容', dataIndex: 'content', ellipsis: true },
            { title: '類型', dataIndex: 'messageType' },
            { title: '時間', dataIndex: 'createdAt', render: (t) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
        />
      ),
    },
    {
      key: 'issues',
      label: '問答記錄',
      children: (
        <Table
          dataSource={issues}
          rowKey="id"
          columns={[
            {
              title: '問題摘要',
              dataIndex: 'questionSummary',
              render: (text, record) => (
                <a onClick={() => navigate(`/issues/${record.id}`)}>{text || '(無)'}</a>
              ),
            },
            { title: '狀態', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
            { title: '回覆者', dataIndex: ['repliedBy', 'displayName'] },
            { title: '建立時間', dataIndex: 'createdAt', render: (t) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
        />
      ),
    },
  ]

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/groups')} style={{ marginBottom: 16 }}>
        返回
      </Button>

      <Card title="群聊資訊">
        <Descriptions column={2}>
          <Descriptions.Item label="名稱">{group.displayName || '(未命名)'}</Descriptions.Item>
          <Descriptions.Item label="LINE Group ID">{group.lineGroupId}</Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={group.status === 'ACTIVE' ? 'green' : 'default'}>{group.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="綁定客戶">
            {group.customer ? (
              <a onClick={() => navigate(`/customers/${group.customer!.id}`)}>{group.customer.name}</a>
            ) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Tabs items={tabItems} />
      </Card>
    </div>
  )
}
