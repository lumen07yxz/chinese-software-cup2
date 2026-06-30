import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface WrongAnswer {
  id: string
  question: string
  options: string[]
  correctIndex: number
  yourAnswer: number
  explanation: string
  chapter: string
  difficulty: number
  timestamp: string
}

export default function WrongAnswerBookPage() {
  const navigate = useNavigate()
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([])
  const [reviewMode, setReviewMode] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  useEffect(() => {
    loadWrongAnswers()
  }, [])

  const loadWrongAnswers = () => {
    try {
      const data = JSON.parse(localStorage.getItem('wrong-answers') || '[]')
      setWrongAnswers(data)
    } catch { setWrongAnswers([]) }
  }

  const removeWrongAnswer = (id: string) => {
    const filtered = wrongAnswers.filter(w => w.id !== id)
    setWrongAnswers(filtered)
    localStorage.setItem('wrong-answers', JSON.stringify(filtered))
  }

  const clearAll = () => {
    if (confirm('确定清空所有错题记录？')) {
      setWrongAnswers([])
      localStorage.setItem('wrong-answers', '[]')
    }
  }

  const startReview = (startIdx: number = 0) => {
    setReviewMode(true)
    setCurrentIdx(startIdx)
    setShowAnswer(false)
  }

  const exitReview = () => {
    setReviewMode(false)
    setShowAnswer(false)
    loadWrongAnswers()
  }

  const markCorrect = (id: string) => {
    const newWrongAnswers = wrongAnswers.filter(w => w.id !== id)
    setWrongAnswers(newWrongAnswers)
    localStorage.setItem('wrong-answers', JSON.stringify(newWrongAnswers))

    if (newWrongAnswers.length === 0) {
      exitReview()
      return
    }

    // 删除后当前索引不变（下一题自动补位），除非已超出新数组末尾
    if (currentIdx >= newWrongAnswers.length) {
      setCurrentIdx(newWrongAnswers.length - 1)
    }
    setShowAnswer(false)
  }

  if (wrongAnswers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="text-5xl mb-4">📕</div>
        <h1 className="text-xl font-semibold text-ink mb-2">错题本</h1>
        <p className="text-sm text-muted mb-8">还没有错题记录，继续保持！</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/quiz')}
            className="px-6 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
          >
            去做练习
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="px-6 py-2.5 border border-border text-sm rounded-lg hover:bg-cream transition-colors"
          >
            继续学习
          </button>
        </div>
      </div>
    )
  }

  if (reviewMode) {
    const current = wrongAnswers[currentIdx]
    if (!current) {
      exitReview()
      return null
    }

    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-ink">错题复习</h1>
            <p className="text-sm text-muted">第 {currentIdx + 1}/{wrongAnswers.length} 题</p>
          </div>
          <button onClick={exitReview} className="text-sm text-muted hover:text-ink">退出复习</button>
        </div>

        <div className="h-1.5 bg-cream rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-ink rounded-full transition-all"
            style={{ width: `${((currentIdx) / wrongAnswers.length) * 100}%` }}
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 mb-4">
          <h2 className="text-base font-medium text-ink mb-4">{current.question}</h2>

          {current.chapter && (
            <span className="inline-block text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted mb-4">
              {current.chapter}
            </span>
          )}

          <div className="space-y-2">
            {current.options.map((opt, idx) => {
              let style = 'border-border'
              if (showAnswer) {
                if (idx === current.correctIndex) {
                  style = 'border-emerald-400 bg-emerald-50'
                } else if (idx === current.yourAnswer) {
                  style = 'border-red-300 bg-red-50'
                }
              } else if (idx === current.yourAnswer) {
                style = 'border-red-200 bg-red-50/50'
              }
              return (
                <div key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${style}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                    ${showAnswer && idx === current.correctIndex ? 'bg-emerald-500 text-white' :
                      showAnswer && idx === current.yourAnswer && idx !== current.correctIndex ? 'bg-red-400 text-white' :
                      'bg-cream text-muted'}`}
                  >
                    {showAnswer && idx === current.correctIndex ? '✓' :
                     showAnswer && idx === current.yourAnswer && idx !== current.correctIndex ? '✗' :
                     String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-[14px] text-ink">{opt}</span>
                </div>
              )
            })}
          </div>

          {showAnswer && current.explanation && (
            <div className="mt-4 p-4 rounded-lg bg-amber/5 border border-amber/20">
              <p className="text-sm text-muted">💡 {current.explanation}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
            >
              查看解析
            </button>
          ) : (
            <>
              <button
                onClick={() => markCorrect(current.id)}
                className="flex-1 px-6 py-3 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors"
              >
                ✓ 已掌握，移除
              </button>
              <button
                onClick={() => {
                  if (currentIdx < wrongAnswers.length - 1) {
                    setCurrentIdx(prev => prev + 1)
                    setShowAnswer(false)
                  } else {
                    exitReview()
                  }
                }}
                className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
              >
                {currentIdx < wrongAnswers.length - 1 ? '下一题 →' : '完成复习'}
              </button>
            </>
          )}
        </div>

        {/* 让AI讲这道题 */}
        {showAnswer && (
          <button
            onClick={() => {
              const q = current
              const prefill = `请讲解这道题：\n${q.question}\n\n我的答案：${q.studentAnswer}\n正确答案：${q.correctAnswer}\n${q.explanation ? '\n解析：' + q.explanation : ''}`
              navigate('/tutoring', { state: { prefill } })
            }}
            className="w-full mt-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 text-sm rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
          >
            🤖 让 AI 讲这道题（详细解答）
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
            📕 错题本
          </h1>
          <p className="text-sm text-muted mt-0.5">
            共 {wrongAnswers.length} 道错题，及时复习巩固薄弱点
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => startReview(0)}
            className="px-5 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
          >
            全部复习
          </button>
          <button
            onClick={clearAll}
            className="px-5 py-2 border border-border text-sm rounded-lg hover:bg-cream transition-colors text-muted"
          >
            清空
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-2xl font-semibold text-red-500">{wrongAnswers.length}</div>
          <div className="text-xs text-muted mt-1">总错题</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-2xl font-semibold text-ink">
            {new Set(wrongAnswers.map(w => w.chapter)).size}
          </div>
          <div className="text-xs text-muted mt-1">涉及章节</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-2xl font-semibold text-ink">
            {wrongAnswers.filter(w => {
              const days = (Date.now() - new Date(w.timestamp).getTime()) / 86400000
              return days <= 1
            }).length}
          </div>
          <div className="text-xs text-muted mt-1">今日新增</div>
        </div>
      </div>

      {/* Wrong answers list */}
      <div className="space-y-3">
        {wrongAnswers.map((w, i) => (
          <div
            key={w.id}
            onClick={() => startReview(i)}
            className="rounded-xl border border-border bg-surface p-5 hover:shadow-sm hover:border-ink/20 transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-red-50 text-red-500 text-xs font-medium flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {w.chapter && (
                    <span className="text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted">{w.chapter}</span>
                  )}
                  <span className="text-[11px] text-muted">
                    {new Date(w.timestamp).toLocaleDateString('zh-CN')}
                  </span>
                  {/* Review button — appears on hover */}
                  <span className="ml-auto text-[11px] text-ink/40 group-hover:text-ink transition-colors flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 14 9 10 15 6" />
                    </svg>
                    点击复习
                  </span>
                </div>
                <h3 className="text-sm font-medium text-ink mb-2">{w.question}</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-red-500">
                    你的答案：{w.options[w.yourAnswer] || '未作答'}
                  </span>
                  <span className="text-emerald-600">
                    正确答案：{w.options[w.correctIndex]}
                  </span>
                </div>
                {w.explanation && (
                  <p className="text-xs text-muted mt-2 line-clamp-2">💡 {w.explanation}</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeWrongAnswer(w.id)
                }}
                className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-cream flex items-center justify-center text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                title="移除"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
