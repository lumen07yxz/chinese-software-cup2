import { useState } from 'react'
import { createPPT, queryPPTProgress, downloadLocalPPT } from '../../services/api'

interface ProgressState {
  status: 'idle' | 'creating' | 'generating' | 'done' | 'error'
  message: string
  sid: string
  percent: number
  fileUrl: string
  local: boolean
  rawPayload: Record<string, unknown> | null
}

export default function PPTPage() {
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState<'cn' | 'en'>('cn')
  const [progress, setProgress] = useState<ProgressState>({
    status: 'idle', message: '', sid: '', percent: 0, fileUrl: '', local: false, rawPayload: null,
  })

  const handleGenerate = async () => {
    if (!topic.trim() || progress.status === 'creating' || progress.status === 'generating') return
    setProgress({ status: 'creating', message: '正在提交 PPT 生成任务...', sid: '', percent: 0, fileUrl: '', local: false, rawPayload: null })

    try {
      const result = await createPPT({ query: topic.trim(), language })
      const sid = result.sid
      const isLocal = result.local === true

      if (!sid) {
        setProgress(prev => ({ ...prev, status: 'error', message: '未获取到任务 ID' }))
        return
      }

      setProgress({
        status: 'generating',
        message: isLocal
          ? '讯飞服务不可用，本地 AI 正在生成 PPT...'
          : 'AI 正在生成 PPT...',
        sid, percent: 0, fileUrl: '', local: isLocal, rawPayload: null,
      })

      // 轮询进度（每 3 秒，最长 180 秒 —— 本地生成可能较慢）
      let attempts = 0
      const maxAttempts = 60
      const poll = setInterval(async () => {
        attempts++
        try {
          const p = await queryPPTProgress(sid)
          const percent = p.progress || 0
          const isDone = p.pptStatus === 'done' || p.pptStatus === 'completed'
          const hasUrl = !!p.fileUrl
          const isLocal = p.local === true
          const hasError = p.pptStatus === 'error'

          if (hasError) {
            clearInterval(poll)
            setProgress(prev => ({
              ...prev, status: 'error',
              message: p.error || '生成失败',
              rawPayload: p._raw || null,
            }))
          } else if (isLocal && isDone) {
            // 本地生成完成 → 触发下载
            clearInterval(poll)
            setProgress({
              status: 'done',
              message: 'PPT 生成完成！',
              sid, percent: 100, fileUrl: '', local: true, rawPayload: p._raw || null,
            })
            // 自动下载
            downloadLocalPPT(sid, `AI_${topic.trim()}.pptx`).catch(() => {
              setProgress(prev => ({ ...prev, message: 'PPT 生成完成，但下载失败，请点击重试' }))
            })
          } else if (hasUrl) {
            // 讯飞 API 生成完成
            clearInterval(poll)
            setProgress({ status: 'done', message: 'PPT 生成完成！', sid, percent: 100, fileUrl: p.fileUrl, local: false, rawPayload: p._raw || null })
          } else if (isDone && !hasUrl) {
            clearInterval(poll)
            setProgress({
              status: 'done',
              message: 'PPT 已生成完成，但未获取到下载链接。请稍后重试或检查讯飞账户额度。',
              sid, percent: 100, fileUrl: '', local: false, rawPayload: p._raw || null,
            })
          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            setProgress(prev => ({ ...prev, status: 'error', message: '生成超时，请稍后重试', sid, percent, rawPayload: p._raw || null }))
          } else {
            setProgress(prev => ({
              ...prev, percent,
              message: isLocal
                ? `本地 AI 正在生成 PPT...（${percent}%）`
                : `AI 正在生成 PPT...（${percent}%）`,
            }))
          }
        } catch {
          clearInterval(poll)
          setProgress(prev => ({ ...prev, status: 'error', message: '进度查询失败，请检查网络后重试' }))
        }
      }, 3000)
    } catch (e: unknown) {
      setProgress(prev => ({ ...prev, status: 'error', message: (e as Error).message || '生成失败' }))
    }
  }

  const isBusy = progress.status === 'creating' || progress.status === 'generating'

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">📽️</div>
        <h1 className="text-xl font-semibold text-ink">PPT 生成</h1>
        <p className="text-sm text-muted mt-1">输入学习主题，AI 自动生成精美 PPT</p>
        <p className="text-xs text-muted/60 mt-0.5">优先使用讯飞服务，不可用时自动切换本地 AI 生成</p>
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
              {progress.local && (
                <p className="text-xs text-muted text-center">
                  讯飞服务不可用，正在使用本地 LLM + python-pptx 生成
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {progress.status === 'error' && (
            <div className="text-center">
              <p className="text-sm text-red-500 mb-3">{progress.message}</p>
              {progress.rawPayload && (
                <details className="mb-3">
                  <summary className="text-xs text-muted cursor-pointer">调试信息</summary>
                  <pre className="text-xs text-left bg-cream rounded p-2 mt-1 overflow-auto max-h-40">
                    {JSON.stringify(progress.rawPayload, null, 2)}
                  </pre>
                </details>
              )}
              <button
                onClick={() => setProgress({ status: 'idle', message: '', sid: '', percent: 0, fileUrl: '', local: false, rawPayload: null })}
                className="px-4 py-2 text-sm bg-ink text-warm-white rounded-lg hover:bg-ink-light"
              >
                重试
              </button>
            </div>
          )}

          {/* Done */}
          {progress.status === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-3xl">{progress.fileUrl || progress.local ? '🎉' : '⚠️'}</div>
              <p className="text-sm text-ink font-medium">{progress.message}</p>
              {progress.local ? (
                <button
                  onClick={() => downloadLocalPPT(progress.sid, `AI_${topic.trim() || 'ppt'}.pptx`)}
                  className="inline-block px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
                >
                  重新下载 PPT
                </button>
              ) : progress.fileUrl ? (
                <a
                  href={progress.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
                >
                  下载 PPT
                </a>
              ) : (
                <p className="text-xs text-muted">
                  提示：请确认讯飞账户有 PPT 生成额度，或等待额度恢复后重试。
                </p>
              )}
              {progress.rawPayload && (
                <details className="text-left">
                  <summary className="text-xs text-muted cursor-pointer">调试信息</summary>
                  <pre className="text-xs bg-cream rounded p-2 mt-1 overflow-auto max-h-40">
                    {JSON.stringify(progress.rawPayload, null, 2)}
                  </pre>
                </details>
              )}
              <div>
                <button
                  onClick={() => setTopic('')}
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
