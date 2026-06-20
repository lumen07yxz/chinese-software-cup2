import { useState } from 'react'
import { createPPT, queryPPTProgress } from '../../services/api'

interface ProgressState {
  status: 'idle' | 'creating' | 'generating' | 'done' | 'error'
  message: string
  sid: string
  percent: number
  fileUrl: string
}

export default function PPTPage() {
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState<'cn' | 'en'>('cn')
  const [progress, setProgress] = useState<ProgressState>({
    status: 'idle', message: '', sid: '', percent: 0, fileUrl: '',
  })

  const handleGenerate = async () => {
    if (!topic.trim() || progress.status === 'creating' || progress.status === 'generating') return
    setProgress({ status: 'creating', message: '正在提交 PPT 生成任务...', sid: '', percent: 0, fileUrl: '' })

    // Debug: check token
    const token = localStorage.getItem('auth_token')
    console.log('PPT Page - auth_token exists:', !!token, 'token length:', token?.length || 0)

    try {
      const result = await createPPT({ query: topic.trim(), language })
      const sid = result.sid
      if (!sid) {
        setProgress({ ...progress, status: 'error', message: '未获取到任务 ID' })
        return
      }

      setProgress({ status: 'generating', message: 'AI 正在生成 PPT...', sid, percent: 0, fileUrl: '' })

      // 轮询进度（每 3 秒，最长 120 秒）
      let attempts = 0
      const maxAttempts = 40
      const poll = setInterval(async () => {
        attempts++
        try {
          const p = await queryPPTProgress(sid)
          const percent = p.progress || 0
          if (p.fileUrl) {
            clearInterval(poll)
            setProgress({ status: 'done', message: 'PPT 生成完成！', sid, percent: 100, fileUrl: p.fileUrl })
          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            setProgress({ status: 'error', message: '生成超时，请稍后重试', sid, percent, fileUrl: '' })
          } else {
            setProgress(prev => ({
              ...prev,
              percent,
              message: `AI 正在生成 PPT...（${percent}%）`,
            }))
          }
        } catch {
          clearInterval(poll)
          setProgress(prev => ({ ...prev, status: 'error', message: '进度查询失败' }))
        }
      }, 3000)
    } catch (e: unknown) {
      setProgress({ ...progress, status: 'error', message: (e as Error).message || '生成失败' })
    }
  }

  const isBusy = progress.status === 'creating' || progress.status === 'generating'

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">📽️</div>
        <h1 className="text-xl font-semibold text-ink">PPT 生成</h1>
        <p className="text-sm text-muted mt-1">输入学习主题，AI 自动生成精美 PPT</p>
      </div>

      {/* Input card */}
      <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-2">PPT 主题</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：人工智能发展简史、Transformer 架构详解、Python 入门教程..."
            className="w-full px-4 py-3 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted/60
              focus:outline-none focus:ring-2 focus:ring-ink/20 resize-none"
            rows={4}
            disabled={isBusy}
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">语言：</label>
            <div className="flex rounded-lg bg-cream p-1">
              {(['cn', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  disabled={isBusy}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    language === lang
                      ? 'bg-white text-ink font-medium shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {lang === 'cn' ? '中文' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!topic.trim() || isBusy}
          className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light
            transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isBusy ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
              </svg>
              生成中...
            </>
          ) : (
            'AI 生成 PPT'
          )}
        </button>
      </div>

      {/* Progress / Result */}
      {progress.status !== 'idle' && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-6">
          {/* Progress bar */}
          {(progress.status === 'creating' || progress.status === 'generating') && (
            <div className="space-y-3">
              <p className="text-sm text-ink text-center">{progress.message}</p>
              <div className="h-2 bg-cream rounded-full overflow-hidden">
                <div
                  className="h-full bg-ink rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(progress.percent, 5)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {progress.status === 'error' && (
            <div className="text-center">
              <p className="text-sm text-red-500 mb-3">{progress.message}</p>
              <button
                onClick={() => setProgress({ status: 'idle', message: '', sid: '', percent: 0, fileUrl: '' })}
                className="px-4 py-2 text-sm bg-ink text-warm-white rounded-lg hover:bg-ink-light"
              >
                重试
              </button>
            </div>
          )}

          {/* Done */}
          {progress.status === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-3xl">🎉</div>
              <p className="text-sm text-ink font-medium">{progress.message}</p>
              <a
                href={progress.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
              >
                下载 PPT
              </a>
              <div>
                <button
                  onClick={() => {
                    setTopic('')
                    setProgress({ status: 'idle', message: '', sid: '', percent: 0, fileUrl: '' })
                  }}
                  className="mt-3 px-4 py-2 text-sm text-muted hover:text-ink transition-colors"
                >
                  继续生成
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
