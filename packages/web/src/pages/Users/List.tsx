import { useEffect, useState } from 'react'
import { Table, Button, Tag, Modal, Form, Input, Select, message, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { usersApi, rolesApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface User {
  id: number
  username: string
  email: string
  displayName: string | null
  isActive: boolean
  role: { id: number; name: string }
  lastLoginAt: string | null
}

interface Role {
  id: number
  name: string
}

export function UserList() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const hasPermission = useAuthStore((state) => state.hasPermission)
  const currentUserId = useAuthStore((state) => state.user?.id)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([usersApi.list(), rolesApi.list()])
      if (usersRes.success) setUsers(usersRes.data as User[])
      if (rolesRes.success) setRoles(rolesRes.data as Role[])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleCreate = async (values: any) => {
    try {
      const res = await usersApi.create(values)
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

  const handleDelete = async (id: number) => {
    try {
      const res = await usersApi.delete(id)
      if (res.success) {
        message.success('刪除成功')
        fetchData()
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const columns: ColumnsType<User> = [
    { title: '帳號', dataIndex: 'username', key: 'username' },
    { title: '顯示名稱', dataIndex: 'displayName', key: 'displayName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: '角色', dataIndex: ['role', 'name'], key: 'role' },
    {
      title: '狀態',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? '啟用' : '停用'}</Tag>,
    },
    {
      title: '最後登入',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (t) => (t ? new Date(t).toLocaleString() : '-'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) =>
        hasPermission('user.delete') && record.id !== currentUserId ? (
          <Popconfirm title="確定要刪除嗎？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              刪除
            </Button>
          </Popconfirm>
        ) : null,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        {hasPermission('user.create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增用戶
          </Button>
        )}
      </div>

      <Table columns={columns} dataSource={users} rowKey="id" loading={loading} />

      <Modal
        title="新增用戶"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="username" label="帳號" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密碼" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="displayName" label="顯示名稱">
            <Input />
          </Form.Item>
          <Form.Item name="roleId" label="角色" rules={[{ required: true }]}>
            <Select
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              placeholder="選擇角色"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
