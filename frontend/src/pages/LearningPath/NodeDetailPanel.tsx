import { useEffect } from 'react'
import { getNodeStatus, type NodeStatus } from './nodeStatus'

interface PathNode {
  id: string
  title: string
  duration: string
  priority: number
  description: string
  goals: string
  key_concepts: string[]
  difficulty: number
}

interface Props {
  node: PathNode | null
  completedNodes: string[]
  edges: { from: string; to: string }[]
  onClose: () => void
  onToggleComplete: (nodeId: string) => void
  onStartChapterQuiz?: (chapter: string) => void
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

export default function NodeDetailPanel({
  node, completedNodes, edges, onClose, onToggleComplete, onStartChapterQuiz,
}: Props) {
  const completedSet = new Set(completedNodes)
  const status = node ? getNodeStatus(node.id, completedSet, edges) : 'not-started'
  const statusInfo = STATUS_LABEL[status]

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

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-surface border-l border-border
        shadow-lg z-50 overflow-y-auto transform transition-transform duration-300 ease-out
        ${node ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 space-y-4">
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

          {/* Duration & Priority */}
          <div className="flex gap-3 text-sm text-muted">
            <span>⏱ {node.duration}</span>
            <span>📊 优先级 P{node.priority}</span>
          </div>

          {/* Difficulty */}
          <div>
            <p className="text-xs text-muted mb-1">难度</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${getDifficultyColor(node.difficulty)}`}
                  style={{ width: `${node.difficulty * 100}%` }} />
              </div>
              <span className="text-xs text-muted">{Math.round(node.difficulty * 100)}%</span>
            </div>
          </div>

          {/* Goals */}
          {node.goals && (
            <div>
              <p className="text-xs text-muted mb-1">学习目标</p>
              <p className="text-sm text-ink leading-relaxed">{node.goals}</p>
            </div>
          )}

          {/* Key Concepts */}
          {node.key_concepts.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">核心概念</p>
              <div className="flex flex-wrap gap-1.5">
                {node.key_concepts.map((concept, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-warm-white border border-border text-ink">
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* E28 章节测评按钮 */}
          {status !== 'completed' && onStartChapterQuiz && (
            <button
              onClick={() => onStartChapterQuiz(node.id)}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors
                bg-amber text-warm-white hover:bg-amber-light"
            >
              📝 开始章节测评
            </button>
          )}

          {/* Toggle complete button */}
          <button
            onClick={() => onToggleComplete(node.id)}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              status === 'completed'
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-ink text-warm-white hover:bg-ink-light'
            }`}
          >
            {status === 'completed' ? '取消完成' : '标记为已完成'}
          </button>
        </div>
      </div>
    </>
  )
}
