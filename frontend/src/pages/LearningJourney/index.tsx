import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLearningJourney } from '../../services/api'

interface TimelineNode {
  id: string
  title: string
  description: string
  difficulty: number
  estimated_hours: number
  status: 'completed' | 'pending'
  mastery: number
}

interface WeakConcept {
  concept_id: string
  title: string
  chapter: string
  mastery_score: number
}

interface DailyTask {
  type: string
  title: string
  estimated_minutes: number
  reason: string
}

interface JourneyData {
  path: {
    progress: number
    completed_count: number
    total_count: number
    timeline: TimelineNode[]
  }
  mastery: {
    avg_mastery: number
    weak_count: number
    strong_count: number
    weak_concepts: WeakConcept[]
    strong_concepts: WeakConcept[]
  }
  stats: {
    total_minutes: number
    total_sessions: number
    week_minutes: number
    week_sessions: number
    recent_activity: { type: string; minutes: number; date: string }[]
  }
  daily_plan: {
    greeting: string
    today_tasks: DailyTask[]
    motivation: string
    available_minutes: number
  }
}

const typeIcons: Record<string, string> = {
  review: '📖',
  learn: '📗',
  practice: '✏️',
  assess: '📊',
  reflect: '💭',
}

const typeColors: Record<string, string> = {
  review: 'border-amber-200 bg-amber-50',
  learn: 'border-blue-200 bg-blue-50',
  practice: 'border-green-200 bg-green-50',
  assess: 'border-purple-200 bg-purple-50',
  reflect: 'border-pink-200 bg-pink-50',
}

export default function LearningJourneyPage() {
  const [data, setData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchLearningJourney()
      .then((d) => { setData(d as JourneyData); setLoading(false) })
      .catch((e) => { setError(e.message || '加载失败'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 text-lg">加载失败：{error || '未知错误'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-red-600 underline hover:no-underline"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  const { path, mastery, stats, daily_plan } = data
  const progressPct = Math.round(path.progress * 100)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🎯 学习旅程</h1>
        <p className="mt-1 text-gray-500 text-sm">
          {daily_plan.greeting}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="路径进度"
          value={`${progressPct}%`}
          sub={`${path.completed_count}/${path.total_count} 节点`}
          color="blue"
        />
        <StatCard
          label="平均掌握度"
          value={`${Math.round(mastery.avg_mastery * 100)}%`}
          sub={`${mastery.weak_count} 薄弱 · ${mastery.strong_count} 掌握`}
          color="green"
        />
        <StatCard
          label="本周学习"
          value={`${Math.round(stats.week_minutes / 60 * 10) / 10}h`}
          sub={`${stats.week_sessions} 次学习`}
          color="purple"
        />
        <StatCard
          label="总计学习"
          value={`${Math.round(stats.total_minutes / 60 * 10) / 10}h`}
          sub={`${stats.total_sessions} 次学习`}
          color="amber"
        />
      </div>

      {/* Today's Plan + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 今日计划 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            📋 今日学习计划
            {daily_plan.available_minutes > 0 && (
              <span className="text-xs font-normal text-gray-400">
                （约 {daily_plan.available_minutes} 分钟）
              </span>
            )}
          </h2>
          {daily_plan.today_tasks.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">
              暂无今日计划，去设置学习目标吧
            </p>
          ) : (
            <div className="space-y-3">
              {daily_plan.today_tasks.map((task, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${typeColors[task.type] || 'border-gray-200 bg-gray-50'}`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">
                    {typeIcons[task.type] || '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {task.title}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        ~{task.estimated_minutes}min
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{task.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {daily_plan.motivation && (
            <p className="mt-4 text-sm text-center text-gray-400 italic">
              {daily_plan.motivation}
            </p>
          )}
        </div>

        {/* 学习路径时间线 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            🗺️ 学习时间线
            <span className="text-xs font-normal text-gray-400">
              （{path.completed_count}/{path.total_count} 完成）
            </span>
          </h2>
          {path.timeline.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">
              尚未生成学习路径，去
              <button
                onClick={() => navigate('/learning-path')}
                className="text-blue-600 underline mx-1"
              >
                学习路径
              </button>
              开始规划
            </p>
          ) : (
            <div className="space-y-0 max-h-80 overflow-y-auto">
              {path.timeline.map((node, i) => (
                <div key={node.id} className="flex gap-3 relative">
                  {/* 时间线竖条 */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 border-2 ${
                        node.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300'
                      }`}
                    />
                    {i < path.timeline.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 min-h-[20px] ${
                          node.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          node.status === 'completed' ? 'text-green-700 line-through' : 'text-gray-800'
                        }`}
                      >
                        {node.title}
                      </span>
                      {node.status === 'completed' && (
                        <span className="text-xs text-green-500">✅</span>
                      )}
                    </div>
                    {node.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {node.description}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>难度 {Math.round(node.difficulty * 100)}%</span>
                      <span>预计 {node.estimated_hours}h</span>
                      {node.mastery > 0 && (
                        <span>掌握度 {Math.round(node.mastery * 100)}%</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 薄弱概念 + 最近活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 薄弱概念 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            ⚠️ 需要巩固的概念
          </h2>
          {mastery.weak_concepts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">
              暂无薄弱概念，继续保持！
            </p>
          ) : (
            <div className="space-y-2">
              {mastery.weak_concepts.map((c) => (
                <div
                  key={c.concept_id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-100"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">{c.title}</span>
                    <span className="text-xs text-gray-400 ml-2">{c.chapter}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${Math.round(c.mastery_score * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-amber-600 font-medium w-8">
                      {Math.round(c.mastery_score * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近活动 + 快速操作 */}
        <div className="space-y-4">
          {/* 最近活动 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              🕐 最近学习活动
            </h2>
            {stats.recent_activity.length === 0 ? (
              <p className="text-gray-400 text-sm py-2 text-center">暂无学习记录</p>
            ) : (
              <div className="space-y-2">
                {stats.recent_activity.slice(0, 5).map((act, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {act.type === 'study' ? '📖 学习' : '✏️ 测验'} · {act.minutes}分钟
                    </span>
                    <span className="text-gray-400 text-xs">
                      {act.date ? new Date(act.date).toLocaleDateString('zh-CN') : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 快速操作 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              ⚡ 快速操作
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                label="继续学习"
                icon="🎓"
                onClick={() => navigate('/learning-path')}
              />
              <QuickAction
                label="练习巩固"
                icon="✏️"
                onClick={() => navigate('/quiz')}
              />
              <QuickAction
                label="复习闪卡"
                icon="🃏"
                onClick={() => navigate('/flashcards')}
              />
              <QuickAction
                label="AI 辅导"
                icon="🤖"
                onClick={() => navigate('/chat')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub: string
  color: 'blue' | 'green' | 'purple' | 'amber'
}) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    amber: 'bg-amber-50 border-amber-200',
  }
  const textMap = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    purple: 'text-purple-700',
    amber: 'text-amber-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function QuickAction({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors text-left"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm text-gray-700">{label}</span>
    </button>
  )
}
