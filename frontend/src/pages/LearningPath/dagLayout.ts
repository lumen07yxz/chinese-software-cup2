/**
 * DAG 分层布局算法 — 纯函数，无 React 依赖
 */

export interface LayoutNode {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  d: string
  labelX: number
  labelY: number
}

const NODE_W = 140
const NODE_H = 48
const H_GAP = 60
const V_GAP = 160
const PADDING = 40
const CIRCLE_R = NODE_W / 2 // 70

/**
 * 计算每个节点的层级（最长路径法）
 * 返回 Map<nodeId, layer>
 */
export function computeLayers(
  nodes: { id: string }[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const layer = new Map<string, number>()
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
    adj.get(e.from)?.push(e.to)
  }

  // BFS from all roots
  const queue: string[] = []
  for (const n of nodes) {
    if ((inDegree.get(n.id) || 0) === 0) {
      layer.set(n.id, 0)
      queue.push(n.id)
    }
  }

  while (queue.length > 0) {
    const curr = queue.shift()!
    for (const next of adj.get(curr) || []) {
      const newLayer = (layer.get(curr) || 0) + 1
      if (newLayer > (layer.get(next) || 0)) {
        layer.set(next, newLayer)
      }
      const deg = (inDegree.get(next) || 1) - 1
      inDegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }

  // Assign layer 0 to any orphan nodes
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0)
  }

  return layer
}

/**
 * 根据层级计算节点位置
 * 返回 Map<nodeId, LayoutNode>
 */
export function computePositions(
  nodes: { id: string }[],
  layers: Map<string, number>,
  canvasWidth: number,
): Map<string, LayoutNode> {
  const positions = new Map<string, LayoutNode>()

  // Group by layer
  const layerGroups = new Map<number, string[]>()
  for (const n of nodes) {
    const l = layers.get(n.id) || 0
    if (!layerGroups.has(l)) layerGroups.set(l, [])
    layerGroups.get(l)!.push(n.id)
  }

  // Sort layers
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b)

  for (const l of sortedLayers) {
    const ids = layerGroups.get(l)!
    const totalWidth = ids.length * NODE_W + (ids.length - 1) * H_GAP
    const startX = (canvasWidth - totalWidth) / 2

    for (let i = 0; i < ids.length; i++) {
      positions.set(ids[i], {
        x: startX + i * (NODE_W + H_GAP) + NODE_W / 2,
        y: PADDING + CIRCLE_R + l * (CIRCLE_R * 2 + V_GAP),
        width: NODE_W,
        height: NODE_H,
      })
    }
  }

  return positions
}

/**
 * 计算正交折线边路径
 * 从源节点底部到目标节点顶部
 */
export function computeEdgePath(
  fromPos: LayoutNode,
  toPos: LayoutNode,
): LayoutEdge {
  const fromX = fromPos.x
  const fromY = fromPos.y + CIRCLE_R
  const toX = toPos.x
  const toY = toPos.y - CIRCLE_R
  const midY = (fromY + toY) / 2

  const d = `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`

  return {
    d,
    labelX: (fromX + toX) / 2,
    labelY: midY - 6,
  }
}

/**
 * 计算整个图的 viewBox 尺寸
 */
export function computeViewBox(positions: Map<string, LayoutNode>): {
  width: number
  height: number
  minX: number
  minY: number
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pos of positions.values()) {
    // Use circle radius for bounds (visual extent), plus space for title below
    minX = Math.min(minX, pos.x - CIRCLE_R)
    minY = Math.min(minY, pos.y - CIRCLE_R - 22) // duration badge above
    maxX = Math.max(maxX, pos.x + CIRCLE_R)
    maxY = Math.max(maxY, pos.y + CIRCLE_R + 30) // title below
  }
  return {
    minX: minX - PADDING,
    minY: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  }
}

export { NODE_W }
