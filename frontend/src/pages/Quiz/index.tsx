import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchResources, generateResourcesStream, updateProfile } from '../../services/api'
import { getFilteredQuestions } from '../../data/quiz-questions'
import type { QuizQuestion } from '../../data/quiz-questions'
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { scheduleReview } from '../../utils/spacedRepetition'

interface QuizResult {
  total: number
  correct: number
  wrong: { question: string; yourAnswer: string; correctAnswer: string; explanation: string; chapter: string; difficulty: number }[]
}

const CHAPTERS = [
  { value: '', label: '全部章节' },
  // 人工智能
  { value: 'ch01', label: '🤖 ch01 人工智能导论' },
  { value: 'ch02', label: '📊 ch02 机器学习基础' },
  { value: 'ch03', label: '🧠 ch03 深度学习基础' },
  { value: 'ch04', label: '⚡ ch04 Transformer 架构' },
  { value: 'ch05', label: '💬 ch05 自然语言处理' },
  { value: 'ch06', label: '👁️ ch06 计算机视觉' },
  { value: 'ch07', label: '🎮 ch07 强化学习' },
  { value: 'ch08', label: '🛡️ ch08 AI 伦理与安全' },
  { value: 'ch09', label: '🔄 ch09 MLOps 实践' },
  { value: 'ch10', label: '🚀 ch10 前沿与多模态' },
  // Python 编程
  { value: 'py01', label: '🐍 Python 基础语法' },
  { value: 'py02', label: '🐍 Python 高级特性' },
  { value: 'py03', label: '📦 Python 标准库' },
  { value: 'py04', label: '⚙️ Python 实战' },
  // 数据结构与算法
  { value: 'dsa01', label: '📐 数据结构 — 线性结构' },
  { value: 'dsa02', label: '🌳 数据结构 — 树与图' },
  { value: 'dsa03', label: '🔍 算法 — 排序与搜索' },
  { value: 'dsa04', label: '🧩 算法 — 动态规划与贪心' },
  // 数学
  { value: 'math01', label: '∑ 数学 — 线性代数' },
  { value: 'math02', label: '📈 数学 — 概率与统计' },
  // Web 开发
  { value: 'web01', label: '🌐 Web 前端基础' },
  { value: 'web02', label: '🖥️ Web 后端基础' },
  // 数据库
  { value: 'db01', label: '🗄️ 数据库 — SQL 基础' },
  { value: 'db02', label: '📋 数据库 — 设计与优化' },
]

const DIFFICULTIES = [
  { value: 0, label: '全部' },
  { value: 0.3, label: '简单' },
  { value: 0.6, label: '中等' },
  { value: 0.8, label: '困难' },
]

export default function QuizPage() {
  const { profile, setProfile } = useProfileStore()
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [chapter, setChapter] = useState(searchParams.get('chapter') || '')
  const [difficulty, setDifficulty] = useState(0)
  const [showSettings, setShowSettings] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genText, setGenText] = useState('')
  const [quizMode] = useState<'practice' | 'exam'>('practice')
  // AI 搜索出题模式
  const [generationMode, setGenerationMode] = useState<'chapter' | 'search'>('chapter')
  const [searchTopic, setSearchTopic] = useState('')

  // Parse existing quiz resources on load
  useEffect(() => {
    loadExistingQuizzes()
  }, [])

  const loadExistingQuizzes = async () => {
    try {
      const data = await fetchResources('quiz')
      if (data.resources && data.resources.length > 0) {
        const parsed = parseQuizResources(data.resources)
        if (parsed.length > 0) {
          setQuestions(parsed)
          setShowSettings(false)
        }
      }
    } catch { /* silent */ }
  }

  const parseQuizResources = (resources: Record<string, unknown>[]): QuizQuestion[] => {
    const qs: QuizQuestion[] = []
    for (const r of resources) {
      const content = r.content as string || ''
      const chapter = r.course_chapter as string || ''
      const difficulty = r.difficulty as number || 0.5

      // Try to parse structured quiz format
      try {
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.question && Array.isArray(item.options)) {
              qs.push({
                id: `q-${qs.length}`,
                question: item.question,
                options: item.options,
                correctIndex: item.correctIndex ?? item.correct ?? 0,
                explanation: item.explanation || '',
                chapter: item.chapter || chapter,
                difficulty: item.difficulty || difficulty,
              })
            }
          }
        }
      } catch {
        // Fallback: try to parse from markdown content
        const parsed = parseQuizFromMarkdown(content, chapter, difficulty)
        qs.push(...parsed)
      }
    }
    return qs
  }

  const parseQuizFromMarkdown = (content: string, chapter: string, difficulty: number): QuizQuestion[] => {
    const qs: QuizQuestion[] = []
    const lines = content.split('\n')
    let current: Partial<QuizQuestion> | null = null

    for (const line of lines) {
      const qMatch = line.match(/^\d+[\.\、]\s*(.+)/)
      const optMatch = line.match(/^([A-D])[\.\、\)]\s*(.+)/)
      const answerMatch = line.match(/(?:答案|正确答案)[：:]\s*([A-D])/i)

      if (qMatch) {
        if (current && current.question) {
          qs.push({
            id: `q-${qs.length}`,
            question: current.question || '',
            options: current.options || ['', '', '', ''],
            correctIndex: current.correctIndex ?? 0,
            explanation: current.explanation || '',
            chapter,
            difficulty,
          })
        }
        current = { question: qMatch[1].trim(), options: [], correctIndex: 0, explanation: '' }
      } else if (optMatch && current) {
        current.options = [...(current.options || []), optMatch[2].trim()]
      } else if (answerMatch && current) {
        current.correctIndex = answerMatch[1].charCodeAt(0) - 65
      } else if (line.includes('解析') && current) {
        current.explanation = line.replace(/.*解析[：:]\s*/, '').trim()
      }
    }

    if (current && current.question) {
      qs.push({
        id: `q-${qs.length}`,
        question: current.question || '',
        options: current.options || ['', '', '', ''],
        correctIndex: current.correctIndex ?? 0,
        explanation: current.explanation || '',
        chapter,
        difficulty,
      })
    }

    return qs
  }

  const generateQuiz = async () => {
    setGenerating(true)
    setGenText('')
    setQuestions([])
    setResult(null)
    setCurrentIdx(0)

    // 根据生成模式构造 topic 和 chapter
    let topic: string
    let courseChapter: string | undefined

    if (generationMode === 'search' && searchTopic.trim()) {
      // AI 搜索出题模式：用用户输入的关键词作为 topic
      const diffLabel = DIFFICULTIES.find(d => d.value === difficulty)?.label || ''
      topic = `${searchTopic.trim()} ${diffLabel}练习题`
      courseChapter = undefined  // 不限定章节，让 RAG + 联网搜索自由检索
    } else {
      // 章节模式：按选中的章节和难度出题
      const chapterLabel = chapter ? CHAPTERS.find(c => c.value === chapter)?.label || chapter : '全部章节'
      const diffLabel = DIFFICULTIES.find(d => d.value === difficulty)?.label || ''
      topic = `${chapterLabel} ${diffLabel}练习题`
      courseChapter = chapter || undefined
    }

    let accumulatedContent = ''
    let captureStarted = false
    await generateResourcesStream(
      {
        resource_type: 'quiz',
        topic,
        course_chapter: courseChapter,
        difficulty: difficulty || undefined,
        count: 10,
      },
      (chunk) => {
        // Skip orchestrator analysis (starts with >) and safety warnings
        // Only capture actual quiz content
        if (!captureStarted) {
          if (!chunk.startsWith('>') && !chunk.startsWith('\n>') && chunk.trim().length > 0) {
            captureStarted = true
          } else {
            setGenText((prev) => prev + chunk)
            return
          }
        }
        accumulatedContent += chunk
        setGenText((prev) => prev + chunk)
      },
      async () => {
        setGenerating(false)
        // Parse from clean accumulated content
        let cleanText = accumulatedContent
        // Remove the hallucination disclaimer suffix if present
        const discIdx = cleanText.indexOf('以上内容由 AI 生成')
        if (discIdx > 0) cleanText = cleanText.substring(0, discIdx)

        // 1) Try JSON format (extracted from ```json blocks or raw JSON)
        const parsedFromJson = tryParseQuizJSON(cleanText, chapter, difficulty)
        if (parsedFromJson.length > 0) {
          setQuestions(parsedFromJson)
          setShowSettings(false)
          return
        }

        // 2) Try markdown parsers
        const parsedFromStream = parseQuizFromMarkdownDirect(cleanText, chapter, difficulty)
        if (parsedFromStream.length > 0) {
          setQuestions(parsedFromStream)
          setShowSettings(false)
          return
        }

        // 3) Also try the built-in parser as fallback
        const parsedFromBuiltin = parseQuizFromMarkdown(cleanText, chapter, difficulty)
        if (parsedFromBuiltin.length > 0) {
          setQuestions(parsedFromBuiltin)
          setShowSettings(false)
          return
        }

        // 4) Fallback to demo questions
        setQuestions(getFilteredQuestions(chapter, difficulty))
        setShowSettings(false)
      },
      () => {
        setGenerating(false)
        setQuestions(getFilteredQuestions(chapter, difficulty))
        setShowSettings(false)
      },
    )
  }

  const startQuiz = () => {
    if (questions.length === 0) {
      setQuestions(getFilteredQuestions(chapter, difficulty, 10))
    }
    setShowSettings(false)
    setCurrentIdx(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setResult(null)
  }

  const handleAnswer = (idx: number) => {
    if (answered) return
    setSelectedAnswer(idx)
  }

  const confirmAnswer = () => {
    if (selectedAnswer === null) return
    setAnswered(true)

    const q = questions[currentIdx]
    const isCorrect = selectedAnswer === q.correctIndex

    // Save to wrong answer book
    if (!isCorrect) {
      saveWrongAnswer(q, selectedAnswer)
    }
  }

  const nextQuestion = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1)
      setSelectedAnswer(null)
      setAnswered(false)
    } else {
      // Show results
      let correctCount = 0
      const wrong: QuizResult['wrong'] = []
      for (let i = 0; i < questions.length; i++) {
        const answer = sessionStorage.getItem(`quiz-answer-${i}`)
        if (answer) {
          const ansIdx = parseInt(answer)
          if (ansIdx === questions[i].correctIndex) {
            correctCount++
          } else {
            wrong.push({
              question: questions[i].question,
              yourAnswer: questions[i].options[ansIdx] || '未作答',
              correctAnswer: questions[i].options[questions[i].correctIndex],
              explanation: questions[i].explanation,
              chapter: questions[i].chapter,
              difficulty: questions[i].difficulty,
            })
          }
        }
      }

      setResult({ total: questions.length, correct: correctCount, wrong })
    }
  }

  const saveWrongAnswer = (q: QuizQuestion, selectedIdx: number) => {
    try {
      const existing = JSON.parse(localStorage.getItem('wrong-answers') || '[]')
      const wrongAnswer = {
        id: Date.now().toString(),
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        yourAnswer: selectedIdx,
        explanation: q.explanation,
        chapter: q.chapter,
        difficulty: q.difficulty,
        timestamp: new Date().toISOString(),
      }
      // Avoid duplicates
      const filtered = existing.filter((w: Record<string, unknown>) => w.question !== q.question)
      filtered.push(wrongAnswer)
      localStorage.setItem('wrong-answers', JSON.stringify(filtered))
    } catch { /* ignore */ }
  }

  const retryWrong = () => {
    if (!result) return
    const wrongQuestions = result.wrong.map(w => {
      const q = questions.find(q => q.question === w.question)
      return q
    }).filter(Boolean) as QuizQuestion[]

    if (wrongQuestions.length > 0) {
      setQuestions(wrongQuestions)
      setCurrentIdx(0)
      setSelectedAnswer(null)
      setAnswered(false)
      setResult(null)
    }
  }

  const resetQuiz = () => {
    setShowSettings(true)
    setQuestions([])
    setCurrentIdx(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setResult(null)
    for (let i = 0; i < 100; i++) {
      sessionStorage.removeItem(`quiz-answer-${i}`)
    }
  }

  /** 根据本轮练习结果诊断薄弱知识点，更新到画像 + 安排间隔重复复习 */
  const diagnoseWeakPoints = async (result: QuizResult) => {
    // 统计各章节错误率
    const chapterStats: Record<string, { total: number; wrong: number }> = {}
    for (const w of result.wrong) {
      const ch = w.chapter || '通用'
      if (!chapterStats[ch]) chapterStats[ch] = { total: 0, wrong: 0 }
      chapterStats[ch].wrong++
    }
    for (const q of questions) {
      const ch = q.chapter || '通用'
      if (!chapterStats[ch]) chapterStats[ch] = { total: 0, wrong: 0 }
      chapterStats[ch].total++
    }

    // H44: 为每个有错题的章节安排间隔重复复习
    for (const [ch, stats] of Object.entries(chapterStats)) {
      if (stats.wrong > 0) {
        const errorRate = stats.wrong / stats.total;
        // quality: 错误率越高 → 掌握度越低 → 复习间隔越短
        const quality = Math.max(0, Math.round(5 * (1 - errorRate)));
        scheduleReview(ch, ch, quality);
      }
    }

    // 选出错误率 > 50% 的章节作为薄弱点
    const newWeakPoints = Object.entries(chapterStats)
      .filter(([, s]) => s.total >= 2 && s.wrong / s.total > 0.5)
      .map(([ch]) => ch)

    if (newWeakPoints.length === 0) return

    // 与现有 weak_points 合并去重
    const existing = profile?.weak_points || []
    const merged = [...new Set([...existing, ...newWeakPoints])]
    try {
      await updateProfile({ weak_points: merged })
      setProfile({ ...profile!, weak_points: merged }, user?.username)
    } catch { /* fallback to local */ }
  }

  // Record answer on confirm
  useEffect(() => {
    if (answered && selectedAnswer !== null) {
      sessionStorage.setItem(`quiz-answer-${currentIdx}`, String(selectedAnswer))
    }
  }, [answered, currentIdx, selectedAnswer])

  // 练习完成后自动诊断薄弱点
  useEffect(() => {
    if (result && result.wrong.length > 0) {
      diagnoseWeakPoints(result)
    }
  }, [result])

  const currentQuestion = questions[currentIdx]
  const progress = questions.length > 0 ? ((currentIdx) / questions.length) * 100 : 0

  // Render settings screen
  if (showSettings) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">✏️</div>
          <h1 className="text-xl font-semibold text-ink">在线练习</h1>
          <p className="text-sm text-muted mt-1">
            {generationMode === 'search'
              ? '输入任意知识点，AI 自动搜索并生成练习题'
              : '选择章节和难度，生成个性化练习题'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
          {/* 模式选择标签 */}
          <div className="flex rounded-lg bg-cream p-1">
            <button
              onClick={() => setGenerationMode('chapter')}
              className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${
                generationMode === 'chapter'
                  ? 'bg-white text-ink font-medium shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              📚 章节练习
            </button>
            <button
              onClick={() => setGenerationMode('search')}
              className={`flex-1 px-4 py-2 rounded-md text-sm transition-colors ${
                generationMode === 'search'
                  ? 'bg-white text-ink font-medium shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              🔍 AI 搜索出题
            </button>
          </div>

          {/* 章节模式 */}
          {generationMode === 'chapter' && (
            <div>
              <label className="block text-sm font-medium text-ink mb-2">选择章节</label>
              <select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                {CHAPTERS.map((ch) => (
                  <option key={ch.value} value={ch.value}>{ch.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* AI 搜索模式 */}
          {generationMode === 'search' && (
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                输入知识点或问题
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTopic}
                  onChange={(e) => setSearchTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchTopic.trim()) generateQuiz()
                  }}
                  placeholder="例如：反向传播算法、CNN中的Batch Normalization、Python装饰器…"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-white text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-ink/20 pr-12"
                />
                {searchTopic && (
                  <button
                    onClick={() => setSearchTopic('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-muted mt-2">
                💡 AI 会检索课程知识库 + 联网搜索相关资料，然后生成针对性练习题
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink mb-2">难度级别</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    difficulty === d.value
                      ? 'bg-ink text-warm-white'
                      : 'bg-cream text-muted hover:bg-cream/80'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {questions.length > 0 && (
            <div className="text-center text-sm text-muted">
              已有 {questions.length} 道题可用
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={startQuiz}
              className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
            >
              开始练习
            </button>
            <button
              onClick={generateQuiz}
              disabled={generating || (generationMode === 'search' && !searchTopic.trim())}
              className="flex-1 px-6 py-3 border border-border text-sm rounded-lg hover:bg-cream transition-colors disabled:opacity-50"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  生成中...
                </span>
              ) : (
                <span>{generationMode === 'search' ? '🔍 AI 搜索生成' : 'AI 生成新题'}</span>
              )}
            </button>
          </div>
        </div>

        {generating && genText && (
          <div className="mt-4 p-4 rounded-lg border border-border bg-surface text-sm text-muted max-h-60 overflow-y-auto">
            {genText}
          </div>
        )}
      </div>
    )
  }

  // Render results
  if (result) {
    const score = Math.round((result.correct / result.total) * 100)
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{score >= 80 ? '🎉' : score >= 60 ? '👍' : '💪'}</div>
          <h1 className="text-xl font-semibold text-ink">练习完成</h1>
          <p className="text-sm text-muted mt-1">来看看你的表现</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 mb-6">
          <div className="flex items-center justify-center mb-6">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E8E4DF" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke={score >= 80 ? '#059669' : score >= 60 ? '#C77D43' : '#EF4444'}
                  strokeWidth="3"
                  strokeDasharray={`${score} ${100 - score}`}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-ink">{score}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-semibold text-ink">{result.total}</div>
              <div className="text-xs text-muted">总题数</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-600">{result.correct}</div>
              <div className="text-xs text-muted">正确</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-500">{result.wrong.length}</div>
              <div className="text-xs text-muted">错误</div>
            </div>
          </div>
        </div>

        {result.wrong.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-6 mb-6">
            <h2 className="text-sm font-medium text-ink mb-4">错题回顾</h2>
            <div className="space-y-4">
              {result.wrong.map((w, i) => (
                <div key={i} className="p-4 rounded-lg bg-red-50/50 border border-red-100">
                  <p className="text-sm font-medium text-ink mb-2">{i + 1}. {w.question}</p>
                  <p className="text-xs text-red-500 mb-1">你的答案：{w.yourAnswer}</p>
                  <p className="text-xs text-emerald-600 mb-1">正确答案：{w.correctAnswer}</p>
                  {w.explanation && (
                    <p className="text-xs text-muted mt-2">💡 {w.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {result.wrong.length > 0 && (
            <button
              onClick={retryWrong}
              className="flex-1 px-6 py-3 border border-border text-sm rounded-lg hover:bg-cream transition-colors"
            >
              重做错题
            </button>
          )}
          <button
            onClick={resetQuiz}
            className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
          >
            继续练习
          </button>
        </div>
      </div>
    )
  }

  // Render current question
  if (!currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center">
        <p className="text-muted">暂无题目</p>
        <button onClick={resetQuiz} className="mt-4 px-6 py-2 bg-ink text-warm-white rounded-lg text-sm">
          返回设置
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">
            第 {currentIdx + 1}/{questions.length} 题
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              {quizMode === 'exam' ? '考试模式' : '练习模式'}
            </span>
            <button onClick={resetQuiz} className="text-xs text-muted hover:text-ink">退出</button>
          </div>
        </div>
        <div className="h-1.5 bg-cream rounded-full overflow-hidden">
          <div
            className="h-full bg-ink rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-border bg-surface p-6 mb-4">
        <div className="flex items-start gap-3 mb-6">
          <span className="w-8 h-8 rounded-lg bg-ink/10 text-ink font-semibold text-sm flex items-center justify-center flex-shrink-0">
            {currentIdx + 1}
          </span>
          <h2 className="text-base font-medium text-ink leading-relaxed">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Chapter & difficulty tags */}
        <div className="flex gap-2 mb-4">
          <span className="text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted">
            {currentQuestion.chapter || '通用'}
          </span>
          <span className="text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted">
            {currentQuestion.difficulty >= 0.7 ? '困难' : currentQuestion.difficulty >= 0.4 ? '中等' : '简单'}
          </span>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {currentQuestion.options.map((opt, idx) => {
            let borderColor = 'border-border'
            let bgColor = 'hover:bg-cream'
            let textColor = 'text-ink'

            if (answered) {
              if (idx === currentQuestion.correctIndex) {
                borderColor = 'border-emerald-400'
                bgColor = 'bg-emerald-50'
                textColor = 'text-emerald-700'
              } else if (idx === selectedAnswer) {
                borderColor = 'border-red-300'
                bgColor = 'bg-red-50'
                textColor = 'text-red-600'
              } else {
                borderColor = 'border-border'
                bgColor = ''
                textColor = 'text-muted'
              }
            } else if (idx === selectedAnswer) {
              borderColor = 'border-ink'
              bgColor = 'bg-ink/5'
            }

            const letter = String.fromCharCode(65 + idx)
            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={answered}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${borderColor} ${bgColor} ${textColor}`}
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                  ${answered && idx === currentQuestion.correctIndex
                    ? 'bg-emerald-500 text-white'
                    : answered && idx === selectedAnswer
                    ? 'bg-red-400 text-white'
                    : idx === selectedAnswer
                    ? 'bg-ink text-warm-white'
                    : 'bg-cream text-muted'
                  }`}
                >
                  {answered && idx === currentQuestion.correctIndex ? '✓' : answered && idx === selectedAnswer ? '✗' : letter}
                </span>
                <span className="text-[14px]">{opt}</span>
              </button>
            )
          })}
        </div>

        {/* Explanation */}
        {answered && currentQuestion.explanation && (
          <div className="mt-4 p-4 rounded-lg bg-amber/5 border border-amber/20">
            <p className="text-sm text-muted">💡 {currentQuestion.explanation}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!answered ? (
          <button
            onClick={confirmAnswer}
            disabled={selectedAnswer === null}
            className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
          >
            确认答案
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            className="flex-1 px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors"
          >
            {currentIdx < questions.length - 1 ? '下一题 →' : '查看结果'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * 尝试从 AI 输出的 JSON（包括 ```json 代码块）中提取题目
 */
function tryParseQuizJSON(text: string, chapter: string, difficulty: number): QuizQuestion[] {
  const qs: QuizQuestion[] = []

  // 提取 JSON 数组（从 ```json ... ``` 代码块或原始文本中）
  let jsonStr = ''
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  } else {
    // 尝试直接找到 JSON 数组
    const arrMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (arrMatch) {
      jsonStr = arrMatch[0]
    }
  }

  if (!jsonStr) return qs

  try {
    const parsed = JSON.parse(jsonStr)
    const items = Array.isArray(parsed) ? parsed : [parsed]

    for (const item of items) {
      if (!item || typeof item !== 'object') continue

      // 兼容多种 JSON 字段名
      const questionText =
        item.question || item.title || item.topic || item['题目'] || ''
      const options: string[] =
        item.options || item.choices || item.answers || item['选项'] || []

      if (!questionText || options.length < 2) continue

      // 确定正确答案索引
      let correctIndex = 0
      const correctAnswer = item.correct || item.correctIndex || item.answer || item['答案']
      if (correctAnswer !== undefined && correctAnswer !== null) {
        if (typeof correctAnswer === 'number') {
          correctIndex = correctAnswer
        } else if (typeof correctAnswer === 'string') {
          // "A"/"B"/"C"/"D" → index
          const ch = correctAnswer.trim().toUpperCase().charCodeAt(0) - 65
          if (ch >= 0 && ch < options.length) {
            correctIndex = ch
          }
        }
      }

      qs.push({
        id: `q-${qs.length}`,
        question: questionText,
        options: options.slice(0, 4),
        correctIndex,
        explanation:
          item.explanation || item.analysis || item['解析'] || item['解释'] || '',
        chapter: item.chapter || chapter,
        difficulty: item.difficulty || difficulty,
      })
    }
  } catch {
    // JSON parse failed — not JSON format
  }

  return qs
}

/**
 * 从 AI 流式生成的 Markdown 文本中直接解析题目（无需等待资源入库）
 */
function parseQuizFromMarkdownDirect(text: string, chapter: string, difficulty: number): QuizQuestion[] {
  const qs: QuizQuestion[] = []
  const lines = text.split('\n')
  let current: { question: string; options: string[]; correctIndex: number; explanation: string } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Match bold numbered questions: **1. xxx** or **1、xxx**
    const boldQMatch = trimmed.match(/^\*\*?\s*(\d+)[\.\、\)]\s*(.+?)\*?\*?$/)
    // Match plain numbered: 1. xxx, 1、xxx, 1) xxx
    const plainQMatch = trimmed.match(/^(\d+)[\.\、\)]\s*(.+)/)
    // Match option lines removing bold: **A. xxx** or A. xxx
    const boldOptMatch = trimmed.match(/^\*?\*?([A-D])[\.\、\)\s]\s*(.+?)\*?\*?$/)
    const optMatch = trimmed.match(/^([A-D])[\.\、\)\s]\s*(.+)/)
    // Match answer
    const answerMatch = trimmed.match(/(?:答案|正确答案|Answer)[：:]\s*([A-D])/i)
    // Match explanation
    const explMatch = trimmed.match(/(?:解析|解释|Explanation)[：:]\s*(.+)/i)

    const qMatch = boldQMatch || plainQMatch

    if (qMatch) {
      if (current && current.question && current.options.length >= 2) {
        qs.push({
          id: `q-${qs.length}`,
          question: current.question,
          options: current.options.length === 2 ? [...current.options, '', ''] : current.options.slice(0, 4),
          correctIndex: current.correctIndex,
          explanation: current.explanation,
          chapter,
          difficulty,
        })
      }
      current = { question: qMatch[2].trim().replace(/\*\*/g, ''), options: [], correctIndex: 0, explanation: '' }
    } else if ((boldOptMatch || optMatch) && current) {
      const m = boldOptMatch || optMatch!
      current.options.push(m[2].trim().replace(/\*\*/g, ''))
    } else if (answerMatch && current) {
      current.correctIndex = answerMatch[1].charCodeAt(0) - 65
    } else if (explMatch && current) {
      current.explanation = explMatch[1].trim()
    }
  }

  if (current && current.question && current.options.length >= 2) {
    qs.push({
      id: `q-${qs.length}`,
      question: current.question,
      options: current.options.length === 2 ? [...current.options, '', ''] : current.options.slice(0, 4),
      correctIndex: current.correctIndex,
      explanation: current.explanation,
      chapter,
      difficulty,
    })
  }

  return qs
}
