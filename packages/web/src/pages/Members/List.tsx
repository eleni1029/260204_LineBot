import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Select, Input, Space, Button, Popconfirm, message, Avatar, Tooltip, Modal } from 'antd'
import { SearchOutlined, DeleteOutlined, SyncOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { membersApi, type Member } from '@/services/api'
import { ChannelTag } from '@/components/ChannelTag'
import { useAuthStore } from '@/stores/auth'

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [role, setRole] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [fetchingProfile, setFetchingProfile] = useState<number | null>(null)
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<string>('EXTERNAL')
  const navigate = useNavigate()
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async (page = 1, searchQuery = search) => {
    setLoading(true)
    try {
      const res = await membersApi.list({ page, pageSize: 20, role, search: searchQuery || undefined })
      if (res.success && res.data) {
        setMembers(res.data)
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
    fetchData(1, search)
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await membersApi.delete(id)
      if (res.success) {
        message.success('刪除成功')
        fetchData(pagination.current)
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇要刪除的人員')
      return
    }

    try {
      const res = await membersApi.batchDelete(selectedRowKeys)
      if (res.success) {
        message.success(`成功刪除 ${res.data?.deleted || selectedRowKeys.length} 位人員`)
        setSelectedRowKeys([])
        fetchData(1)
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleFetchProfile = async (member: Member) => {
    setFetchingProfile(member.id)
    try {
      const res = await membersApi.fetchProfile(member.id)
      if (res.success && res.data) {
        message.success(`已同步: ${res.data.displayName}`)
        setMembers(prev => prev.map(m => m.id === member.id ? res.data! : m))
      } else {
        message.error(res.error?.message || '同步失敗')
      }
    } catch {
      message.error('同步失敗')
    } finally {
      setFetchingProfile(null)
    }
  }

  const handleBatchFetchProfile = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇要同步的人員')
      return
    }

    setBatchSyncing(true)
    try {
      const res = await membersApi.batchFetchProfile(selectedRowKeys)
      if (res.success && res.data) {
        message.success(`同步完成: 成功 ${res.data.success} 位，失敗 ${res.data.failed} 位`)
        setSelectedRowKeys([])
        fetchData(pagination.current)
      } else {
        message.error(res.error?.message || '同步失敗')
      }
    } catch {
      message.error('同步失敗')
    } finally {
      setBatchSyncing(false)
    }
  }

  const handleEditMember = (member: Member) => {
    setEditingMember(member)
    setEditName(member.displayName || '')
    setEditRole(member.role)
    setEditModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!editingMember) return

    try {
      const res = await membersApi.update(editingMember.id, {
        displayName: editName,
        role: editRole,
      })
      if (res.success) {
        message.success('更新成功')
        setMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, displayName: editName, role: editRole } : m))
        setEditModalVisible(false)
        setEditingMember(null)
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

  const roleLabels: Record<string, string> = {
    STAFF: '員工',
    EXTERNAL_ADMIN: '外部管理者',
    EXTERNAL: '外部人員',
  }

  const columns: ColumnsType<Member> = [
    {
      title: '渠道',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (channel) => <ChannelTag channel={channel || 'LINE'} />,
    },
    {
      title: '頭像',
      dataIndex: 'pictureUrl',
      key: 'avatar',
      width: 60,
      render: (url) => (
        <Avatar src={url} icon={<UserOutlined />} />
      ),
    },
    {
      title: '名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name, record) => (
        <Space>
          <a onClick={() => navigate(`/members/${record.id}`)}>{name || '(未知)'}</a>
          {hasPermission('member.edit') && (
            <>
              <Tooltip title="編輯">
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditMember(record)} />
              </Tooltip>
              {record.channel === 'LINE' && (
                <Tooltip title="從 LINE 同步">
                  <Button
                    type="link"
                    size="small"
                    icon={<SyncOutlined spin={fetchingProfile === record.id} />}
                    onClick={() => handleFetchProfile(record)}
                    loading={fetchingProfile === record.id}
                  />
                </Tooltip>
              )}
            </>
          )}
        </Space>
      ),
    },
    {
      title: '用戶 ID',
      dataIndex: 'lineUserId',
      key: 'lineUserId',
      width: 150,
      ellipsis: true,
      render: (id) => <span style={{ fontSize: 12, color: '#888' }}>{id}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (r) => <Tag color={roleColors[r]}>{roleLabels[r]}</Tag>,
    },
    {
      title: '所屬群組',
      dataIndex: 'groups',
      key: 'groups',
      width: 90,
      render: (groups) => groups.length,
    },
    {
      title: '訊息數',
      dataIndex: '_count',
      key: 'messages',
      width: 80,
      render: (count) => count.messages,
    },
  ]

  // 添加操作列（如果有權限）
  if (hasPermission('member.edit')) {
    columns.push({
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="確定要刪除此人員嗎？"
          description="刪除後無法恢復，但訊息記錄會保留"
          onConfirm={() => handleDelete(record.id)}
          okText="確定"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            刪除
          </Button>
        </Popconfirm>
      ),
    })
  }

  const rowSelection = hasPermission('member.edit')
    ? {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
      }
    : undefined

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Input
            placeholder="搜尋名稱或 ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
            allowClear
          />
          <Button onClick={handleSearch}>搜尋</Button>
          <Select
            value={role}
            onChange={setRole}
            allowClear
            placeholder="角色"
            style={{ width: 130 }}
            options={[
              { value: 'STAFF', label: '員工' },
              { value: 'EXTERNAL_ADMIN', label: '外部管理者' },
              { value: 'EXTERNAL', label: '外部人員' },
            ]}
          />
        </Space>

        {hasPermission('member.edit') && selectedRowKeys.length > 0 && (
          <Space>
            <Button
              icon={<SyncOutlined spin={batchSyncing} />}
              onClick={handleBatchFetchProfile}
              loading={batchSyncing}
            >
              批量同步 ({selectedRowKeys.length})
            </Button>
            <Popconfirm
              title={`確定要刪除選中的 ${selectedRowKeys.length} 位人員嗎？`}
              description="刪除後無法恢復，但訊息記錄會保留"
              onConfirm={handleBatchDelete}
              okText="確定刪除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                批量刪除
              </Button>
            </Popconfirm>
          </Space>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={members}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          ...pagination,
          onChange: (page) => fetchData(page),
        }}
      />

      {/* 編輯人員 Modal */}
      <Modal
        title="編輯人員資料"
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingMember(null)
        }}
        okText="儲存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>名稱：</div>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="輸入名稱"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>角色：</div>
          <Select
            value={editRole}
            onChange={setEditRole}
            style={{ width: '100%' }}
            options={[
              { value: 'STAFF', label: '員工' },
              { value: 'EXTERNAL_ADMIN', label: '外部管理者' },
              { value: 'EXTERNAL', label: '外部人員' },
            ]}
          />
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            設為「員工」的人員在問題分析時會被視為回覆者
          </div>
        </div>
        {editingMember && (
          <div>
            <Button
              type="link"
              icon={<SyncOutlined />}
              onClick={() => handleFetchProfile(editingMember)}
              loading={fetchingProfile === editingMember.id}
            >
              從 LINE 同步資料
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
