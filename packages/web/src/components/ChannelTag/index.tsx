import { Tag, Tooltip } from 'antd'
import type { Channel } from '@/services/api'

interface ChannelTagProps {
  channel: Channel
  showLabel?: boolean
}

// LINE 官方綠色
const LINE_COLOR = '#06C755'
// 飛書官方藍色
const FEISHU_COLOR = '#3370FF'

export function ChannelTag({ channel, showLabel = true }: ChannelTagProps) {
  const config = {
    LINE: {
      color: LINE_COLOR,
      label: 'LINE',
      icon: (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: showLabel ? 4 : 0 }}>
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
        </svg>
      ),
    },
    FEISHU: {
      color: FEISHU_COLOR,
      label: '飛書',
      icon: (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: showLabel ? 4 : 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      ),
    },
  }

  const { color, label, icon } = config[channel] || config.LINE

  return (
    <Tooltip title={`${label} 渠道`}>
      <Tag
        color={color}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          margin: 0,
        }}
      >
        {icon}
        {showLabel && label}
      </Tag>
    </Tooltip>
  )
}

// 只顯示圖標的版本
export function ChannelIcon({ channel }: { channel: Channel }) {
  return <ChannelTag channel={channel} showLabel={false} />
}
