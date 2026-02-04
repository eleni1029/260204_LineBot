import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Button, Input, Space, Tag, Modal, Form, message } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { customersApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Customer {
  id: number
  name: string
  contactPerson: string | null
  contactEmail: string | null
  sentiment: string
  groups: { id: number; displayName: string }[]
  _count: { issues: number }
  updatedAt: string
}

export function CustomerList() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const res = await customersApi.list({ page, pageSize: 20, search: search || undefined })
      if (res.success && res.data) {
        setCustomers(res.data as Customer[])
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
  }, [])

  const handleSearch = () => {
    fetchData(1)
  }

  const handleCreate = async (values: any) => {
    try {
      const res = await customersApi.create(values)
      if (res.success) {
        message.success('新增成功')
        setModalOpen(false)
        form.resetFields()
        fetchData()
      } else {
        message.error(res.error?.message || '新增失敗')
      }
    } catch {
      message.error('新增失敗')
    }
  }

  const sentimentColors: Record<string, string> = {
    POSITIVE: 'green',
    NEUTRAL: 'default',
    NEGATIVE: 'orange',
    AT_RISK: 'red',
  }

  const columns: ColumnsType<Customer> = [
    {
      title: '客戶名稱',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a onClick={() => navigate(`/customers/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '聯絡人',
      dataIndex: 'contactPerson',
      key: 'contactPerson',
    },
    {
      title: '情緒',
      dataIndex: 'sentiment',
      key: 'sentiment',
      render: (sentiment) => <Tag color={sentimentColors[sentiment]}>{sentiment}</Tag>,
    },
    {
      title: '群聊數',
      dataIndex: 'groups',
      key: 'groups',
      render: (groups) => groups.length,
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Input
            placeholder="搜尋客戶名稱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
          />
          <Button icon={<SearchOutlined />} onClick={handleSearch}>
            搜尋
          </Button>
        </Space>
        {hasPermission('customer.create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增客戶
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          onChange: (page) => fetchData(page),
        }}
      />

      <Modal
        title="新增客戶"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="客戶名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactPerson" label="聯絡人">
            <Input />
          </Form.Item>
          <Form.Item name="contactEmail" label="Email">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="contactPhone" label="電話">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="備註">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
