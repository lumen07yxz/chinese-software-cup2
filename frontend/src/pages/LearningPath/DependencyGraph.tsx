import { useRef, useState, useCallback, useEffect } from 'react'
import {
  computeLayers, computePositions, computeEdgePath, computeViewBox,
  NODE_W,
} from './dagLayout'
import { getNodeStatus, getConnectedNodes, type NodeStatus } from './nodeStatus'

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

interface PathEdge {
  from: string
  to: string
  label: string
}

interface Props {
  nodes: PathNode[]
  edges: PathEdge[]
  completedNodes: string[]
  selectedNode: string | null
  onNodeClick: (nodeId: string) => void
}

const STATUS_COLORS: Record<NodeStatus, { fill: string; stroke: string; text: string }> = {
  completed:    { fill: '#059669', stroke: '#059669', text: '#fff' },
  recommended:  { fill: '#fff', stroke: '#EF4444', text: '#2D4A3E' },
  'not-started': { fill: '#fff', stroke: '#D4D0CB', text: '#6b7280' },
  skippable:    { fill: '#F9FAFB', stroke: '#9CA3AF', text: '#9CA3AF' },
}

export default function DependencyGraph({
  nodes, edges, completedNodes, selectedNode, onNodeClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 })
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 })
  const [isDragging, setIsDragging] = useState(false)

  // Compute layout
  const layers = computeLayers(nodes, edges)
  const [canvasWidth, setCanvasWidth] = useState(800)

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width || 800)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const positions = computePositions(nodes, layers, canvasWidth)

  // 空数据保护
  if (!nodes.length || positions.size === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted">
        暂无节点数据
      </div>
    )
  }

  const viewBox = computeViewBox(positions)
  const completedSet = new Set(completedNodes)
  const connectedNodes = hoveredNode ? getConnectedNodes(hoveredNode, edges) : null

  // Zoom/pan handlers — use native listener to set {passive: false}
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setTransform(prev => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        const newScale = Math.min(3, Math.max(0.3, prev.scale * factor))
        return { ...prev, scale: newScale }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY
    setTransform(prev => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
  }, [])

  const onMouseUp = useCallback(() => {
    setIsDragging(false)
    dragRef.current.dragging = false
  }, [])

  // Reset transform on double click
  const onDoubleClick = useCallback(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 })
  }, [])

  return (
    <svg
      ref={svgRef}
      className="w-full h-full cursor-grab active:cursor-grabbing select-none"
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#EF4444" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#059669" floodOpacity="0.3" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="shadow" />
          <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`}
         style={{ transition: isDragging ? 'none' : 'transform 0.12s ease-out' }}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const fromPos = positions.get(edge.from)
          const toPos = positions.get(edge.to)
          if (!fromPos || !toPos) return null
          const { d, labelX, labelY } = computeEdgePath(fromPos, toPos)
          const isHighlighted = hoveredNode === edge.from || hoveredNode === edge.to
          const isDimmed = hoveredNode && !isHighlighted

          return (
            <g key={i} opacity={isDimmed ? 0.15 : 1} style={{ transition: 'opacity 0.2s' }}>
              <path d={d} fill="none" stroke={isHighlighted ? '#2D4A3E' : '#D4D0CB'}
                strokeWidth={isHighlighted ? 2 : 1.5} strokeDasharray={isHighlighted ? 'none' : '6,4'}
                markerEnd={`url(#arrow-${i})`} />
              <defs>
                <marker id={`arrow-${i}`} viewBox="0 0 10 8" refX="9" refY="4"
                  markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 4 L 0 8 z" fill={isHighlighted ? '#2D4A3E' : '#D4D0CB'} />
                </marker>
              </defs>
              {/* Edge label — visible on hover */}
              <g opacity={isHighlighted ? 1 : 0} style={{ transition: 'opacity 0.2s' }}>
                <rect x={labelX - edge.label.length * 4 - 6} y={labelY - 10}
                  width={edge.label.length * 8 + 12} height={20} rx={4}
                  fill="#F5F0EB" stroke="#E8E4DF" strokeWidth={1} />
                <text x={labelX} y={labelY + 4} textAnchor="middle"
                  fontSize={11} fill="#6b7280">{edge.label}</text>
              </g>
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = positions.get(node.id)
          if (!pos) return null
          const status = getNodeStatus(node.id, completedSet, edges)
          const colors = STATUS_COLORS[status]
          const isConnected = connectedNodes?.has(node.id) ?? true
          const isHovered = hoveredNode === node.id
          const isSelected = selectedNode === node.id
          const opacity = hoveredNode && !isConnected ? 0.25 : 1

          return (
            <g key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => onNodeClick(node.id)}
            >
              {/* Recommended pulse ring */}
              {status === 'recommended' && (
                <circle r={NODE_W / 2 + 6} fill="none" stroke="#EF4444"
                  strokeWidth={1} opacity={0.4} strokeDasharray="4,4">
                  <animateTransform attributeName="transform" type="rotate"
                    from="0" to="360" dur="8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Main circle */}
              <circle r={NODE_W / 2}
                fill={colors.fill} stroke={colors.stroke}
                strokeWidth={isSelected ? 3 : status === 'recommended' ? 2.5 : 2}
                strokeDasharray={status === 'skippable' ? '6,4' : 'none'}
                filter={isHovered ? (status === 'completed' ? 'url(#glow-green)' : status === 'recommended' ? 'url(#glow-red)' : 'none') : 'none'}
              />

              {/* Status icon or chapter number */}
              {status === 'completed' ? (
                <text textAnchor="middle" dominantBaseline="central"
                  y={-10} fontSize={20} fill="#fff">✓</text>
              ) : (
                <text textAnchor="middle" dominantBaseline="central"
                  y={-10} fontSize={13} fontWeight={600} fill={colors.text}>
                  {node.id.replace('ch', '')}
                </text>
              )}

              {/* Title inside circle — truncated to fit */}
              <text y={14} textAnchor="middle"
                fontSize={11} fontWeight={500} fill={status === 'completed' ? '#fff' : '#2D4A3E'}
                opacity={0.85}>
                {node.title.length > 7 ? node.title.slice(0, 7) + '…' : node.title}
              </text>

              {/* Duration badge above circle */}
              <rect x={-24} y={-NODE_W / 2 - 20} width={48} height={16} rx={8}
                fill="#F5F0EB" stroke="#E8E4DF" strokeWidth={0.5} />
              <text y={-NODE_W / 2 - 9} textAnchor="middle"
                fontSize={9} fill="#8B8580">{node.duration}</text>

              {/* Selection ring */}
              {isSelected && (
                <circle r={NODE_W / 2 + 4} fill="none"
                  stroke="#C77D43" strokeWidth={2} strokeDasharray="4,2" />
              )}
            </g>
          )
        })}
      </g>

      {/* Zoom hint */}
      <text x={viewBox.minX + 8} y={viewBox.minY + viewBox.height - 8}
        fontSize={10} fill="#b0aba5" opacity={0.6}>
        滚轮缩放 · 拖拽平移 · 双击重置
      </text>
    </svg>
  )
}
