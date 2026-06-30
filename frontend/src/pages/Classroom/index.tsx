import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useClassroomStore, PHASE_ORDER, PHASE_LABELS, type ClassroomPhase } from '../../stores/classroomStore'
import {
  fetchClassroomOutline,
  startClassroom,
  submitClassroomPractice,
  saveCourse,
  fetchSavedCourses,
  completeCourseLesson,
  deleteSavedCourse,
  type ClassroomQuestion,
  type CourseLesson,
  type SavedCourse,
} from '../../services/api'
import FeynmanPanel from '../../components/FeynmanPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import CodeBlock from '../../components/CodeBlock'

/** 快捷主题 */
const QUICK_TOPICS = [
  { title: 'Java 编程', desc: '从零开始学 Java，面向对象编程到高级特性' },
  { title: 'Python 数据分析', desc: 'Pandas、NumPy、数据可视化实战' },
  { title: '机器学习', desc: '监督学习、无监督学习、模型评估' },
  { title: '前端开发', desc: 'HTML/CSS/JavaScript 到 React 框架' },
  { title: '数据库原理', desc: 'SQL、关系模型、索引优化' },
  { title: '算法与数据结构', desc: '排序、搜索、图算法、动态规划' },
  { title: '计算机网络', desc: 'TCP/IP、HTTP、网络安全基础' },
  { title: '操作系统', desc: '进程管理、内存管理、文件系统' },
]

export default function ClassroomPage() {
  const { nodeId } = useParams<{ nodeId?: string }>()
  const navigate = useNavigate()
  const store = useClassroomStore()
  const {
    mode, courseTopic, courseDescription, outline, selectedLesson, selectedLessonIdx,
    phase, topic, content, questions, practiceAnswers, error, startedAt,
    feynmanConcepts, feynmanIdx, feynmanResults,
    setMode, setCourseTopic, setCourseDescription, setOutline, selectLesson,
    setPhase, setTopic, appendContent, setQuestions, setAnswer, setError, reset, start,
    goNextLesson, backToOutline, startFeynmanPhase, completeFeynmanConcept, skipFeynmanConcept,
  } = store

  const [inputTopic, setInputTopic] = useState('')
  const [inputDesc, setInputDesc] = useState('')
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineError, setOutlineError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [scoreResult, setScoreResult] = useState<{ correct: number; total: number; weak: unknown[] } | null>(null)
  const startedRef = useRef(false)
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([])
  const [currentCourseId, setCurrentCourseId] = useState<number | null>(null)
  const [savedHint, setSavedHint] = useState('')
  const markedCompleteRef = useRef(false)

  // 加载已保存的课程
  const loadSavedCourses = useCallback(async () => {
    try {
      const res = await fetchSavedCourses()
      setSavedCourses(res.courses || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadSavedCourses() }, [loadSavedCourses])

  // 课堂完成时自动标记课程进度
  useEffect(() => {
    if (phase === 'complete' && currentCourseId && selectedLesson && !markedCompleteRef.current) {
      markedCompleteRef.current = true
      completeCourseLesson({ course_id: currentCourseId, lesson_title: selectedLesson.title })
        .then(() => loadSavedCourses())
        .catch(() => {})
    }
  }, [phase, currentCourseId, selectedLesson, loadSavedCourses])

  // ── 从讲课内容提取关键概念，进入费曼学习 ──
  const handleClassComplete = useCallback(() => {
    const lectureText = content.lecture || ''
    // 从 Markdown 标题和加粗文本中提取概念
    const concepts: string[] = []
    const headingRegex = /#{2,3}\s+(.+)/g
    const boldRegex = /\*\*(.+?)\*\*/g
    let m
    while ((m = headingRegex.exec(lectureText)) !== null) {
      const t = m[1].replace(/[*_`]/g, '').trim()
      if (t.length > 2 && t.length < 30 && !concepts.includes(t)) concepts.push(t)
    }
    while ((m = boldRegex.exec(lectureText)) !== null) {
      const t = m[1].replace(/[*_`]/g, '').trim()
      if (t.length > 2 && t.length < 20 && !concepts.includes(t)) concepts.push(t)
    }
    // 取前 2 个核心概念进行费曼学习
    const topConcepts = concepts.slice(0, 2)
    if (topConcepts.length > 0) {
      startFeynmanPhase(topConcepts)
    } else {
      setPhase('complete')
    }
  }, [content, startFeynmanPhase, setPhase])

  // 从学习路径节点进入时，自动跳过选择直接生成大纲
  useEffect(() => {
    if (nodeId && !startedRef.current) {
      startedRef.current = true
      setMode('class')
      start('')
      startClassroom(
        { node_id: nodeId },
        (p, top) => { setPhase(p as ClassroomPhase); if (top) setTopic(top) },
        (p, chunk) => appendContent(p, chunk),
        () => {},
        (qs) => setQuestions(qs),
        () => handleClassComplete(),
        (err) => setError(err),
      )
    }
    return () => { if (!nodeId) reset() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  // ── 生成课程大纲（自动保存） ──
  const handleGenerateOutline = async () => {
    if (!inputTopic.trim()) return
    setOutlineLoading(true)
    setOutlineError('')
    try {
      const res = await fetchClassroomOutline({ topic: inputTopic.trim(), description: inputDesc.trim() })
      setCourseTopic(res.topic)
      setOutline(res.outline || [])
      // 自动生成后自动保存
      try {
        const saveRes = await saveCourse({ topic: res.topic, description: inputDesc.trim(), outline: res.outline || [] })
        setCurrentCourseId(saveRes.course_id)
        setSavedHint('课程已自动保存 ✓')
        setTimeout(() => setSavedHint(''), 2000)
        await loadSavedCourses()
      } catch { /* 保存失败不影响浏览 */ }
    } catch (e: unknown) {
      setOutlineError(e instanceof Error ? e.message : '大纲生成失败')
    }
    setOutlineLoading(false)
  }

  // ── 继续已保存的课程 ──
  const handleResumeCourse = (course: SavedCourse) => {
    setCourseTopic(course.topic)
    setInputDesc(course.description)
    setOutline(course.outline || [])
    setCurrentCourseId(course.id)
    setMode('outline')
  }

  // ── 删除已保存的课程 ──
  const handleDeleteCourse = async (courseId: number) => {
    try {
      await deleteSavedCourse(courseId)
      await loadSavedCourses()
    } catch { /* ignore */ }
  }

  // ── 选择课程开始上课 ──
  const handleSelectLesson = (lesson: CourseLesson, idx: number) => {
    setSubmitted(false)
    setScoreResult(null)
    markedCompleteRef.current = false
    selectLesson(lesson, idx)
    // 启动课堂 SSE
    startedRef.current = false
    setTimeout(() => {
      startClassroom(
        { topic: courseTopic || inputTopic, lesson_title: lesson.title, lesson_description: lesson.description },
        (p, top) => { setPhase(p as ClassroomPhase); if (top) setTopic(top) },
        (p, chunk) => appendContent(p, chunk),
        () => {},
        (qs) => setQuestions(qs),
        () => handleClassComplete(),
        (err) => setError(err),
      )
    }, 50)
  }

  // ── 提交练习 ──
  const handleSubmitPractice = async () => {
    let correct = 0
    const results = questions.map((q, i) => {
      const ans = practiceAnswers[i] || ''
      const isCorrect = ans.trim() === (q.answer || '').trim()
      if (isCorrect) correct++
      return { concept_id: q.concept_id, correct: isCorrect, question: q.question }
    })
    setSubmitted(true)
    setScoreResult({ correct, total: questions.length, weak: [] })
    try {
      const res = await submitClassroomPractice(results)
      setScoreResult({ correct, total: questions.length, weak: res.weak_concepts || [] })
    } catch { /* keep local score */ }
  }

  const elapsedMin = startedAt ? Math.floor((Date.now() - startedAt) / 60000) : 0

  // ══════════════════════════════════════════════════════════════
  //  模式 1: 主题选择
  // ══════════════════════════════════════════════════════════════
  if (mode === 'select' && !nodeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="mb-8 text-center">
            <div className="text-5xl mb-3">🎓</div>
            <h1 className="text-2xl font-bold text-gray-800">AI 智能课堂</h1>
            <p className="text-gray-500 text-sm mt-2">输入你想学的任何主题，AI 为你设计课程并授课</p>
          </div>

          {/* 主题输入 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
            <label className="text-sm font-medium text-gray-700 mb-2 block">你想学什么？</label>
            <input
              value={inputTopic}
              onChange={(e) => setInputTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !outlineLoading && handleGenerateOutline()}
              placeholder="输入任意主题，如：Java 编程、机器学习、计算机网络..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            />
            <div className="mt-3">
              <label className="text-xs text-gray-400 mb-1 block">补充说明（可选）</label>
              <textarea
                value={inputDesc}
                onChange={(e) => setInputDesc(e.target.value)}
                placeholder="例如：我有 Python 基础，想学 Java 面向对象部分"
                rows={2}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all"
              />
            </div>
            {outlineError && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
                {outlineError}
              </div>
            )}
            <button
              onClick={handleGenerateOutline}
              disabled={!inputTopic.trim() || outlineLoading}
              className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {outlineLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  AI 正在设计课程大纲...
                </span>
              ) : '🚀 生成课程大纲'}
            </button>
            {savedHint && (
              <p className="mt-2 text-center text-xs text-green-600 animate-[fadeIn_0.3s_ease-out]">{savedHint}</p>
            )}
          </div>

          {/* 快捷主题 */}
          <div>
            <h3 className="text-xs text-gray-400 mb-3 text-center">或者选择热门主题</h3>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_TOPICS.map((t) => (
                <button
                  key={t.title}
                  onClick={() => { setInputTopic(t.title); setInputDesc(t.desc) }}
                  className="text-left p-4 bg-white rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all group"
                >
                  <div className="text-sm font-medium text-gray-800 group-hover:text-indigo-600 transition-colors">{t.title}</div>
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 已保存的课程 */}
          {savedCourses.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-600 mb-3">📚 我的课程</h3>
              <div className="space-y-3">
                {savedCourses.map((course) => {
                  const progress = course.total > 0 ? Math.round((course.completed_count / course.total) * 100) : 0
                  return (
                    <div key={course.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => handleResumeCourse(course)}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-semibold text-gray-800">{course.topic}</div>
                          {course.description && (
                            <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{course.description}</div>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-gray-400 flex-shrink-0">
                              {course.completed_count}/{course.total} 节课 · {progress}%
                            </span>
                          </div>
                        </button>
                        <button
                          onClick={() => { if (confirm(`确定删除「${course.topic}」课程？`)) handleDeleteCourse(course.id) }}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                          title="删除课程"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  //  模式 2: 课程大纲
  // ══════════════════════════════════════════════════════════════
  if (mode === 'outline') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* 顶栏 */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={reset} className="text-gray-400 hover:text-gray-700 text-sm">← 返回</button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{courseTopic}</h1>
              <p className="text-xs text-gray-400">共 {outline.length} 节课 · 点击开始学习</p>
            </div>
          </div>

          {/* 课程列表 */}
          <div className="space-y-3">
            {outline.map((lesson, i) => {
              // 检查该课程是否已完成
              const savedCourse = savedCourses.find(c => c.id === currentCourseId)
              const isCompleted = savedCourse?.completed_lessons?.includes(lesson.title) || false
              return (
                <button
                  key={i}
                  onClick={() => handleSelectLesson(lesson, i)}
                  className={`w-full text-left bg-white rounded-xl border p-5 hover:shadow-md transition-all group ${
                    isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 hover:border-indigo-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                      isCompleted
                        ? 'bg-green-100 text-green-600'
                        : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'
                    }`}>
                      {isCompleted ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold transition-colors ${
                          isCompleted ? 'text-green-700 line-through' : 'text-gray-800 group-hover:text-indigo-600'
                        }`}>{lesson.title}</span>
                        <span className="text-xs text-gray-300">{lesson.difficulty}</span>
                        {isCompleted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">已完成</span>}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{lesson.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                        <span>⏱ {lesson.duration_min} 分钟</span>
                        {lesson.key_concepts && lesson.key_concepts.length > 0 && (
                          <span>💡 {lesson.key_concepts.slice(0, 3).join(' · ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-300 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 底部提示 */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">选择一节课开始 AI 授课 · 包含导入→讲解→练习→总结完整流程</p>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  //  模式 3: 课堂模式
  // ══════════════════════════════════════════════════════════════

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">课堂启动失败：{error}</p>
          <button
            onClick={() => nodeId ? navigate('/learning-path') : backToOutline()}
            className="mt-3 text-sm text-red-600 underline"
          >
            {nodeId ? '返回学习路径' : '返回课程大纲'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      {/* 课堂顶栏 */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nodeId ? navigate('/learning-path') : backToOutline()}
              className="text-gray-500 hover:text-gray-800 text-sm"
            >
              ← 退出
            </button>
            <span className="text-lg">🎓</span>
            <div className="min-w-0">
              <span className="font-semibold text-gray-800 text-sm block truncate max-w-[200px]">
                {topic || 'AI 课堂'}
              </span>
              {courseTopic && (
                <span className="text-[11px] text-gray-400 block truncate max-w-[200px]">{courseTopic}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>⏱ {elapsedMin}min</span>
            <PhaseIndicator current={phase} />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Warmup */}
        {(phase === 'loading' || phase === 'warmup' || (phase !== 'idle' && content.warmup)) && (
          <PhaseCard phase="warmup" active={phase === 'warmup'} loading={phase === 'loading'} content={content.warmup || ''} />
        )}

        {/* Lecture */}
        {(phase === 'lecture' || content.lecture) && (
          <PhaseCard phase="lecture" active={phase === 'lecture'} content={content.lecture || ''} />
        )}

        {/* Practice */}
        {(phase === 'practice' || questions.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              ✏️ {PHASE_LABELS.practice}
              {questions.length > 0 && <span className="text-xs text-gray-400">（{questions.length} 题）</span>}
            </h2>
            {phase === 'practice' && questions.length === 0 && (
              <p className="text-gray-400 text-sm">正在生成练习题...</p>
            )}
            <div className="space-y-4">
              {questions.map((q, i) => (
                <QuestionCard key={i} index={i} question={q} answer={practiceAnswers[i] || ''} submitted={submitted} onAnswer={(a) => setAnswer(i, a)} />
              ))}
            </div>
            {questions.length > 0 && !submitted && (
              <button onClick={handleSubmitPractice} className="mt-4 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                提交答案
              </button>
            )}
            {scoreResult && (
              <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-100 text-center">
                <p className="text-blue-700 font-medium">
                  得分：{scoreResult.correct} / {scoreResult.total}
                </p>
                <p className="text-xs text-blue-500 mt-1">
                  {scoreResult.correct === scoreResult.total ? '完美！全部正确 🎉' : '继续努力，复习一下错题吧'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Review */}
        {(phase === 'review' || content.review) && (
          <PhaseCard phase="review" active={phase === 'review'} content={content.review || ''} />
        )}

        {/* Feynman */}
        {phase === 'feynman' && feynmanConcepts.length > 0 && feynmanIdx < feynmanConcepts.length && (
          <FeynmanPanel
            concept={feynmanConcepts[feynmanIdx]}
            topic={courseTopic || topic}
            courseId={currentCourseId || undefined}
            onComplete={(concept, understanding) => completeFeynmanConcept(concept, understanding)}
            onSkip={() => skipFeynmanConcept()}
          />
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
            <div className="text-5xl mb-3">🎓</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">下课啦！</h2>
            <p className="text-gray-500 text-sm mb-4">你已完成「{topic}」这节课的学习</p>
            {scoreResult && (
              <p className="text-sm text-gray-600 mb-3">
                课堂练习得分：<span className="font-semibold text-blue-600">{scoreResult.correct}/{scoreResult.total}</span>
              </p>
            )}
            {/* 费曼学习结果 */}
            {Object.keys(feynmanResults).length > 0 && (
              <div className="mb-5 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-xs text-indigo-500 font-medium mb-2">🧠 费曼学习结果</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {Object.entries(feynmanResults).map(([concept, u]) => {
                    const pct = Math.round(u * 100)
                    const emoji = u >= 0.8 ? '🤩' : u >= 0.4 ? '😊' : '🤔'
                    return (
                      <div key={concept} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-indigo-100">
                        <span>{emoji}</span>
                        <span className="text-xs font-medium text-gray-700">{concept}</span>
                        <span className={`text-xs font-bold ${u >= 0.8 ? 'text-green-600' : u >= 0.4 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-center flex-wrap">
              {/* 下一节课按钮（仅大纲模式且有下一节时显示） */}
              {selectedLessonIdx >= 0 && selectedLessonIdx < outline.length - 1 && (
                <button
                  onClick={() => {
                    goNextLesson()
                    const next = outline[selectedLessonIdx + 1]
                    if (next) handleSelectLesson(next, selectedLessonIdx + 1)
                  }}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                  下一节：{outline[selectedLessonIdx + 1]?.title} →
                </button>
              )}
              {!nodeId && outline.length > 0 && (
                <button
                  onClick={backToOutline}
                  className="px-5 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                >
                  📋 返回课程大纲
                </button>
              )}
              <button
                onClick={() => navigate('/quiz')}
                className="px-5 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
              >
                做更多练习
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────────────

function PhaseIndicator({ current }: { current: ClassroomPhase }) {
  const idx = PHASE_ORDER.indexOf(current)
  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((p, i) => (
        <div key={p} className={`w-6 h-1 rounded-full ${i <= idx ? 'bg-blue-500' : 'bg-gray-200'}`} />
      ))}
    </div>
  )
}

function PhaseCard({ phase, active, loading, content }: { phase: string; active: boolean; loading?: boolean; content: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
        {phase === 'warmup' && '🎯'}
        {phase === 'lecture' && '📚'}
        {phase === 'review' && '📝'}
        {PHASE_LABELS[phase] || phase}
        {active && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
      </h2>
      {loading && !content ? (
        <p className="text-gray-400 text-sm">正在准备课堂...</p>
      ) : content ? (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code: CodeBlock as never }}>
            {content}
          </ReactMarkdown>
          {active && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />}
        </div>
      ) : null}
    </div>
  )
}

function QuestionCard({ index, question, answer, submitted, onAnswer }: {
  index: number; question: ClassroomQuestion; answer: string; submitted: boolean; onAnswer: (a: string) => void
}) {
  const isCorrect = submitted && answer.trim() === (question.answer || '').trim()
  return (
    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
      <p className="text-sm font-medium text-gray-800 mb-2">
        {index + 1}. [{question.type === 'choice' ? '选择' : question.type === 'fill' ? '填空' : '简答'}] {question.question}
      </p>
      {question.type === 'choice' && question.options ? (
        <div className="space-y-1.5">
          {question.options.map((opt, i) => {
            const selected = answer === opt
            const showCorrect = submitted && opt === question.answer
            const showWrong = submitted && selected && opt !== question.answer
            return (
              <button
                key={i} disabled={submitted} onClick={() => onAnswer(opt)}
                className={`block w-full text-left px-3 py-1.5 rounded text-sm border transition-colors ${
                  showCorrect ? 'bg-green-50 border-green-300 text-green-700'
                  : showWrong ? 'bg-red-50 border-red-300 text-red-700'
                  : selected ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >{opt}</button>
            )
          })}
        </div>
      ) : (
        <input
          type="text" disabled={submitted} value={answer} onChange={(e) => onAnswer(e.target.value)}
          placeholder="输入你的答案..."
          className={`w-full px-3 py-1.5 rounded border text-sm ${
            submitted ? (isCorrect ? 'bg-green-50 border-green-300 text-green-700' : 'bg-red-50 border-red-300 text-red-700') : 'border-gray-200 focus:border-blue-400'
          }`}
        />
      )}
      {submitted && (
        <div className="mt-2 text-xs text-gray-500">
          <span className={isCorrect ? 'text-green-600' : 'text-red-600'}>{isCorrect ? '✅ 正确' : '❌ 错误'}</span>
          {' · 正确答案：'}{question.answer}
          {question.explanation && <div className="mt-1">{question.explanation}</div>}
        </div>
      )}
    </div>
  )
}
