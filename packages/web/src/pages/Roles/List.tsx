import { useEffect, useState } from 'react'
import { Table, Tag, Button, Modal, Form, Input, Checkbox, message, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { rolesApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Role {
  id: number
  name: string
  description: string | null
  permissions: string[]
  isSystem: boolean
  _count: { users: number }
}

export function RoleList() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([rolesApi.list(), rolesApi.permissions()])
      if (rolesRes.success) setRoles(rolesRes.data as Role[])
      if (permsRes.success && permsRes.data) setPermissions(permsRes.data)
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
      const res = await rolesApi.create(values)
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
      const res = await rolesApi.delete(id)
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

  const columns: ColumnsType<Role> = [
    { title: '角色名稱', dataIndex: 'name', key: 'name' },
    { title: '說明', dataIndex: 'description', key: 'description' },
    {
      title: '類型',
      dataIndex: 'isSystem',
      key: 'isSystem',
      render: (isSystem) => <Tag color={isSystem ? 'blue' : 'default'}>{isSystem ? '系統' : '自訂'}</Tag>,
    },
    {
      title: '權限數',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (perms) => perms.length,
    },
    {
      title: '用戶數',
      dataIndex: '_count',
      key: 'users',
      render: (count) => count.users,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) =>
        hasPermission('role.delete') && !record.isSystem ? (
          <Popconfirm title="確定要刪除嗎？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              刪除
            </Button>
          </Popconfirm>
        ) : null,
    },
  ]

  const permissionOptions = Object.entries(permissions).map(([key, label]) => ({
    label: `${label} (${key})`,
    value: key,
  }))

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        {hasPermission('role.create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新增角色
          </Button>
        )}
      </div>

      <Table columns={columns} dataSource={roles} rowKey="id" loading={loading} />

      <Modal
        title="新增角色"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="角色名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="說明">
            <Input />
          </Form.Item>
          <Form.Item name="permissions" label="權限" rules={[{ required: true }]}>
            <Checkbox.Group options={permissionOptions} style={{ display: 'flex', flexDirection: 'column', gap: 8 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
