/**
 * 节点状态判断逻辑 — 纯函数
 */

export type NodeStatus = 'completed' | 'recommended' | 'not-started' | 'skippable'

/**
 * 判断节点状态
 * - completed: ✅ 已完成
 * - recommended: 🔴 前置全完成，阻塞下游，推荐学习
 * - skippable: ⏭ 前置全完成，但不阻塞任何未完成下游
 * - not-started: ⚪ 前置未完成
 */
export function getNodeStatus(
  nodeId: string,
  completedSet: Set<string>,
  edges: { from: string; to: string }[],
): NodeStatus {
  if (completedSet.has(nodeId)) return 'completed'

  // 找前置节点
  const predecessors = edges.filter(e => e.to === nodeId).map(e => e.from)
  const allPredecessorsCompleted = predecessors.every(p => completedSet.has(p))

  if (!allPredecessorsCompleted) return 'not-started'

  // 前置全部完成，检查是否阻塞下游
  const dependents = edges.filter(e => e.from === nodeId).map(e => e.to)
  const hasBlockingDependent = dependents.some(d => {
    if (completedSet.has(d)) return false
    // d 的其他前置是否全部完成
    const dPreds = edges.filter(e => e.to === d).map(e => e.from)
    return dPreds.filter(p => p !== nodeId).every(p => completedSet.has(p))
  })

  return hasBlockingDependent ? 'recommended' : 'skippable'
}

/**
 * 获取与节点直接关联的所有节点（前置 + 后继）
 */
export function getConnectedNodes(
  nodeId: string,
  edges: { from: string; to: string }[],
): Set<string> {
  const connected = new Set<string>([nodeId])
  for (const e of edges) {
    if (e.from === nodeId) connected.add(e.to)
    if (e.to === nodeId) connected.add(e.from)
  }
  return connected
}

/**
 * 获取所有推荐学习的节点
 */
export function getRecommendedNodes(
  completedSet: Set<string>,
  edges: { from: string; to: string }[],
  nodeIds: string[],
): Set<string> {
  const result = new Set<string>()
  for (const id of nodeIds) {
    if (getNodeStatus(id, completedSet, edges) === 'recommended') {
      result.add(id)
    }
  }
  return result
}
