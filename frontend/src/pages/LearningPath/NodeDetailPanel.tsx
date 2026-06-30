import { useEffect } from 'react'
import { getNodeStatus, type NodeStatus } from './nodeStatus'

interface SubTopic {
  title: string
  description: string
  key_points: string[]
}

interface PathNode {
  id: string
  title: string
  duration: string
  estimated_hours?: number
  estimated_days?: number
  priority: number
  description: string
  goals: string
  key_concepts: string[]
  difficulty: number
  mastery?: number
  sub_topics?: SubTopic[]
  learning_methods?: string[]
  milestones?: string[]
  prerequisites?: string[]
  resources_hint?: string[]
}

interface Props {
  node: PathNode | null
  completedNodes: string[]
  edges: { from: string; to: string }[]
  allNodes: PathNode[]
  onClose: () => void
  onToggleComplete: (nodeId: string) => void
  onStartChapterQuiz?: (chapter: string) => void
  onStartClassroom?: (nodeId: string) => void
}

const STATUS_LABEL: Record<NodeStatus, { label: string; color: string; bg: string }> = {
  completed:    { label: '✅ 已完成', color: 'text-green-700', bg: 'bg-green-50' },
  recommended:  { label: '🔴 推荐学习', color: 'text-red-600', bg: 'bg-red-50' },
  'not-started': { label: '⚪ 未开始', color: 'text-gray-500', bg: 'bg-gray-50' },
  skippable:    { label: '⏭ 可跳过', color: 'text-gray-400', bg: 'bg-gray-50' },
}

function getDifficultyColor(d: number): string {
  if (d < 0.4) return 'bg-green-400'
  if (d < 0.6) return 'bg-amber'
  return 'bg-red-400'
}

function getDifficultyLabel(d: number): string {
  if (d < 0.3) return '入门'
  if (d < 0.5) return '基础'
  if (d < 0.65) return '进阶'
  return '高级'
}

export default function NodeDetailPanel({
  node, completedNodes, edges, allNodes, onClose, onToggleComplete, onStartChapterQuiz, onStartClassroom,
}: Props) {
  const completedSet = new Set(completedNodes)
  const status = node ? getNodeStatus(node.id, completedSet, edges) : 'not-started'
  const statusInfo = STATUS_LABEL[status]

  // 找前置和后继章节
  const predecessors = node ? edges.filter(e => e.to === node.id).map(e => {
    const n = allNodes.find(nd => nd.id === e.from)
    return { ...e, title: n?.title || e.from, completed: completedNodes.includes(e.from) }
  }) : []
  const successors = node ? edges.filter(e => e.from === node.id).map(e => {
    const n = allNodes.find(nd => nd.id === e.to)
    return { ...e, title: n?.title || e.to, completed: completedNodes.includes(e.to) }
  }) : []

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!node) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/10 z-40 transition-opacity"
        onClick={onClose} />

      {/* Panel — 加宽到 w-96 以容纳更多内容 */}
      <div className={`fixed top-0 right-0 h-full w-96 max-w-[85vw] bg-surface border-l border-border
        shadow-lg z-50 overflow-y-auto transform transition-transform duration-300 ease-out
        ${node ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-muted">{node.id}</span>
              <h3 className="text-lg font-medium text-ink mt-0.5">{node.title}</h3>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-muted text-lg">
              ×
            </button>
          </div>

          {/* Status */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color} ${statusInfo.bg}`}>
            {statusInfo.label}
          </div>

          {/* Description */}
          {node.description && (
            <p className="text-[13px] text-ink leading-relaxed">{node.description}</p>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-cream/50 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-wide">预估学时</p>
              <p className="text-[14px] font-medium text-ink mt-0.5">{node.estimated_hours || '?'}h</p>
            </div>
            <div className="p-2.5 rounded-lg bg-cream/50 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-wide">预计时长</p>
              <p className="text-[14px] font-medium text-ink mt-0.5">{node.duration}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-cream/50 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-wide">优先级</p>
              <p className="text-[14px] font-medium text-ink mt-0.5">P{node.priority}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-cream/50 border border-border/50">
              <p className="text-[10px] text-muted uppercase tracking-wide">难度等级</p>
              <p className="text-[14px] font-medium text-ink mt-0.5">{getDifficultyLabel(node.difficulty)}</p>
            </div>
          </div>

          {/* Difficulty bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted">难度</p>
              <span className="text-xs text-muted">{Math.round(node.difficulty * 100)}%</span>
            </div>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${getDifficultyColor(node.difficulty)}`}
                style={{ width: `${node.difficulty * 100}%` }} />
            </div>
          </div>

          {/* Mastery bar */}
          {typeof node.mastery === 'number' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted">当前掌握度</p>
                <span className="text-xs font-medium text-ink">{Math.round(node.mastery * 100)}%</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-400"
                  style={{ width: `${node.mastery * 100}%` }} />
              </div>
            </div>
          )}

          {/* Goals */}
          {node.goals && (
            <div>
              <p className="text-xs text-muted mb-1">🎯 学习目标</p>
              <p className="text-sm text-ink leading-relaxed">{node.goals}</p>
            </div>
          )}

          {/* Key Concepts */}
          {node.key_concepts.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">🔑 核心概念</p>
              <div className="flex flex-wrap gap-1.5">
                {node.key_concepts.map((concept, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-warm-white border border-border text-ink">
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sub-topics */}
          {node.sub_topics && node.sub_topics.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-2">📖 子主题（{node.sub_topics.length}个）</p>
              <div className="space-y-2">
                {node.sub_topics.map((st, i) => (
                  <div key={i} className="p-2.5 rounded-md bg-cream/50 border border-border/50">
                    <p className="text-[12px] font-medium text-ink">{i + 1}. {st.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">{st.description}</p>
                    {st.key_points && st.key_points.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {st.key_points.map((kp, kpi) => (
                          <span key={kpi} className="text-[10px] px-1.5 py-0.5 bg-warm-white rounded text-ink/70 border border-border/50">
                            {kp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Learning Methods */}
          {node.learning_methods && node.learning_methods.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">💡 推荐学习方法</p>
              <div className="space-y-1.5">
                {node.learning_methods.map((method, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-ink">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    {method}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Milestones */}
          {node.milestones && node.milestones.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">🏆 学习里程碑</p>
              <div className="space-y-1.5">
                {node.milestones.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="text-amber mt-0.5 flex-shrink-0">◆</span>
                    <span className="text-ink">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prerequisites */}
          {predecessors.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">📋 前置知识</p>
              <div className="flex flex-wrap gap-1.5">
                {predecessors.map((p) => (
                  <span key={p.from} className={`text-[11px] px-2 py-0.5 rounded-full border
                    ${p.completed
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-cream border-border text-muted'
                    }`}>
                    {p.completed ? '✅' : '📖'} {p.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Successors */}
          {successors.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">➡️ 后续章节</p>
              <div className="flex flex-wrap gap-1.5">
                {successors.map((s) => (
                  <span key={s.to} className={`text-[11px] px-2 py-0.5 rounded-full border
                    ${s.completed
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-warm-white border-border text-ink/70'
                    }`}>
                    {s.completed ? '✅' : '📖'} {s.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources hint */}
          {node.resources_hint && node.resources_hint.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">📎 推荐资源类型</p>
              <div className="flex flex-wrap gap-1.5">
                {node.resources_hint.map((rh, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                    {rh}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => onStartClassroom?.(node.id)}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors
                bg-blue-600 text-white hover:bg-blue-700"
            >
              🎓 进入 AI 课堂
            </button>

            {status !== 'completed' && onStartChapterQuiz && (
              <button
                onClick={() => onStartChapterQuiz(node.id)}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors
                  bg-amber text-warm-white hover:bg-amber-light"
              >
                📝 开始章节测评
              </button>
            )}

            <button
              onClick={() => onToggleComplete(node.id)}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                status === 'completed'
                  ? 'bg-cream text-muted hover:bg-border'
                  : 'bg-ink text-warm-white hover:bg-ink-light'
              }`}
            >
              {status === 'completed' ? '取消完成' : '标记为已完成'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
