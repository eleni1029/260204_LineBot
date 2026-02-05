import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Select, Space, Switch, message, Button, Modal, Checkbox, Input, Popconfirm, Tooltip } from 'antd'
import { UserOutlined, TeamOutlined, SettingOutlined, DeleteOutlined, EditOutlined, SyncOutlined, SearchOutlined, ShopOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { groupsApi, knowledgeApi, customersApi, type Group } from '@/services/api'
import { ChannelTag } from '@/components/ChannelTag'
import { useAuthStore } from '@/stores/auth'

interface Customer {
  id: number
  name: string
}

// 判斷是否為私聊（1對1）
const isPrivateChat = (lineGroupId: string) => lineGroupId.startsWith('user_')

export function GroupList() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [batchModalVisible, setBatchModalVisible] = useState(false)
  const [batchCategories, setBatchCategories] = useState<string[]>([])
  const [batchAutoReply, setBatchAutoReply] = useState<boolean | undefined>()
  const [batchCustomerId, setBatchCustomerId] = useState<number | null | undefined>(undefined)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [editName, setEditName] = useState('')
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null)
  const [fetchingName, setFetchingName] = useState<number | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerFilter, setCustomerFilter] = useState<number | undefined>()
  const navigate = useNavigate()
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async (page = 1, searchQuery = search) => {
    setLoading(true)
    try {
      const res = await groupsApi.list({ page, pageSize: 20, status, customerId: customerFilter, search: searchQuery || undefined })
      if (res.success && res.data) {
        setGroups(res.data)
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

  const fetchCategories = async () => {
    try {
      const res = await knowledgeApi.categories()
      if (res.success && res.data) {
        setCategories(res.data)
      }
    } catch {
      // ignore
    }
  }

  const fetchCustomers = async () => {
    try {
      const res = await customersApi.list({ pageSize: 1000 })
      if (res.success && res.data) {
        setCustomers(res.data as Customer[])
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchData()
    fetchCategories()
    fetchCustomers()
  }, [status, customerFilter])

  const handleSearch = () => {
    fetchData(1, search)
  }

  const handleUpdateGroup = async (id: number, data: { knowledgeCategories?: string[]; autoReplyEnabled?: boolean; displayName?: string; customerId?: number | null }) => {
    try {
      const res = await groupsApi.update(id, data)
      if (res.success) {
        message.success('更新成功')
        // Update local state with customer info if customerId changed
        if (data.customerId !== undefined) {
          const updatedCustomer = data.customerId ? customers.find(c => c.id === data.customerId) : null
          setGroups(prev => prev.map(g => g.id === id ? {
            ...g,
            ...data,
            customer: updatedCustomer ? { id: updatedCustomer.id, name: updatedCustomer.name } : null,
          } : g))
        } else {
          setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g))
        }
      } else {
        message.error(res.error?.message || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await groupsApi.delete(id)
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
    if (selectedRowKeys.length === 0) return

    try {
      const res = await groupsApi.batchDelete(selectedRowKeys)
      if (res.success) {
        message.success(`成功刪除 ${res.data?.deleted || selectedRowKeys.length} 個群組`)
        setSelectedRowKeys([])
        fetchData(1)
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleFetchName = async (group: Group) => {
    if (isPrivateChat(group.lineGroupId)) {
      message.warning('私聊無法取得群組名稱')
      return
    }

    setFetchingName(group.id)
    try {
      const res = await groupsApi.fetchName(group.id)
      if (res.success && res.data) {
        message.success(`已取得群組名稱: ${res.data.displayName}`)
        setGroups(prev => prev.map(g => g.id === group.id ? { ...g, displayName: res.data!.displayName } : g))
      } else {
        message.error(res.error?.message || '取得名稱失敗')
      }
    } catch {
      message.error('取得名稱失敗')
    } finally {
      setFetchingName(null)
    }
  }

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group)
    setEditName(group.displayName || '')
    setEditCustomerId(group.customerId)
    setEditModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!editingGroup) return

    try {
      const res = await groupsApi.update(editingGroup.id, {
        displayName: editName,
        customerId: editCustomerId,
      })
      if (res.success) {
        message.success('更新成功')
        const updatedCustomer = editCustomerId ? customers.find(c => c.id === editCustomerId) : null
        setGroups(prev => prev.map(g => g.id === editingGroup.id ? {
          ...g,
          displayName: editName,
          customerId: editCustomerId,
          customer: updatedCustomer ? { id: updatedCustomer.id, name: updatedCustomer.name } : null,
        } : g))
        setEditModalVisible(false)
        setEditingGroup(null)
      } else {
        message.error(res.error?.message || '更新失敗')
      }
    } catch {
      message.error('更新失敗')
    }
  }

  const handleBatchUpdate = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇群組')
      return
    }

    try {
      const data: { groupIds: number[]; knowledgeCategories?: string[]; autoReplyEnabled?: boolean; customerId?: number | null } = {
        groupIds: selectedRowKeys,
      }
      if (batchCategories.length > 0 || batchCategories.length === 0) {
        data.knowledgeCategories = batchCategories
      }
      if (batchAutoReply !== undefined) {
        data.autoReplyEnabled = batchAutoReply
      }
      if (batchCustomerId !== undefined) {
        data.customerId = batchCustomerId
      }

      const res = await groupsApi.batchUpdateCategories(data)
      if (res.success) {
        message.success(`已更新 ${res.data?.updated || 0} 個群組`)
        setBatchModalVisible(false)
        setSelectedRowKeys([])
        fetchData(pagination.current)
      } else {
        message.error(res.error?.message || '批量更新失敗')
      }
    } catch {
      message.error('批量更新失敗')
    }
  }

  const columns: ColumnsType<Group> = [
    {
      title: '渠道',
      dataIndex: 'channel',
      key: 'channel',
      width: 80,
      render: (channel) => <ChannelTag channel={channel || 'LINE'} />,
    },
    {
      title: '類型',
      dataIndex: 'lineGroupId',
      key: 'type',
      width: 80,
      render: (lineGroupId) =>
        isPrivateChat(lineGroupId) ? (
          <Tag icon={<UserOutlined />} color="blue">私聊</Tag>
        ) : (
          <Tag icon={<TeamOutlined />} color="green">群組</Tag>
        ),
    },
    {
      title: '名稱',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name, record) => (
        <Space>
          <a onClick={() => navigate(`/groups/${record.id}`)}>
            {name || (isPrivateChat(record.lineGroupId) ? '私聊對話' : `(${record.lineGroupId.substring(0, 10)}...)`)}
          </a>
          {hasPermission('group.edit') && (
            <>
              <Tooltip title="編輯">
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditGroup(record)} />
              </Tooltip>
              {!isPrivateChat(record.lineGroupId) && record.channel === 'LINE' && (
                <Tooltip title="從 LINE 取得名稱">
                  <Button
                    type="link"
                    size="small"
                    icon={<SyncOutlined spin={fetchingName === record.id} />}
                    onClick={() => handleFetchName(record)}
                    loading={fetchingName === record.id}
                  />
                </Tooltip>
              )}
            </>
          )}
        </Space>
      ),
    },
    {
      title: 'ID',
      dataIndex: 'lineGroupId',
      key: 'lineGroupId',
      width: 150,
      ellipsis: true,
      render: (id) => <span style={{ fontSize: 12, color: '#888' }}>{id}</span>,
    },
    {
      title: '知識庫分類',
      dataIndex: 'knowledgeCategories',
      key: 'knowledgeCategories',
      width: 180,
      render: (cats: string[], record) => (
        <Select
          mode="multiple"
          value={cats || []}
          onChange={(value) => handleUpdateGroup(record.id, { knowledgeCategories: value })}
          placeholder="全部分類"
          style={{ width: '100%' }}
          allowClear
          maxTagCount={1}
          options={categories.map(c => ({ value: c.name, label: c.name }))}
          disabled={!hasPermission('group.edit')}
        />
      ),
    },
    {
      title: '自動回覆',
      dataIndex: 'autoReplyEnabled',
      key: 'autoReplyEnabled',
      width: 90,
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleUpdateGroup(record.id, { autoReplyEnabled: checked })}
          checkedChildren="開"
          unCheckedChildren="關"
          disabled={!hasPermission('group.edit')}
        />
      ),
    },
    {
      title: '綁定客戶',
      dataIndex: 'customerId',
      key: 'customer',
      width: 150,
      render: (customerId, record) => (
        <Select
          value={customerId}
          onChange={(value) => handleUpdateGroup(record.id, { customerId: value || null })}
          placeholder="選擇客戶"
          style={{ width: '100%' }}
          allowClear
          showSearch
          optionFilterProp="label"
          options={customers.map(c => ({ value: c.id, label: c.name }))}
          disabled={!hasPermission('group.edit')}
        />
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      render: (s) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag>,
    },
    {
      title: '訊息',
      dataIndex: '_count',
      key: 'messages',
      width: 60,
      render: (count) => count.messages,
    },
  ]

  // 添加操作列
  if (hasPermission('group.edit')) {
    columns.push({
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="確定要刪除此群組嗎？"
          description="這將同時刪除該群組的所有訊息記錄"
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

  const rowSelection = hasPermission('group.edit')
    ? {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
      }
    : undefined

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            value={status}
            onChange={setStatus}
            allowClear
            placeholder="狀態"
            style={{ width: 100 }}
            options={[
              { value: 'ACTIVE', label: '活躍' },
              { value: 'ARCHIVED', label: '歸檔' },
            ]}
          />
          <Select
            value={customerFilter}
            onChange={setCustomerFilter}
            allowClear
            placeholder="客戶"
            style={{ width: 150 }}
            showSearch
            optionFilterProp="label"
            options={customers.map(c => ({ value: c.id, label: c.name }))}
          />
        </Space>

        <Space>
          {hasPermission('group.edit') && selectedRowKeys.length > 0 && (
            <>
              <Button
                icon={<SettingOutlined />}
                onClick={() => {
                  setBatchCategories([])
                  setBatchAutoReply(undefined)
                  setBatchCustomerId(undefined)
                  setBatchModalVisible(true)
                }}
              >
                批量設定 ({selectedRowKeys.length})
              </Button>
              <Popconfirm
                title={`確定要刪除選中的 ${selectedRowKeys.length} 個群組嗎？`}
                description="這將同時刪除這些群組的所有訊息記錄"
                onConfirm={handleBatchDelete}
                okText="確定刪除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  批量刪除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          ...pagination,
          onChange: (page) => fetchData(page),
        }}
      />

      {/* 批量設定 Modal */}
      <Modal
        title="批量設定"
        open={batchModalVisible}
        onOk={handleBatchUpdate}
        onCancel={() => setBatchModalVisible(false)}
        okText="確認更新"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}><ShopOutlined /> 綁定客戶：</div>
          <Select
            value={batchCustomerId}
            onChange={(value) => setBatchCustomerId(value === undefined ? undefined : value)}
            placeholder="不修改"
            style={{ width: '100%' }}
            allowClear
            showSearch
            optionFilterProp="label"
            options={[
              { value: null, label: '清除綁定' },
              ...customers.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            不選擇 = 不修改，選擇「清除綁定」= 解除客戶關聯
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>知識庫分類：</div>
          <Select
            mode="multiple"
            value={batchCategories}
            onChange={setBatchCategories}
            placeholder="留空表示使用全部分類"
            style={{ width: '100%' }}
            allowClear
            options={categories.map(c => ({ value: c.name, label: `${c.name} (${c.count})` }))}
          />
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            不選擇任何分類 = 使用全部知識庫
          </div>
        </div>

        <div>
          <Checkbox
            checked={batchAutoReply === true}
            indeterminate={batchAutoReply === undefined}
            onChange={() => {
              if (batchAutoReply === undefined) {
                setBatchAutoReply(true)
              } else if (batchAutoReply === true) {
                setBatchAutoReply(false)
              } else {
                setBatchAutoReply(undefined)
              }
            }}
          >
            自動回覆 {batchAutoReply === undefined ? '(不修改)' : batchAutoReply ? '(開啟)' : '(關閉)'}
          </Checkbox>
        </div>
      </Modal>

      {/* 編輯群組 Modal */}
      <Modal
        title="編輯群組"
        open={editModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingGroup(null)
        }}
        okText="儲存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>群組名稱：</div>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="輸入群組名稱"
          />
          {editingGroup && !isPrivateChat(editingGroup.lineGroupId) && (
            <div style={{ marginTop: 8 }}>
              <Button
                type="link"
                icon={<SyncOutlined />}
                onClick={() => handleFetchName(editingGroup)}
                loading={fetchingName === editingGroup.id}
              >
                從 LINE 取得名稱
              </Button>
            </div>
          )}
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>綁定客戶：</div>
          <Select
            value={editCustomerId}
            onChange={setEditCustomerId}
            placeholder="選擇客戶"
            style={{ width: '100%' }}
            allowClear
            showSearch
            optionFilterProp="label"
            options={customers.map(c => ({ value: c.id, label: c.name }))}
          />
        </div>
      </Modal>
    </div>
  )
}
