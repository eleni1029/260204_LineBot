import { useEffect, useState } from 'react'
import { Table, Input, DatePicker, Space, Button, Tag } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { messagesApi, type Channel } from '@/services/api'
import { ChannelTag } from '@/components/ChannelTag'

const { RangePicker } = DatePicker

interface Message {
  id: number
  content: string | null
  messageType: string
  group: { id: number; displayName: string; channel: Channel; customer: { name: string } | null }
  member: { id: number; displayName: string; channel: Channel }
  createdAt: string
}

export function MessageList() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const params: any = { page, pageSize: 50 }
      if (search) params.search = search
      if (dateRange) {
        params.startDate = dateRange[0].toISOString()
        params.endDate = dateRange[1].toISOString()
      }
      const res = await messagesApi.list(params)
      if (res.success && res.data) {
        setMessages(res.data as Message[])
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

  const typeColors: Record<string, string> = {
    TEXT: 'blue',
    IMAGE: 'green',
    VIDEO: 'purple',
    AUDIO: 'orange',
    FILE: 'cyan',
    STICKER: 'pink',
    LOCATION: 'gold',
  }

  const columns: ColumnsType<Message> = [
    {
      title: '渠道',
      dataIndex: ['group', 'channel'],
      key: 'channel',
      width: 80,
      render: (channel) => <ChannelTag channel={channel || 'LINE'} />,
    },
    {
      title: '內容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (content) => content || '(非文字訊息)',
    },
    {
      title: '類型',
      dataIndex: 'messageType',
      key: 'messageType',
      width: 100,
      render: (type) => <Tag color={typeColors[type] || 'default'}>{type}</Tag>,
    },
    {
      title: '發送者',
      dataIndex: 'member',
      key: 'member',
      render: (member) => member.displayName || '(未知)',
    },
    {
      title: '群聊',
      dataIndex: 'group',
      key: 'group',
      render: (group) => group.displayName || '(未命名)',
    },
    {
      title: '客戶',
      dataIndex: ['group', 'customer', 'name'],
      key: 'customer',
      render: (name) => name || '-',
    },
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t) => new Date(t).toLocaleString(),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜尋訊息內容"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 200 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Button icon={<SearchOutlined />} onClick={handleSearch}>
            搜尋
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={messages}
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
