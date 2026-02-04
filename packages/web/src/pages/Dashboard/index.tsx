import { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Button, message } from 'antd'
import {
  QuestionCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { issuesApi, analysisApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

interface Stats {
  pending: number
  replied: number
  timeout: number
  resolved: number
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await issuesApi.stats()
      if (res.success && res.data) {
        setStats(res.data as Stats)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await analysisApi.run()
      if (res.success) {
        message.success('分析完成')
        fetchStats()
      } else {
        message.error(res.error?.message || '分析失敗')
      }
    } catch {
      message.error('分析失敗')
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>儀表板</h2>
        {hasPermission('analysis.run') && (
          <Button
            type="primary"
            icon={<SyncOutlined spin={analyzing} />}
            onClick={runAnalysis}
            loading={analyzing}
          >
            執行分析
          </Button>
        )}
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="待回覆"
              value={stats?.pending ?? 0}
              prefix={<QuestionCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="已回覆"
              value={stats?.replied ?? 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="已超時"
              value={stats?.timeout ?? 0}
              prefix={<ClockCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic
              title="已解決"
              value={stats?.resolved ?? 0}
              prefix={<WarningOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="系統說明" style={{ marginTop: 24 }}>
        <p>歡迎使用 LINE 群聊監控與客服管理系統。</p>
        <ul>
          <li><strong>客戶管理</strong>：管理客戶資訊並綁定 LINE 群聊</li>
          <li><strong>群聊管理</strong>：查看由 Webhook 自動建立的群聊記錄</li>
          <li><strong>人員管理</strong>：標記群組成員角色（員工/外部人員）</li>
          <li><strong>訊息記錄</strong>：搜尋與查看所有訊息</li>
          <li><strong>問題追蹤</strong>：追蹤客戶問題與回覆狀態</li>
          <li><strong>執行分析</strong>：手動觸發 AI 分析訊息</li>
        </ul>
      </Card>
    </div>
  )
}
