import { useEffect, useState } from 'react'
import { Card, Form, Input, Select, Button, message, Divider } from 'antd'
import { settingsApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

export function Settings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await settingsApi.get()
      if (res.success && res.data) {
        form.setFieldsValue(res.data)
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

  const handleSave = async (values: Record<string, string>) => {
    setSaving(true)
    try {
      // 過濾掉被遮蔽的值（含有 ********）
      const filtered = Object.entries(values).reduce(
        (acc, [key, value]) => {
          if (value && !value.includes('********')) {
            acc[key] = value
          }
          return acc
        },
        {} as Record<string, string>
      )

      const res = await settingsApi.update(filtered)
      if (res.success) {
        message.success('儲存成功')
        fetchData()
      } else {
        message.error(res.error?.message || '儲存失敗')
      }
    } catch {
      message.error('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="系統設定" loading={loading}>
      <Form form={form} layout="vertical" onFinish={handleSave} disabled={!hasPermission('setting.edit')}>
        <Divider orientation="left">LINE 設定</Divider>
        <Form.Item name="line.channelSecret" label="Channel Secret">
          <Input.Password placeholder="留空則不更新" />
        </Form.Item>
        <Form.Item name="line.channelAccessToken" label="Channel Access Token">
          <Input.Password placeholder="留空則不更新" />
        </Form.Item>

        <Divider orientation="left">AI 設定</Divider>
        <Form.Item name="ai.provider" label="AI Provider">
          <Select
            options={[
              { value: 'claude', label: 'Claude' },
              { value: 'gemini', label: 'Gemini' },
              { value: 'ollama', label: 'Ollama' },
            ]}
          />
        </Form.Item>

        <Form.Item name="ai.claude.apiKey" label="Claude API Key">
          <Input.Password placeholder="留空則不更新" />
        </Form.Item>
        <Form.Item name="ai.claude.model" label="Claude Model">
          <Input />
        </Form.Item>

        <Form.Item name="ai.gemini.apiKey" label="Gemini API Key">
          <Input.Password placeholder="留空則不更新" />
        </Form.Item>
        <Form.Item name="ai.gemini.model" label="Gemini Model">
          <Input />
        </Form.Item>

        <Form.Item name="ai.ollama.baseUrl" label="Ollama Base URL">
          <Input />
        </Form.Item>
        <Form.Item name="ai.ollama.model" label="Ollama Model">
          <Input />
        </Form.Item>

        <Divider orientation="left">問題追蹤設定</Divider>
        <Form.Item name="issue.timeoutMinutes" label="超時時間（分鐘）">
          <Input type="number" />
        </Form.Item>
        <Form.Item name="issue.replyThreshold" label="回覆相關性閾值">
          <Input type="number" />
        </Form.Item>

        {hasPermission('setting.edit') && (
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              儲存設定
            </Button>
          </Form.Item>
        )}
      </Form>
    </Card>
  )
}
