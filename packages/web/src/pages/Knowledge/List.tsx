import { useEffect, useState } from 'react'
import {
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Upload,
  Switch,
  Tabs,
  Tooltip,
  List,
  Typography,
  Progress,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  UploadOutlined,
  SyncOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  InboxOutlined,
  ImportOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { UploadProps } from 'antd'
import {
  knowledgeApi,
  settingsApi,
  KnowledgeEntry,
  KnowledgeStats,
  AutoReplyLog,
  KnowledgeFile,
  FileUploadResult,
  KnowledgeSource,
  ChannelStatus,
} from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const { Dragger } = Upload
const { Text, Paragraph } = Typography

// 根據文件類型返回圖標
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return <FilePdfOutlined style={{ color: '#ff4d4f' }} />
    case 'docx':
    case 'doc':
      return <FileWordOutlined style={{ color: '#1890ff' }} />
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileExcelOutlined style={{ color: '#52c41a' }} />
    case 'md':
      return <FileMarkdownOutlined style={{ color: '#722ed1' }} />
    default:
      return <FileTextOutlined />
  }
}

export function KnowledgeList() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [filters, setFilters] = useState<{
    category?: string
    isActive?: string
    isSyncedToAI?: string
    search?: string
    source?: string
  }>({})

  // 飛書同步相關狀態
  const [feishuStatus, setFeishuStatus] = useState<ChannelStatus | null>(null)
  const [feishuSyncing, setFeishuSyncing] = useState(false)
  const [feishuSyncResult, setFeishuSyncResult] = useState<{
    created: number
    updated: number
    errors: string[]
  } | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importData, setImportData] = useState<
    { question: string; answer: string; category?: string }[]
  >([])
  const [importing, setImporting] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [batchDeleting, setBatchDeleting] = useState(false)

  const [autoReplyLogs, setAutoReplyLogs] = useState<AutoReplyLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPagination, setLogsPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [logsFilter, setLogsFilter] = useState<string | undefined>()

  // 文件相關狀態
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<FileUploadResult | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{
    total: number
    completed: number
    failed: number
    uploading: boolean
  }>({ total: 0, completed: 0, failed: 0, uploading: false })
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<{
    filename: string
    content: string
    entries: Array<{ question: string; answer: string }>
  } | null>(null)
  const [importingFile, setImportingFile] = useState<string | null>(null)
  const [importCategory, setImportCategory] = useState<string>('')
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchImportModalOpen, setBatchImportModalOpen] = useState(false)
  const [batchImportCategory, setBatchImportCategory] = useState<string>('')
  const [clearingFiles, setClearingFiles] = useState(false)

  const hasPermission = useAuthStore((state) => state.hasPermission)

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const res = await knowledgeApi.list({ page, pageSize: 20, ...filters })
      if (res.success && res.data) {
        setEntries(res.data)
        if (res.pagination) {
          setPagination({
            current: res.pagination.page,
            pageSize: res.pagination.pageSize,
            total: res.pagination.total,
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await knowledgeApi.stats()
      if (res.success && res.data) {
        setStats(res.data)
      }
    } catch {
      // ignore
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

  const fetchAutoReplyLogs = async (page = 1) => {
    setLogsLoading(true)
    try {
      const res = await knowledgeApi.autoReplyLogs({
        page,
        pageSize: 20,
        matched: logsFilter,
      })
      if (res.success && res.data) {
        setAutoReplyLogs(res.data)
        if (res.pagination) {
          setLogsPagination({
            current: res.pagination.page,
            pageSize: res.pagination.pageSize,
            total: res.pagination.total,
          })
        }
      }
    } finally {
      setLogsLoading(false)
    }
  }

  const fetchFiles = async () => {
    setFilesLoading(true)
    try {
      const res = await knowledgeApi.listFiles()
      if (res.success && res.data) {
        setFiles(res.data)
      }
    } finally {
      setFilesLoading(false)
    }
  }

  const fetchFeishuStatus = async () => {
    try {
      const res = await settingsApi.checkFeishuStatus()
      if (res.data) {
        setFeishuStatus(res.data)
      }
    } catch {
      // ignore
    }
  }

  const handleFeishuSync = async () => {
    setFeishuSyncing(true)
    setFeishuSyncResult(null)
    try {
      const res = await knowledgeApi.syncFromFeishu()
      if (res.success && res.data) {
        setFeishuSyncResult(res.data)
        if (res.data.errors.length === 0) {
          message.success(`飛書同步完成：新增 ${res.data.created} 條，更新 ${res.data.updated} 條`)
        } else {
          message.warning(`同步完成，但有 ${res.data.errors.length} 個錯誤`)
        }
        fetchData()
        fetchStats()
        fetchCategories()
      } else {
        message.error(res.error?.message || '同步失敗')
      }
    } catch {
      message.error('同步失敗')
    } finally {
      setFeishuSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchStats()
    fetchCategories()
    fetchFeishuStatus()
  }, [filters])

  useEffect(() => {
    fetchAutoReplyLogs()
  }, [logsFilter])

  const handleCreate = () => {
    setEditingEntry(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry)
    form.setFieldsValue({
      ...entry,
      keywords: entry.keywords.join(', '),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const data = {
        ...values,
        keywords: values.keywords
          ? values.keywords
              .split(',')
              .map((k: string) => k.trim())
              .filter(Boolean)
          : [],
      }

      if (editingEntry) {
        const res = await knowledgeApi.update(editingEntry.id, data)
        if (res.success) {
          message.success('更新成功')
          setModalOpen(false)
          fetchData(pagination.current)
          fetchStats()
        } else {
          message.error(res.error?.message || '更新失敗')
        }
      } else {
        const res = await knowledgeApi.create(data)
        if (res.success) {
          message.success('新增成功')
          setModalOpen(false)
          fetchData()
          fetchStats()
          fetchCategories()
        } else {
          message.error(res.error?.message || '新增失敗')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await knowledgeApi.delete(id)
      if (res.success) {
        message.success('刪除成功')
        fetchData(pagination.current)
        fetchStats()
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleToggleActive = async (entry: KnowledgeEntry) => {
    try {
      const res = await knowledgeApi.update(entry.id, { isActive: !entry.isActive })
      if (res.success) {
        message.success(entry.isActive ? '已停用' : '已啟用')
        fetchData(pagination.current)
        fetchStats()
      }
    } catch {
      message.error('操作失敗')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const ids = selectedRowKeys.length > 0 ? selectedRowKeys : undefined
      const res = await knowledgeApi.sync(ids)
      if (res.success && res.data) {
        message.success(`同步完成：${res.data.synced} 筆成功，${res.data.failed} 筆失敗`)
        fetchData(pagination.current)
        fetchStats()
        setSelectedRowKeys([])
      } else {
        message.error('同步失敗')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇要刪除的條目')
      return
    }

    setBatchDeleting(true)
    try {
      const res = await knowledgeApi.batchDelete(selectedRowKeys)
      if (res.success && res.data) {
        message.success(`已刪除 ${res.data.deleted} 筆條目`)
        fetchData(pagination.current)
        fetchStats()
        fetchCategories()
        setSelectedRowKeys([])
      } else {
        message.error(res.error?.message || '刪除失敗')
      }
    } catch {
      message.error('刪除失敗')
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleImport = async () => {
    if (importData.length === 0) {
      message.warning('請先上傳檔案')
      return
    }

    setImporting(true)
    try {
      const res = await knowledgeApi.import(importData)
      if (res.success && res.data) {
        message.success(`匯入完成：${res.data.created} 筆新增，${res.data.updated} 筆更新`)
        if (res.data.errors.length > 0) {
          message.warning(`有 ${res.data.errors.length} 筆錯誤`)
        }
        setImportModalOpen(false)
        setImportData([])
        fetchData()
        fetchStats()
        fetchCategories()
      } else {
        message.error('匯入失敗')
      }
    } finally {
      setImporting(false)
    }
  }

  // 支援的文件擴展名
  const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf', '.docx', '.xlsx', '.xls', '.csv']

  // 檢查文件是否支援
  const isFileSupported = (filename: string): boolean => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    return SUPPORTED_EXTENSIONS.includes(ext)
  }

  // 從 FileSystemEntry 遞歸讀取所有文件
  const readEntriesRecursively = async (entry: FileSystemEntry): Promise<File[]> => {
    const files: File[] = []

    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      if (isFileSupported(file.name)) {
        files.push(file)
      }
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry
      const reader = dirEntry.createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject)
      })
      for (const childEntry of entries) {
        const childFiles = await readEntriesRecursively(childEntry)
        files.push(...childFiles)
      }
    }

    return files
  }

  // 批量上傳文件
  const uploadFiles = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) {
      message.warning('沒有找到支援的文件')
      return
    }

    setUploadProgress({ total: filesToUpload.length, completed: 0, failed: 0, uploading: true })

    let completed = 0
    let failed = 0
    let lastResult: FileUploadResult | null = null

    for (const file of filesToUpload) {
      try {
        const res = await knowledgeApi.uploadFile(file)
        if (res.success && res.data) {
          completed++
          lastResult = res.data
        } else {
          failed++
          console.error(`Upload failed for ${file.name}:`, res.error?.message)
        }
      } catch (err) {
        failed++
        console.error(`Upload error for ${file.name}:`, err)
      }
      setUploadProgress((prev) => ({ ...prev, completed, failed }))
    }

    setUploadProgress((prev) => ({ ...prev, uploading: false }))

    if (completed > 0) {
      message.success(`上傳完成：${completed} 個文件成功${failed > 0 ? `，${failed} 個失敗` : ''}`)
      fetchFiles()
      if (lastResult) {
        setUploadResult(lastResult)
      }
    } else {
      message.error('所有文件上傳失敗')
    }
  }

  // 文件上傳處理
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    accept: '.md,.txt,.pdf,.docx,.xlsx,.xls,.csv',
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const uploadFile = file as File
        console.log('Uploading file:', uploadFile.name, uploadFile.type, uploadFile.size)
        const res = await knowledgeApi.uploadFile(uploadFile)
        console.log('Upload response:', res)
        if (res.success && res.data) {
          setUploadResult(res.data)
          message.success(`${res.data.originalName} 上傳成功，解析出 ${res.data.entriesFound} 條知識`)
          fetchFiles()
          onSuccess?.(res.data)
        } else {
          const errorMsg = res.error?.message || '上傳失敗（未知錯誤）'
          console.error('Upload failed:', errorMsg)
          message.error(errorMsg)
          onError?.(new Error(errorMsg))
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '上傳失敗'
        console.error('Upload error:', err)
        message.error(errorMsg)
        onError?.(err as Error)
      }
    },
    showUploadList: false,
  }

  // 處理拖放事件（支援文件夾）
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const items = e.dataTransfer.items
    const filesToUpload: File[] = []

    // 收集所有文件
    const promises: Promise<File[]>[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        promises.push(readEntriesRecursively(entry))
      } else if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && isFileSupported(file.name)) {
          filesToUpload.push(file)
        }
      }
    }

    // 等待所有目錄讀取完成
    const results = await Promise.all(promises)
    for (const files of results) {
      filesToUpload.push(...files)
    }

    // 上傳所有文件
    await uploadFiles(filesToUpload)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // JSON/CSV 導入（原有功能）
  const jsonUploadProps: UploadProps = {
    accept: '.json,.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string
          if (file.name.endsWith('.json')) {
            const data = JSON.parse(content)
            if (Array.isArray(data)) {
              setImportData(data)
              message.success(`已載入 ${data.length} 筆資料`)
            } else {
              message.error('JSON 格式錯誤，請提供陣列格式')
            }
          } else if (file.name.endsWith('.csv')) {
            const lines = content.split('\n').filter((line) => line.trim())
            const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
            const data = lines
              .slice(1)
              .map((line) => {
                const values = line.split(',')
                const obj: Record<string, string> = {}
                headers.forEach((h, i) => {
                  obj[h] = values[i]?.trim() || ''
                })
                return {
                  question: obj.question || obj['問題'] || '',
                  answer: obj.answer || obj['答案'] || '',
                  category: obj.category || obj['分類'] || undefined,
                }
              })
              .filter((d) => d.question && d.answer)
            setImportData(data)
            message.success(`已載入 ${data.length} 筆資料`)
          }
        } catch {
          message.error('檔案解析失敗')
        }
      }
      reader.readAsText(file)
      return false
    },
  }

  // 預覽文件內容
  const handlePreviewFile = async (filename: string) => {
    try {
      const res = await knowledgeApi.getFileContent(filename)
      if (res.success && res.data) {
        setPreviewContent(res.data)
        setPreviewModalOpen(true)
      } else {
        message.error(res.error?.message || '讀取失敗')
      }
    } catch {
      message.error('讀取失敗')
    }
  }

  // 刪除文件
  const handleDeleteFile = async (filename: string) => {
    try {
      console.log('Deleting file:', filename)
      const res = await knowledgeApi.deleteFile(filename)
      console.log('Delete response:', res)
      if (res.success) {
        message.success('刪除成功')
        fetchFiles()
      } else {
        const errorMsg = res.error?.message || '刪除失敗（未知錯誤）'
        console.error('Delete failed:', errorMsg)
        message.error(errorMsg)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '刪除失敗'
      console.error('Delete error:', err)
      message.error(errorMsg)
    }
  }

  // 從文件導入到數據庫
  const handleImportFromFile = async (filename: string) => {
    setImportingFile(filename)
    try {
      const res = await knowledgeApi.importFromFile(filename, importCategory || undefined)
      if (res.success && res.data) {
        message.success(
          `導入完成：${res.data.created} 筆新增，${res.data.updated} 筆更新（共 ${res.data.total} 條）`
        )
        fetchData()
        fetchStats()
        fetchCategories()
        setImportCategory('')
      } else {
        message.error(res.error?.message || '導入失敗')
      }
    } finally {
      setImportingFile(null)
    }
  }

  // 批量導入所有文件
  const handleBatchImportFromFiles = async () => {
    if (files.length === 0) {
      message.warning('沒有可導入的文件')
      return
    }

    setBatchImporting(true)
    setBatchImportModalOpen(false)
    try {
      const res = await knowledgeApi.batchImportFromFiles(
        undefined, // 不指定文件名，導入所有
        batchImportCategory || undefined
      )
      if (res.success && res.data) {
        message.success(
          `批量導入完成：${res.data.created} 筆新增，${res.data.updated} 筆更新（共 ${res.data.total} 條，${res.data.filesProcessed} 個文件）`
        )
        if (res.data.errors.length > 0) {
          message.warning(`有 ${res.data.errors.length} 個錯誤`)
          console.warn('Import errors:', res.data.errors)
        }
        fetchData()
        fetchStats()
        fetchCategories()
        setBatchImportCategory('')
      } else {
        message.error(res.error?.message || '導入失敗')
      }
    } catch {
      message.error('導入失敗')
    } finally {
      setBatchImporting(false)
    }
  }

  // 清空所有文件
  const handleClearAllFiles = async () => {
    if (files.length === 0) {
      message.warning('沒有可清空的文件')
      return
    }

    setClearingFiles(true)
    try {
      const res = await knowledgeApi.clearAllFiles()
      if (res.success && res.data) {
        message.success(`已清空 ${res.data.deleted} 個文件`)
        if (res.data.errors.length > 0) {
          message.warning(`有 ${res.data.errors.length} 個文件刪除失敗`)
          console.warn('Clear errors:', res.data.errors)
        }
        fetchFiles()
        setUploadResult(null)
      } else {
        message.error(res.error?.message || '清空失敗')
      }
    } catch {
      message.error('清空失敗')
    } finally {
      setClearingFiles(false)
    }
  }

  const columns: ColumnsType<KnowledgeEntry> = [
    {
      title: '問題',
      dataIndex: 'question',
      key: 'question',
      width: 300,
      ellipsis: true,
    },
    {
      title: '答案',
      dataIndex: 'answer',
      key: 'answer',
      ellipsis: true,
    },
    {
      title: '分類',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category) => category || '-',
    },
    {
      title: '來源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (source: KnowledgeSource) => {
        const sourceConfig: Record<KnowledgeSource, { color: string; label: string }> = {
          MANUAL: { color: 'blue', label: '手動新增' },
          FILE_IMPORT: { color: 'green', label: '檔案匯入' },
          FEISHU_SYNC: { color: 'purple', label: '飛書同步' },
        }
        const config = sourceConfig[source] || sourceConfig.MANUAL
        return <Tag color={config.color}>{config.label}</Tag>
      },
    },
    {
      title: '狀態',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>{isActive ? '啟用' : '停用'}</Tag>
      ),
    },
    {
      title: '已同步',
      dataIndex: 'isSyncedToAI',
      key: 'isSyncedToAI',
      width: 80,
      render: (synced) =>
        synced ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <CloseCircleOutlined style={{ color: '#faad14' }} />
        ),
    },
    {
      title: '使用次數',
      dataIndex: 'usageCount',
      key: 'usageCount',
      width: 90,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space>
          <Tooltip title={record.isActive ? '停用' : '啟用'}>
            <Switch
              size="small"
              checked={record.isActive}
              onChange={() => handleToggleActive(record)}
              disabled={!hasPermission('knowledge.edit')}
            />
          </Tooltip>
          {hasPermission('knowledge.edit') && (
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          )}
          {hasPermission('knowledge.delete') && (
            <Popconfirm title="確定要刪除嗎？" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const logColumns: ColumnsType<AutoReplyLog> = [
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (time) => new Date(time).toLocaleString('zh-TW'),
    },
    {
      title: '問題',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
    },
    {
      title: '回覆',
      dataIndex: 'answer',
      key: 'answer',
      ellipsis: true,
      render: (answer) => answer || '-',
    },
    {
      title: '匹配',
      dataIndex: 'matched',
      key: 'matched',
      width: 80,
      render: (matched) =>
        matched ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>
            匹配
          </Tag>
        ) : (
          <Tag color="orange" icon={<QuestionCircleOutlined />}>
            未匹配
          </Tag>
        ),
    },
    {
      title: '信心度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 80,
      render: (confidence) => (confidence ? `${confidence}%` : '-'),
    },
  ]

  return (
    <div>
      {/* 向量化狀態提示 */}
      {stats && stats.embedding && stats.embedding.notEmbedded > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              有 <strong>{stats.embedding.notEmbedded}</strong> 條知識尚未向量化，無法使用語義搜索
            </span>
          }
          description={
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={stats.embedding.percentage}
                status={stats.embedding.percentage === 100 ? 'success' : 'active'}
                format={() => `${stats.embedding.embedded}/${stats.embedding.total}`}
                style={{ maxWidth: 300 }}
              />
              <div style={{ marginTop: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  icon={<SyncOutlined />}
                  onClick={handleSync}
                  loading={syncing}
                >
                  立即同步向量化
                </Button>
                <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>
                  點擊後將為所有未向量化的知識條目生成 embedding
                </span>
              </div>
            </div>
          }
        />
      )}
      {stats && stats.embedding && stats.embedding.percentage === 100 && stats.embedding.total > 0 && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 16 }}
          message={`所有 ${stats.embedding.total} 條知識已完成向量化，語義搜索已啟用`}
        />
      )}

      {/* 統計卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="知識總數" value={stats.total} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已啟用" value={stats.active} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Tooltip title="向量化進度：語義搜索需要向量化">
                <div>
                  <Statistic
                    title="已向量化"
                    value={stats.embedding?.embedded || 0}
                    suffix={`/ ${stats.embedding?.total || 0}`}
                    valueStyle={{ color: stats.embedding?.percentage === 100 ? '#3f8600' : '#faad14' }}
                  />
                </div>
              </Tooltip>
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="今日回覆" value={stats.autoReply.today} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="匹配率" value={stats.autoReply.matchRate} suffix="%" />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="總使用次數" value={stats.totalUsage} />
            </Card>
          </Col>
        </Row>
      )}

      <Tabs
        defaultActiveKey="knowledge"
        onChange={(key) => {
          if (key === 'files') {
            fetchFiles()
          }
        }}
        items={[
          {
            key: 'knowledge',
            label: '知識庫',
            children: (
              <>
                {/* 篩選與操作 */}
                <div
                  style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}
                >
                  <Space>
                    <Input.Search
                      placeholder="搜尋問題或答案"
                      allowClear
                      onSearch={(value) => setFilters({ ...filters, search: value || undefined })}
                      style={{ width: 200 }}
                    />
                    <Select
                      placeholder="分類"
                      allowClear
                      style={{ width: 120 }}
                      onChange={(value) => setFilters({ ...filters, category: value })}
                      options={categories.map((c) => ({
                        value: c.name,
                        label: `${c.name} (${c.count})`,
                      }))}
                    />
                    <Select
                      placeholder="狀態"
                      allowClear
                      style={{ width: 100 }}
                      onChange={(value) => setFilters({ ...filters, isActive: value })}
                      options={[
                        { value: 'true', label: '啟用' },
                        { value: 'false', label: '停用' },
                      ]}
                    />
                    <Select
                      placeholder="同步狀態"
                      allowClear
                      style={{ width: 120 }}
                      onChange={(value) => setFilters({ ...filters, isSyncedToAI: value })}
                      options={[
                        { value: 'true', label: '已同步' },
                        { value: 'false', label: '未同步' },
                      ]}
                    />
                    <Select
                      placeholder="來源"
                      allowClear
                      style={{ width: 120 }}
                      onChange={(value) => setFilters({ ...filters, source: value })}
                      options={[
                        { value: 'MANUAL', label: '手動新增' },
                        { value: 'FILE_IMPORT', label: '檔案匯入' },
                        { value: 'FEISHU_SYNC', label: '飛書同步' },
                      ]}
                    />
                  </Space>
                  <Space>
                    {hasPermission('knowledge.delete') && selectedRowKeys.length > 0 && (
                      <Popconfirm
                        title={`確定要刪除選中的 ${selectedRowKeys.length} 筆條目嗎？`}
                        onConfirm={handleBatchDelete}
                        okText="確定刪除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          loading={batchDeleting}
                        >
                          刪除選中 ({selectedRowKeys.length})
                        </Button>
                      </Popconfirm>
                    )}
                    {hasPermission('knowledge.edit') && (
                      <Tooltip title={stats?.embedding?.notEmbedded ? `${stats.embedding.notEmbedded} 條待向量化` : '所有條目已向量化'}>
                        <Button
                          icon={<SyncOutlined />}
                          onClick={handleSync}
                          loading={syncing}
                          type={stats?.embedding?.notEmbedded ? 'primary' : 'default'}
                        >
                          {selectedRowKeys.length > 0
                            ? `同步選中 (${selectedRowKeys.length})`
                            : stats?.embedding?.notEmbedded
                              ? `同步向量化 (${stats.embedding.notEmbedded})`
                              : '同步全部'}
                        </Button>
                      </Tooltip>
                    )}
                    {hasPermission('knowledge.create') && (
                      <>
                        <Tooltip title={feishuStatus?.connected ? '從飛書知識庫同步' : '請先在系統設定中配置飛書'}>
                          <Button
                            icon={<CloudDownloadOutlined />}
                            onClick={handleFeishuSync}
                            loading={feishuSyncing}
                            disabled={!feishuStatus?.connected}
                          >
                            飛書同步
                            {feishuSyncResult && !feishuSyncing && (
                              <Tag color={feishuSyncResult.errors.length > 0 ? 'warning' : 'success'} style={{ marginLeft: 8 }}>
                                +{feishuSyncResult.created} / ~{feishuSyncResult.updated}
                              </Tag>
                            )}
                          </Button>
                        </Tooltip>
                        <Button
                          icon={<UploadOutlined />}
                          onClick={() => setImportModalOpen(true)}
                        >
                          JSON/CSV 匯入
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                          新增
                        </Button>
                      </>
                    )}
                  </Space>
                </div>

                <Table
                  columns={columns}
                  dataSource={entries}
                  rowKey="id"
                  loading={loading}
                  rowSelection={
                    hasPermission('knowledge.edit')
                      ? {
                          selectedRowKeys,
                          onChange: (keys) => setSelectedRowKeys(keys as number[]),
                        }
                      : undefined
                  }
                  pagination={{
                    ...pagination,
                    onChange: (page) => fetchData(page),
                  }}
                />
              </>
            ),
          },
          {
            key: 'files',
            label: '文件管理',
            children: (
              <>
                {/* 文件上傳區域 */}
                {hasPermission('knowledge.create') && (
                  <Card title="上傳文件" style={{ marginBottom: 16 }}>
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      style={{ marginBottom: 16 }}
                    >
                      <Dragger
                        {...uploadProps}
                        openFileDialogOnClick={!uploadProgress.uploading}
                        disabled={uploadProgress.uploading}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">
                          點擊或拖拽文件/文件夾到此區域上傳
                        </p>
                        <p className="ant-upload-hint">
                          <FolderOpenOutlined /> 支援拖拽整個文件夾，自動讀取符合條件的文件
                        </p>
                        <p className="ant-upload-hint">
                          支援格式：Markdown (.md)、純文字 (.txt)、PDF (.pdf)、Word (.docx)、Excel
                          (.xlsx, .xls, .csv)
                        </p>
                      </Dragger>
                    </div>

                    {/* 上傳進度 */}
                    {uploadProgress.uploading && (
                      <Card size="small" title="上傳進度" style={{ marginBottom: 16 }}>
                        <Progress
                          percent={Math.round(
                            ((uploadProgress.completed + uploadProgress.failed) /
                              uploadProgress.total) *
                              100
                          )}
                          status={uploadProgress.failed > 0 ? 'exception' : 'active'}
                        />
                        <Text>
                          已完成 {uploadProgress.completed} / {uploadProgress.total}
                          {uploadProgress.failed > 0 && (
                            <Text type="danger">（{uploadProgress.failed} 個失敗）</Text>
                          )}
                        </Text>
                      </Card>
                    )}

                    {uploadResult && !uploadProgress.uploading && (
                      <Card size="small" title={`上傳結果：${uploadResult.originalName}`}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Text>
                            解析出 <Text strong>{uploadResult.entriesFound}</Text> 條知識條目
                          </Text>
                          <Text type="secondary">預覽：</Text>
                          <Paragraph
                            ellipsis={{ rows: 3 }}
                            style={{
                              background: '#f5f5f5',
                              padding: 8,
                              borderRadius: 4,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {uploadResult.preview}
                          </Paragraph>
                        </Space>
                      </Card>
                    )}
                  </Card>
                )}

                {/* 已上傳文件列表 */}
                <Card
                  title="已上傳文件"
                  loading={filesLoading}
                  extra={
                    files.length > 0 && (
                      <Space>
                        {hasPermission('knowledge.create') && (
                          <Button
                            type="primary"
                            icon={<ImportOutlined />}
                            onClick={() => setBatchImportModalOpen(true)}
                            loading={batchImporting}
                          >
                            全部導入 ({files.length})
                          </Button>
                        )}
                        {hasPermission('knowledge.delete') && (
                          <Popconfirm
                            title={`確定要清空全部 ${files.length} 個文件嗎？`}
                            description="此操作不可撤銷"
                            onConfirm={handleClearAllFiles}
                            okText="確定清空"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              loading={clearingFiles}
                            >
                              全部清空
                            </Button>
                          </Popconfirm>
                        )}
                      </Space>
                    )
                  }
                >
                  <List
                    dataSource={files}
                    locale={{ emptyText: '暫無文件' }}
                    renderItem={(file) => (
                      <List.Item
                        actions={[
                          <Button
                            key="preview"
                            type="link"
                            icon={<EyeOutlined />}
                            onClick={() => handlePreviewFile(file.name)}
                          >
                            預覽
                          </Button>,
                          hasPermission('knowledge.create') && (
                            <Popconfirm
                              key="import"
                              title={
                                <div>
                                  <div style={{ marginBottom: 8 }}>導入到知識庫？</div>
                                  <Input
                                    placeholder="分類（可選）"
                                    value={importCategory}
                                    onChange={(e) => setImportCategory(e.target.value)}
                                    style={{ width: 150 }}
                                  />
                                </div>
                              }
                              onConfirm={() => handleImportFromFile(file.name)}
                              okText="導入"
                              cancelText="取消"
                            >
                              <Button
                                type="link"
                                icon={<ImportOutlined />}
                                loading={importingFile === file.name}
                              >
                                導入
                              </Button>
                            </Popconfirm>
                          ),
                          hasPermission('knowledge.delete') && (
                            <Popconfirm
                              key="delete"
                              title="確定要刪除此文件嗎？"
                              onConfirm={() => handleDeleteFile(file.name)}
                            >
                              <Button type="link" danger icon={<DeleteOutlined />}>
                                刪除
                              </Button>
                            </Popconfirm>
                          ),
                        ].filter(Boolean)}
                      >
                        <List.Item.Meta
                          avatar={getFileIcon(file.name)}
                          title={file.name}
                          description={
                            <Space>
                              <Text type="secondary">
                                {(file.size / 1024).toFixed(1)} KB
                              </Text>
                              <Text type="secondary">
                                {new Date(file.modifiedAt).toLocaleString('zh-TW')}
                              </Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'logs',
            label: '自動回覆記錄',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Select
                    placeholder="篩選匹配狀態"
                    allowClear
                    style={{ width: 150 }}
                    onChange={setLogsFilter}
                    options={[
                      { value: 'true', label: '已匹配' },
                      { value: 'false', label: '未匹配' },
                    ]}
                  />
                </div>
                <Table
                  columns={logColumns}
                  dataSource={autoReplyLogs}
                  rowKey="id"
                  loading={logsLoading}
                  pagination={{
                    ...logsPagination,
                    onChange: (page) => fetchAutoReplyLogs(page),
                  }}
                />
              </>
            ),
          },
        ]}
      />

      {/* 新增/編輯 Modal */}
      <Modal
        title={editingEntry ? '編輯知識' : '新增知識'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="question"
            label="問題"
            rules={[{ required: true, message: '請輸入問題' }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="answer"
            label="答案"
            rules={[{ required: true, message: '請輸入答案' }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="category" label="分類">
            <Input placeholder="例如：常見問題、產品說明" />
          </Form.Item>
          <Form.Item name="keywords" label="關鍵字" extra="多個關鍵字請用逗號分隔">
            <Input placeholder="例如：價格, 費用, 多少錢" />
          </Form.Item>
        </Form>
      </Modal>

      {/* JSON/CSV 匯入 Modal */}
      <Modal
        title="JSON/CSV 匯入"
        open={importModalOpen}
        onOk={handleImport}
        onCancel={() => {
          setImportModalOpen(false)
          setImportData([])
        }}
        confirmLoading={importing}
        okText={`匯入 ${importData.length} 筆`}
        okButtonProps={{ disabled: importData.length === 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload {...jsonUploadProps}>
            <Button icon={<UploadOutlined />}>選擇檔案 (JSON / CSV)</Button>
          </Upload>
          <div style={{ marginTop: 16 }}>
            <p>支援格式：</p>
            <ul>
              <li>
                JSON: <code>[{`{ "question": "...", "answer": "...", "category": "..." }`}]</code>
              </li>
              <li>CSV: 包含 question, answer, category 欄位的 CSV 檔案</li>
            </ul>
          </div>
          {importData.length > 0 && (
            <Card
              size="small"
              title={`預覽 (共 ${importData.length} 筆)`}
              style={{ maxHeight: 300, overflow: 'auto' }}
            >
              {importData.slice(0, 5).map((item, index) => (
                <div
                  key={index}
                  style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}
                >
                  <div>
                    <strong>問：</strong>
                    {item.question}
                  </div>
                  <div>
                    <strong>答：</strong>
                    {item.answer}
                  </div>
                  {item.category && (
                    <div>
                      <strong>分類：</strong>
                      {item.category}
                    </div>
                  )}
                </div>
              ))}
              {importData.length > 5 && (
                <div style={{ color: '#999' }}>...還有 {importData.length - 5} 筆</div>
              )}
            </Card>
          )}
        </Space>
      </Modal>

      {/* 批量導入 Modal */}
      <Modal
        title="批量導入所有文件"
        open={batchImportModalOpen}
        onOk={handleBatchImportFromFiles}
        onCancel={() => {
          setBatchImportModalOpen(false)
          setBatchImportCategory('')
        }}
        confirmLoading={batchImporting}
        okText={`導入全部 ${files.length} 個文件`}
        okButtonProps={{ disabled: files.length === 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            將導入以下 <Text strong>{files.length}</Text> 個文件中的所有知識條目：
          </Text>
          <div
            style={{
              maxHeight: 150,
              overflow: 'auto',
              background: '#f5f5f5',
              padding: 8,
              borderRadius: 4,
            }}
          >
            {files.map((file) => (
              <div key={file.name} style={{ marginBottom: 4 }}>
                {getFileIcon(file.name)} {file.name}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Text>分類（可選，所有導入的條目將使用此分類）：</Text>
            <Input
              placeholder="輸入分類名稱"
              value={batchImportCategory}
              onChange={(e) => setBatchImportCategory(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>

      {/* 文件預覽 Modal */}
      <Modal
        title={`文件預覽：${previewContent?.filename || ''}`}
        open={previewModalOpen}
        onCancel={() => {
          setPreviewModalOpen(false)
          setPreviewContent(null)
        }}
        footer={[
          <Button key="close" onClick={() => setPreviewModalOpen(false)}>
            關閉
          </Button>,
          hasPermission('knowledge.create') && previewContent && (
            <Popconfirm
              key="import"
              title={
                <div>
                  <div style={{ marginBottom: 8 }}>導入到知識庫？</div>
                  <Input
                    placeholder="分類（可選）"
                    value={importCategory}
                    onChange={(e) => setImportCategory(e.target.value)}
                    style={{ width: 150 }}
                  />
                </div>
              }
              onConfirm={() => {
                if (previewContent) {
                  handleImportFromFile(previewContent.filename)
                  setPreviewModalOpen(false)
                }
              }}
              okText="導入"
              cancelText="取消"
            >
              <Button type="primary" icon={<ImportOutlined />}>
                導入到知識庫 ({previewContent?.entries?.length || 0} 條)
              </Button>
            </Popconfirm>
          ),
        ].filter(Boolean)}
        width={800}
      >
        {previewContent && (
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            <Card size="small" title="解析的知識條目" style={{ marginBottom: 16 }}>
              {previewContent.entries.length > 0 ? (
                <List
                  size="small"
                  dataSource={previewContent.entries.slice(0, 20)}
                  renderItem={(item, index) => (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Text strong>Q{index + 1}：</Text>
                        <Text>{item.question}</Text>
                        <br />
                        <Text type="secondary">A：{item.answer.substring(0, 100)}...</Text>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Text type="secondary">無法解析出知識條目，請確認文件格式</Text>
              )}
              {previewContent.entries.length > 20 && (
                <Text type="secondary">...還有 {previewContent.entries.length - 20} 條</Text>
              )}
            </Card>
            <Card size="small" title="原始內容">
              <Paragraph
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflow: 'auto',
                  background: '#f5f5f5',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {previewContent.content}
              </Paragraph>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}
