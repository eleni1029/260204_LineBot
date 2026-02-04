import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Button, Space, Table, message, Popconfirm } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { customersApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Customer {
  id: number
  name: string
  contactPerson: string | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  sentiment: string
  groups: { id: number; displayName: string; lineGroupId: string }[]
  issues: any[]
  createdAt: string
  updatedAt: string
}

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await customersApi.get(parseInt(id))
      if (res.success && res.data) {
        setCustomer(res.data as Customer)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleDelete = async () => {
    if (!id) return
    try {
      const res = await customersApi.delete(parseInt(id))
      if (res.success) {
        message.success('刪除成功')
        navigate('/customers')
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const sentimentColors: Record<string, string> = {
    POSITIVE: 'green',
    NEUTRAL: 'default',
    NEGATIVE: 'orange',
    AT_RISK: 'red',
  }

  if (loading || !customer) {
    return <Card loading={loading} />
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
          返回
        </Button>
        <Space>
          {hasPermission('customer.edit') && (
            <Button icon={<EditOutlined />}>編輯</Button>
          )}
          {hasPermission('customer.delete') && (
            <Popconfirm title="確定要刪除嗎？" onConfirm={handleDelete}>
              <Button danger icon={<DeleteOutlined />}>
                刪除
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card title="客戶資訊">
        <Descriptions column={2}>
          <Descriptions.Item label="客戶名稱">{customer.name}</Descriptions.Item>
          <Descriptions.Item label="情緒">
            <Tag color={sentimentColors[customer.sentiment]}>{customer.sentiment}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="聯絡人">{customer.contactPerson || '-'}</Descriptions.Item>
          <Descriptions.Item label="Email">{customer.contactEmail || '-'}</Descriptions.Item>
          <Descriptions.Item label="電話">{customer.contactPhone || '-'}</Descriptions.Item>
          <Descriptions.Item label="備註">{customer.notes || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="綁定群聊" style={{ marginTop: 16 }}>
        <Table
          dataSource={customer.groups}
          rowKey="id"
          columns={[
            {
              title: '群聊名稱',
              dataIndex: 'displayName',
              render: (name, record) => (
                <a onClick={() => navigate(`/groups/${record.id}`)}>{name || record.lineGroupId}</a>
              ),
            },
            { title: 'LINE Group ID', dataIndex: 'lineGroupId' },
          ]}
          pagination={false}
        />
      </Card>

      <Card title="最近問題" style={{ marginTop: 16 }}>
        <Table
          dataSource={customer.issues}
          rowKey="id"
          columns={[
            {
              title: '問題摘要',
              dataIndex: 'questionSummary',
              render: (text, record) => (
                <a onClick={() => navigate(`/issues/${record.id}`)}>{text || '(無摘要)'}</a>
              ),
            },
            { title: '狀態', dataIndex: 'status', render: (s) => <Tag>{s}</Tag> },
            { title: '建立時間', dataIndex: 'createdAt', render: (t) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
        />
      </Card>
    </div>
  )
}
