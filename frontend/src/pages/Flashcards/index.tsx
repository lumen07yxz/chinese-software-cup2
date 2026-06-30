import { useState, useEffect, useCallback } from 'react'
import {
  fetchDueFlashcards,
  fetchAllFlashcards,
  fetchFlashcardStats,
  reviewFlashcard,
  generateFlashcards,
} from '../../services/api'

interface Flashcard {
  card_id: number
  front: string
  back: string
  concept_id: string
  topic: string
  ease_factor: number
  interval_days: number
  review_count: number
  next_review_at?: string
  is_due?: boolean
}

interface FlashcardStats {
  total_cards: number
  due_reviews: number
  avg_ease_factor: number
  total_reviews: number
  estimated_minutes: number
}

/** SM-2 质量等级 */
const QUALITY_OPTIONS = [
  { q: 1, label: '忘了', emoji: '😵', color: 'bg-red-500 hover:bg-red-600 text-white' },
  { q: 2, label: '模糊', emoji: '😟', color: 'bg-orange-500 hover:bg-orange-600 text-white' },
  { q: 3, label: '想起', emoji: '😐', color: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  { q: 4, label: '记得', emoji: '😊', color: 'bg-blue-500 hover:bg-blue-600 text-white' },
  { q: 5, label: '熟练', emoji: '🤩', color: 'bg-green-500 hover:bg-green-600 text-white' },
]

const COUNT_OPTIONS = [3, 5, 8, 10, 15]

type TabKey = 'review' | 'collection'

export default function FlashcardsPage() {
  const [tab, setTab] = useState<TabKey>('review')
  const [dueCards, setDueCards] = useState<Flashcard[]>([])
  const [allCards, setAllCards] = useState<Flashcard[]>([])
  const [stats, setStats] = useState<FlashcardStats | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sessionDone, setSessionDone] = useState(0)
  const [sessionTotal, setSessionTotal] = useState(0)
  const [genTopic, setGenTopic] = useState('')
  const [genContent, setGenContent] = useState('')
  const [genCount, setGenCount] = useState(5)
  const [showGen, setShowGen] = useState(false)
  const [genError, setGenError] = useState('')
  const [genSuccess, setGenSuccess] = useState(0)
  const [expandedCard, setExpandedCard] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [dueRes, allRes, statsRes] = await Promise.all([
        fetchDueFlashcards(),
        fetchAllFlashcards(),
        fetchFlashcardStats(),
      ])
      setDueCards(dueRes.cards || [])
      setAllCards(allRes.cards || [])
      setStats(statsRes)
      if (sessionTotal === 0) setSessionTotal((dueRes.cards || []).length)
    } catch { /* ignore */ }
    setLoading(false)
  }, [sessionTotal])

  useEffect(() => { loadData() }, [loadData])

  const activeCards = tab === 'review' ? dueCards : allCards
  const currentCard = dueCards[currentIdx]

  const handleReview = async (quality: number) => {
    if (!currentCard) return
    setSessionDone((d) => d + 1)
    setFlipped(false)
    try {
      await reviewFlashcard({ card_id: currentCard.card_id, quality })
    } catch { /* ignore */ }
    if (currentIdx < dueCards.length - 1) {
      setTimeout(() => setCurrentIdx((i) => i + 1), 200)
    } else {
      const res = await fetchDueFlashcards()
      setDueCards(res.cards || [])
      setCurrentIdx(0)
      setSessionTotal(res.cards?.length || 0)
      setSessionDone(0)
      // 同步刷新全部卡片
      const allRes = await fetchAllFlashcards()
      setAllCards(allRes.cards || [])
    }
  }

  const handleGenerate = async () => {
    if (!genTopic.trim()) return
    setGenerating(true)
    setGenError('')
    setGenSuccess(0)
    try {
      const res = await generateFlashcards({
        topic: genTopic,
        content: genContent || genTopic,
        count: genCount,
      })
      if (res.cards && res.cards.length > 0) {
        setGenSuccess(res.cards.length)
        setGenTopic('')
        setGenContent('')
        await loadData()
        setTimeout(() => { setShowGen(false); setGenSuccess(0) }, 1500)
      } else {
        setGenError('未能生成闪卡，请尝试提供更详细的内容')
      }
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    }
    setGenerating(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            🃏 概念闪卡
          </h1>
          <p className="text-gray-500 text-sm mt-1">间隔重复，让知识真正记住</p>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: '总卡片数', value: stats.total_cards, icon: '📦' },
              { label: '待复习', value: stats.due_reviews, icon: '⏰' },
              { label: '已复习', value: stats.total_reviews, icon: '✅' },
              { label: '预计耗时', value: `${stats.estimated_minutes}分`, icon: '⏱' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                <div className="text-lg">{s.icon}</div>
                <div className="text-lg font-bold text-gray-800">{s.value}</div>
                <div className="text-[11px] text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {([
            { key: 'review' as TabKey, label: `待复习 (${dueCards.length})`, icon: '🔄' },
            { key: 'collection' as TabKey, label: `卡片库 (${allCards.length})`, icon: '📚' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFlipped(false); setCurrentIdx(0); setSessionDone(0) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Session progress (review tab) */}
        {tab === 'review' && sessionTotal > 0 && dueCards.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>本次进度</span>
              <span>{sessionDone} / {sessionTotal}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${sessionTotal > 0 ? (sessionDone / sessionTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 主内容区 ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="animate-pulse text-gray-300 text-4xl mb-3">🃏</div>
            <p className="text-gray-400 text-sm">加载闪卡中...</p>
          </div>
        ) : tab === 'review' ? (
          /* ── 复习模式 ── */
          dueCards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="text-5xl mb-4">
                {stats && stats.total_cards > 0 ? '🎉' : '🃏'}
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                {stats && stats.total_cards > 0 ? '今日复习已完成！' : '暂无闪卡'}
              </h2>
              <p className="text-gray-400 text-sm mb-5">
                {stats && stats.total_cards > 0
                  ? '所有闪卡都已复习，明天再来巩固吧'
                  : '生成一些闪卡来开始间隔复习'}
              </p>
              <button
                onClick={() => setShowGen(true)}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                ✨ 生成闪卡
              </button>
            </div>
          ) : (
            <>
              {/* Flip card */}
              <div
                className="relative cursor-pointer mb-6"
                onClick={() => setFlipped(!flipped)}
                style={{ perspective: 1200 }}
              >
                <div
                  className={`relative w-full min-h-[280px] transition-all duration-700 [transform-style:preserve-3d] ${
                    flipped ? '[transform:rotateY(180deg)]' : ''
                  }`}
                  style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                  {/* 正面 */}
                  <div className="absolute inset-0 [backface-visibility:hidden] bg-white rounded-2xl p-8 flex flex-col items-center justify-center shadow-lg shadow-indigo-100/50 border border-indigo-50">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 rounded-t-2xl" />
                    <div className="text-[10px] text-indigo-400 font-semibold mb-4 uppercase tracking-[0.15em]">问题</div>
                    <p className="text-lg text-gray-800 text-center leading-relaxed whitespace-pre-wrap font-medium">{currentCard.front}</p>
                    <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-300">
                      <span className="inline-block w-4 h-4 border border-gray-200 rounded-full animate-pulse" />
                      点击翻转
                    </div>
                    {currentCard.concept_id && (
                      <div className="mt-3 px-3 py-1 bg-indigo-50 text-indigo-500 text-[11px] rounded-full font-medium">{currentCard.concept_id}</div>
                    )}
                  </div>
                  {/* 背面 */}
                  <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl p-8 flex flex-col items-center justify-center shadow-lg shadow-purple-100/50 border border-purple-100">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 rounded-t-2xl" />
                    <div className="text-[10px] text-purple-500 font-semibold mb-4 uppercase tracking-[0.15em]">答案</div>
                    <p className="text-base text-gray-800 text-center leading-relaxed whitespace-pre-wrap">{currentCard.back}</p>
                    <div className="mt-6 text-xs text-purple-300">👇 在下方选择掌握程度</div>
                  </div>
                </div>
              </div>

              {/* 评分按钮 */}
              {flipped && (
                <div className="grid grid-cols-5 gap-2 mb-4 animate-[scaleIn_0.3s_ease-out]">
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.q}
                      onClick={(e) => { e.stopPropagation(); handleReview(opt.q) }}
                      className={`flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-xs font-medium transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 ${opt.color}`}
                    >
                      <span className="text-xl">{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="text-center text-xs text-gray-400">
                第 {currentIdx + 1} 张 / 共 {dueCards.length} 张待复习
              </div>
            </>
          )
        ) : (
          /* ── 卡片库 ── */
          allCards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="text-5xl mb-4">📚</div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">卡片库为空</h2>
              <p className="text-gray-400 text-sm mb-5">生成闪卡后会自动保存到这里</p>
              <button
                onClick={() => setShowGen(true)}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                ✨ 生成第一批闪卡
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {allCards.map((card) => (
                <div
                  key={card.card_id}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow"
                >
                  <button
                    onClick={() => setExpandedCard(expandedCard === card.card_id ? null : card.card_id)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 line-clamp-2">{card.front}</p>
                        {expandedCard !== card.card_id && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{card.back}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {card.is_due && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">待复习</span>
                        )}
                        <span className="text-gray-300 text-xs">{expandedCard === card.card_id ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  </button>

                  {expandedCard === card.card_id && (
                    <div className="px-4 pb-4 border-t border-gray-50 animate-[fadeIn_0.2s_ease-out]">
                      <div className="mt-3 p-3 bg-indigo-50/50 rounded-lg">
                        <div className="text-[11px] text-indigo-500 font-medium mb-1">答案</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{card.back}</p>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
                        {card.topic && <span>📂 {card.topic}</span>}
                        {card.concept_id && <span>💡 {card.concept_id}</span>}
                        <span>🔄 已复习 {card.review_count} 次</span>
                        <span>📊 间隔 {card.interval_days} 天</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── 生成弹窗 ── */}
        {showGen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">✨ 生成闪卡</h3>

              {genSuccess > 0 ? (
                <div className="py-8 text-center animate-[fadeIn_0.3s_ease-out]">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-green-600 font-medium">成功生成 {genSuccess} 张闪卡！</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">主题 *</label>
                    <input
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      placeholder="如：梯度下降、Transformer、过拟合"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">相关内容（可选）</label>
                    <textarea
                      value={genContent}
                      onChange={(e) => setGenContent(e.target.value)}
                      placeholder="粘贴教材内容或笔记，AI 会从中提取关键概念"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">生成数量</label>
                    <div className="flex gap-2">
                      {COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setGenCount(n)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border ${
                            genCount === n
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          {n} 张
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {genError && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
                  {genError}
                </div>
              )}

              {genSuccess === 0 && (
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => { setShowGen(false); setGenError(''); setGenSuccess(0) }}
                    className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!genTopic.trim() || generating}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors disabled:opacity-50"
                  >
                    {generating ? '生成中...' : `生成 ${genCount} 张`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating generate button */}
        {!showGen && (
          <button
            onClick={() => setShowGen(true)}
            className="fixed bottom-6 right-6 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors flex items-center justify-center text-xl z-40"
            title="生成新闪卡"
          >
            ✨
          </button>
        )}
      </div>
    </div>
  )
}
