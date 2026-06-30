import { useState, useRef, useCallback, useEffect } from 'react'
import {
  queryPPTProgress,
  downloadLocalPPT,
  generatePPTOutlineSSE,
  createPPTFromOutline,
  fetchPPTRecords,
  deletePPTRecord,
  getPPTFileUrl,
} from '../../services/api'
import type { PPTOutline, PPTOutlinePage, PPTRecord } from '../../services/api'

type Stage = 'input' | 'outline' | 'generating' | 'done' | 'error'

interface ProgressState {
  status: string
  message: string
  percent: number
  fileUrl: string
  local: boolean
  sid: string
  rawPayload: Record<string, unknown> | null
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  cover: '封面',
  content: '内容',
  chart: '图表',
  summary: '总结',
}

const PAGE_TYPE_COLORS: Record<string, string> = {
  cover: 'bg-amber/10 text-amber border-amber/30',
  content: 'bg-ink/5 text-ink border-ink/10',
  chart: 'bg-blue-50 text-blue-600 border-blue-200',
  summary: 'bg-green-50 text-green-600 border-green-200',
}

export default function PPTPage() {
  const [stage, setStage] = useState<Stage>('input')
  const [topic, setTopic] = useState('')
  const [outline, setOutline] = useState<PPTOutline | null>(null)
  const [rawText, setRawText] = useState('')
  const [progress, setProgress] = useState<ProgressState>({
    status: '', message: '', percent: 0, fileUrl: '', local: false, sid: '', rawPayload: null,
  })
  const [records, setRecords] = useState<PPTRecord[]>([])
  const abortRef = useRef(false)

  // 加载历史记录
  const loadRecords = useCallback(async () => {
    const data = await fetchPPTRecords()
    setRecords(data.records || [])
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  // 删除记录
  const handleDeleteRecord = async (id: number) => {
    await deletePPTRecord(id)
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  // ── Stage 1: 生成大纲 ──
  const handleGenerateOutline = useCallback(() => {
    if (!topic.trim()) return
    setStage('outline')
    setRawText('')
    setOutline(null)
    abortRef.current = false

    generatePPTOutlineSSE(
      topic.trim(),
      (text) => setRawText((prev) => prev + text),
      (data) => setOutline(data),
      (msg) => { setStage('error'); setProgress((p) => ({ ...p, message: msg })) },
      () => {},
    )
  }, [topic])

  // ── 编辑 outline ──
  const updatePage = (index: number, updates: Partial<PPTOutlinePage>) => {
    if (!outline) return
    const pages = [...outline.pages]
    pages[index] = { ...pages[index], ...updates }
    setOutline({ ...outline, pages })
  }
  const updateKeyPoints = (pageIndex: number, kpIndex: number, value: string) => {
    if (!outline) return
    const pages = [...outline.pages]
    const keyPoints = [...pages[pageIndex].keyPoints]
    keyPoints[kpIndex] = value
    pages[pageIndex] = { ...pages[pageIndex], keyPoints }
    setOutline({ ...outline, pages })
  }
  const addKeyPoint = (pageIndex: number) => {
    if (!outline) return
    const pages = [...outline.pages]
    pages[pageIndex] = { ...pages[pageIndex], keyPoints: [...pages[pageIndex].keyPoints, ''] }
    setOutline({ ...outline, pages })
  }
  const removeKeyPoint = (pageIndex: number, kpIndex: number) => {
    if (!outline) return
    const pages = [...outline.pages]
    pages[pageIndex] = {
      ...pages[pageIndex],
      keyPoints: pages[pageIndex].keyPoints.filter((_, i) => i !== kpIndex),
    }
    setOutline({ ...outline, pages })
  }

  // ── Stage 2: 确认大纲 → 生成 PPT ──
  const handleConfirmOutline = async () => {
    if (!outline) return
    setStage('generating')
    setProgress({ status: 'creating', message: '正在提交 PPT 生成任务...', percent: 0, fileUrl: '', local: false, sid: '', rawPayload: null })

    try {
      const result = await createPPTFromOutline({ outline })
      const sid = result.sid
      const isLocal = result.local === true
      if (!sid) {
        setStage('error')
        setProgress((p) => ({ ...p, status: 'error', message: '未获取到任务 ID' }))
        return
      }

      setProgress({
        status: 'generating',
        message: isLocal ? '讯飞不可用，本地 AI 生成中...' : 'AI 正在生成 PPT...',
        sid, percent: 0, fileUrl: '', local: isLocal, rawPayload: null,
      })

      // 轮询进度
      let attempts = 0
      const maxAttempts = 60
      const poll = setInterval(async () => {
        attempts++
        try {
          const p = await queryPPTProgress(sid)
          const percent = p.progress || 0
          const isDone = p.pptStatus === 'done' || p.pptStatus === 'completed'
          const hasUrl = !!p.fileUrl
          const isLocalTask = p.local === true
          const hasError = p.pptStatus === 'error'

          if (hasError) {
            clearInterval(poll)
            setStage('error')
            setProgress({ ...progress, status: 'error', message: p.error || '生成失败', sid, rawPayload: p._raw || null })
          } else if (isLocalTask && isDone) {
            clearInterval(poll)
            setStage('done')
            setProgress({ status: 'done', message: 'PPT 生成完成！', sid, percent: 100, fileUrl: '', local: true, rawPayload: p._raw || null })
            loadRecords()
            downloadLocalPPT(sid, `AI_${outline.title}.pptx`).catch(() => {
              setProgress((prev) => ({ ...prev, message: 'PPT 生成完成，但下载失败，请点击重试' }))
            })
          } else if (hasUrl) {
            clearInterval(poll)
            setStage('done')
            setProgress({ status: 'done', message: 'PPT 生成完成！', sid, percent: 100, fileUrl: p.fileUrl, local: false, rawPayload: p._raw || null })
            loadRecords()
          } else if (isDone && !hasUrl) {
            clearInterval(poll)
            setStage('done')
            setProgress({
              status: 'done', message: 'PPT 已完成，但未获取到下载链接。请检查讯飞额度。',
              sid, percent: 100, fileUrl: '', local: false, rawPayload: p._raw || null,
            })
            loadRecords()
          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            setStage('error')
            setProgress((prev) => ({ ...prev, status: 'error', message: '生成超时', sid, percent, rawPayload: p._raw || null }))
          } else {
            setProgress((prev) => ({
              ...prev, percent,
              message: isLocalTask ? `本地 AI 生成中...（${percent}%）` : `AI 正在生成 PPT...（${percent}%）`,
            }))
          }
        } catch {
          clearInterval(poll)
          setStage('error')
          setProgress((prev) => ({ ...prev, status: 'error', message: '进度查询失败' }))
        }
      }, 3000)
    } catch (e: unknown) {
      setStage('error')
      setProgress((p) => ({ ...p, status: 'error', message: (e as Error).message || '生成失败' }))
    }
  }

  // ── 重置 ──
  const handleReset = () => {
    setStage('input')
    setTopic('')
    setOutline(null)
    setRawText('')
    setProgress({ status: '', message: '', percent: 0, fileUrl: '', local: false, sid: '', rawPayload: null })
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">📽️</div>
        <h1 className="text-xl font-semibold text-ink">PPT 智能生成</h1>
        <p className="text-sm text-muted mt-1">输入主题 → AI 生成大纲 → 编辑确认 → 一键生成 PPT</p>
        <p className="text-xs text-muted/60 mt-0.5">基于你的学习画像自动调整内容深度和侧重点</p>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Stage: INPUT
         ══════════════════════════════════════════════════════════════ */}
      {stage === 'input' && (
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
            />
          </div>
          <button
            onClick={handleGenerateOutline}
            disabled={!topic.trim()}
            className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light
              transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            ✨ AI 生成大纲
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Stage: OUTLINE (编辑器)
         ══════════════════════════════════════════════════════════════ */}
      {stage === 'outline' && (
        <div className="space-y-4">
          {/* 大纲预览/编辑 */}
          {outline ? (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {/* 大纲标题 */}
              <div className="px-6 py-4 border-b border-border bg-cream/50">
                <input
                  value={outline.title}
                  onChange={(e) => setOutline({ ...outline, title: e.target.value })}
                  className="w-full text-lg font-semibold text-ink bg-transparent border-none focus:outline-none"
                  placeholder="PPT 标题"
                />
                <input
                  value={outline.description}
                  onChange={(e) => setOutline({ ...outline, description: e.target.value })}
                  className="w-full text-sm text-muted bg-transparent border-none focus:outline-none mt-1"
                  placeholder="PPT 描述"
                />
              </div>

              {/* 页面列表 */}
              <div className="divide-y divide-border">
                {outline.pages.map((page, idx) => (
                  <div key={page.id} className="px-6 py-4 space-y-2">
                    {/* 页面标题行 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted w-5">{page.id}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PAGE_TYPE_COLORS[page.type] || ''}`}>
                        {PAGE_TYPE_LABELS[page.type] || page.type}
                      </span>
                      <input
                        value={page.title}
                        onChange={(e) => updatePage(idx, { title: e.target.value })}
                        className="flex-1 text-sm font-medium text-ink bg-transparent border-none focus:outline-none"
                        placeholder="页面标题"
                      />
                    </div>

                    {/* 要点列表 */}
                    {(page.type === 'content' || page.type === 'summary') && (
                      <div className="ml-7 space-y-1">
                        {page.keyPoints.map((kp, kpIdx) => (
                          <div key={kpIdx} className="flex items-center gap-1.5 group">
                            <span className="text-muted text-xs">•</span>
                            <input
                              value={kp}
                              onChange={(e) => updateKeyPoints(idx, kpIdx, e.target.value)}
                              className="flex-1 text-xs text-ink/80 bg-transparent border-none focus:outline-none"
                              placeholder="要点内容"
                            />
                            <button
                              onClick={() => removeKeyPoint(idx, kpIdx)}
                              className="text-muted/0 group-hover:text-red-400 text-xs transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addKeyPoint(idx)}
                          className="text-xs text-muted hover:text-ink transition-colors"
                        >
                          + 添加要点
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 操作栏 */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-muted hover:text-ink transition-colors"
                >
                  ← 返回修改主题
                </button>
                <button
                  onClick={handleConfirmOutline}
                  className="px-6 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors flex items-center gap-2"
                >
                  ✓ 确认并生成 PPT
                </button>
              </div>
            </div>
          ) : (
            /* 大纲流式加载中 */
            <div className="rounded-xl border border-border bg-surface p-6">
              <div className="flex items-center gap-3 mb-4">
                <svg className="animate-spin w-5 h-5 text-ink" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                </svg>
                <span className="text-sm text-ink font-medium">AI 正在分析主题并生成大纲...</span>
              </div>
              {rawText && (
                <pre className="text-xs text-muted bg-cream/50 rounded-lg p-3 overflow-auto max-h-60 font-mono whitespace-pre-wrap">
                  {rawText}
                </pre>
              )}
              <button
                onClick={handleReset}
                className="mt-4 px-4 py-2 text-sm text-muted hover:text-ink transition-colors"
              >
                ← 取消
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Stage: GENERATING
         ══════════════════════════════════════════════════════════════ */}
      {stage === 'generating' && (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
          <div className="flex items-center gap-3">
            <svg className="animate-spin w-5 h-5 text-ink" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
            </svg>
            <span className="text-sm text-ink">{progress.message}</span>
          </div>
          <div className="h-2 bg-cream rounded-full overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all duration-700"
              style={{ width: `${Math.max(progress.percent, 5)}%` }}
            />
          </div>
          {progress.local && (
            <p className="text-xs text-muted text-center">讯飞服务不可用，正在使用本地 LLM + python-pptx 生成</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Stage: DONE
         ══════════════════════════════════════════════════════════════ */}
      {stage === 'done' && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center space-y-4">
          <div className="text-3xl">{progress.fileUrl ? '🎉' : '⚠️'}</div>
          <p className="text-sm text-ink font-medium">{progress.message}</p>

          {progress.fileUrl && (
            <a
              href={progress.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
            >
              📥 下载 PPT
            </a>
          )}

          {progress.local && (
            <button
              onClick={() => downloadLocalPPT(progress.sid, `AI_${outline?.title || 'ppt'}.pptx`)}
              className="inline-block px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
            >
              📥 下载 PPT
            </button>
          )}

          {!progress.fileUrl && !progress.local && (
            <p className="text-xs text-muted">请确认讯飞账户有 PPT 生成额度，或稍后重试。</p>
          )}

          {progress.rawPayload && (
            <details className="text-left">
              <summary className="text-xs text-muted cursor-pointer">调试信息</summary>
              <pre className="text-xs bg-cream rounded p-2 mt-1 overflow-auto max-h-40">
                {JSON.stringify(progress.rawPayload, null, 2)}
              </pre>
            </details>
          )}

          <button onClick={handleReset} className="mt-2 px-4 py-2 text-sm text-muted hover:text-ink transition-colors">
            继续生成
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Stage: ERROR
         ══════════════════════════════════════════════════════════════ */}
      {stage === 'error' && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center space-y-3">
          <p className="text-sm text-red-500">{progress.message || '发生错误'}</p>
          {progress.rawPayload && (
            <details className="text-left">
              <summary className="text-xs text-muted cursor-pointer">调试信息</summary>
              <pre className="text-xs bg-cream rounded p-2 mt-1 overflow-auto max-h-40">
                {JSON.stringify(progress.rawPayload, null, 2)}
              </pre>
            </details>
          )}
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm bg-ink text-warm-white rounded-lg hover:bg-ink-light"
          >
            重试
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          历史记录
         ══════════════════════════════════════════════════════════════ */}
      {records.length > 0 && stage !== 'outline' && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-muted mb-3">📋 历史记录</h2>
          <div className="space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:bg-cream/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{record.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {record.source === 'xfyun' ? '讯飞' : '本地'} ·{' '}
                    {record.created_at ? new Date(record.created_at).toLocaleString('zh-CN', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    }) : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <a
                    href={getPPTFileUrl(record.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-xs bg-ink text-warm-white rounded-md hover:bg-ink-light transition-colors"
                  >
                    下载
                  </a>
                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    className="px-2 py-1.5 text-xs text-muted hover:text-red-500 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
