import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { fetchLearningPath, generateLearningPathStream } from '../../services/api';
import { useProfileStore } from '../../stores/profileStore';

interface PathNode {
  id: string;
  title: string;
  duration: string;
  priority: number;
  description: string;
}

interface PathEdge {
  from: string;
  to: string;
  label: string;
}

interface PathData {
  nodes: PathNode[];
  edges: PathEdge[];
  suggestions: string[];
}

interface SavedPath {
  data: PathData;
  current_node: string;
  progress: number;
  updated_at: string;
}

const CHAPTER_COLORS = [
  'bg-ink', 'bg-ink-light', 'bg-amber', 'bg-amber-light',
  'bg-emerald-700', 'bg-teal-600', 'bg-stone-500', 'bg-zinc-500',
];

const CHAPTER_ORDER = [
  'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10',
];

export default function LearningPathPage() {
  const [savedPath, setSavedPath] = useState<SavedPath | null>(null);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'graph'>('timeline');
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const { profile } = useProfileStore();
  const streamEndRef = useRef<HTMLDivElement>(null);

  // Load saved path on mount
  useEffect(() => {
    loadSavedPath();
    // Load completion state from localStorage
    try {
      const saved = localStorage.getItem('learning-path-completed');
      if (saved) setCompletedNodes(new Set(JSON.parse(saved)));
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll stream
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText]);

  const loadSavedPath = async () => {
    try {
      const data = await fetchLearningPath();
      if (data.path) setSavedPath(data.path);
    } catch { /* ignore */ }
  };

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setStreamText('');

    await generateLearningPathStream(
      { user_id: 'default', profile: profile || {} },
      (chunk) => setStreamText((prev) => prev + chunk),
      () => {
        setGenerating(false);
        loadSavedPath();
      },
      (err) => {
        setStreamText((prev) => prev + `\n\n> ❌ 出错了: ${err}`);
        setGenerating(false);
      },
    );
  }, [generating, profile]);

  const toggleNodeComplete = (nodeId: string) => {
    setCompletedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      localStorage.setItem('learning-path-completed', JSON.stringify([...next]));
      return next;
    });
  };

  const pathData: PathData | null = savedPath?.data || null;

  // Calculate progress
  const totalNodes = pathData?.nodes.length || 0;
  const completedCount = completedNodes.size;

  // --- Render ---
  return (
    <div className="flex h-screen max-h-screen">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 bg-warm-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-ink">学习路径</h1>
              <p className="text-[13px] text-muted mt-0.5">
                根据你的画像和知识掌握情况，规划科学、动态的个性化学习路径
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-5 py-2 bg-ink text-warm-white text-[13px] rounded-md hover:bg-ink-light transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  生成中...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {savedPath ? '重新规划' : '生成学习路径'}
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          {pathData && !generating && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1 h-2 bg-cream rounded-full overflow-hidden">
                <div
                  className="h-full bg-ink rounded-full transition-all duration-700"
                  style={{ width: `${totalNodes ? (completedCount / totalNodes) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[12px] text-muted whitespace-nowrap">
                {completedCount}/{totalNodes} 已完成
              </span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        {pathData && !generating && (
          <div className="flex-shrink-0 px-6 border-b border-border/50">
            <div className="flex gap-1">
              {(['timeline', 'graph'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-[13px] border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-ink text-ink font-medium'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab === 'timeline' ? '📋 时间线' : '🔗 知识图谱'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Empty state */}
          {!pathData && !generating && streamText === '' && (
            <div className="text-center mt-20">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-cream flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2D4A3E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-ink mb-2">尚未生成学习路径</h2>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                点击上方按钮，AI 将根据你的学习画像和知识掌握情况，自动规划最优学习路径。
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-2.5 bg-ink text-warm-white text-[14px] rounded-md hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                立即生成学习路径
              </button>
            </div>
          )}

          {/* Generating stream */}
          {generating && streamText && (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                <span className="text-sm text-muted">AI 正在为你规划学习路径...</span>
              </div>
              <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
                  {streamText}
                </ReactMarkdown>
                <span className="inline-block w-1.5 h-4 bg-amber animate-pulse ml-0.5" />
              </div>
              <div ref={streamEndRef} />
            </div>
          )}

          {/* Timeline view */}
          {pathData && !generating && activeTab === 'timeline' && (
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

                <div className="space-y-0">
                  {CHAPTER_ORDER.map((chId, idx) => {
                    const node = pathData.nodes?.find((n) => n.id === chId);
                    if (!node) return null;
                    const isComplete = completedNodes.has(node.id);
                    const priority = node.priority || 5;

                    return (
                      <div
                        key={node.id}
                        onClick={() => toggleNodeComplete(node.id)}
                        className="relative flex items-start gap-5 pb-8 cursor-pointer group"
                      >
                        {/* Timeline dot */}
                        <div
                          className={`relative z-10 mt-1 w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300
                            ${isComplete
                              ? 'bg-ink border-ink'
                              : 'bg-surface border-border group-hover:border-ink/40'
                            }`}
                        >
                          {isComplete ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5F0EB" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className={`text-sm font-semibold ${CHAPTER_COLORS[idx % CHAPTER_COLORS.length].replace('bg-', 'text-')}`}>
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        {/* Node card */}
                        <div
                          className={`flex-1 p-4 rounded-lg border transition-all duration-200
                            ${isComplete
                              ? 'bg-ink/5 border-ink/20'
                              : 'bg-surface border-border group-hover:shadow-sm group-hover:border-muted'
                            }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className={`text-base font-medium ${isComplete ? 'text-muted line-through' : 'text-ink'}`}>
                                  {node.title}
                                </h3>
                                {isComplete && (
                                  <span className="text-[11px] px-1.5 py-0.5 bg-ink/10 text-ink rounded-full">已完成</span>
                                )}
                              </div>
                              <p className="text-[13px] text-muted mt-1">{node.description}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[12px] px-2 py-0.5 bg-cream rounded-full text-muted whitespace-nowrap">
                                {node.duration || '待定'}
                              </span>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium
                                ${priority >= 8 ? 'bg-red-100 text-red-600' :
                                  priority >= 5 ? 'bg-amber/10 text-amber' :
                                  'bg-cream text-muted'}`}
                              >
                                P{priority}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Knowledge graph view */}
          {pathData && !generating && activeTab === 'graph' && (
            <div className="max-w-4xl mx-auto">
              <p className="text-sm text-muted mb-4">节点依赖关系图 — 箭头表示前置知识依赖</p>
              <DependencyGraph nodes={pathData.nodes || []} edges={pathData.edges || []} completedNodes={completedNodes} />
            </div>
          )}

          {/* Suggestions */}
          {pathData && pathData.suggestions && pathData.suggestions.length > 0 && !generating && (
            <div className="max-w-3xl mx-auto mt-2">
              <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                学习建议
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pathData.suggestions.map((s, i) => (
                  <div key={i} className="p-4 rounded-lg border border-border bg-surface flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-cream text-ink text-[12px] font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[14px] text-gray-700 leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Dependency graph component ─── */

function DependencyGraph({
  nodes,
  edges,
  completedNodes,
}: {
  nodes: PathNode[];
  edges: PathEdge[];
  completedNodes: Set<string>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          w: containerRef.current.clientWidth,
          h: Math.max(500, containerRef.current.clientHeight),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Layout: use fixed positions based on chapter order
  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const n = nodes.length;
  const centerX = dimensions.w / 2;
  const centerY = dimensions.h / 2;
  const radius = Math.min(dimensions.w, dimensions.h) * 0.33;

  nodes.forEach((node, i) => {
    if (!nodePositions.current.has(node.id)) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      nodePositions.current.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
  });

  const getNodeColor = (id: string): string => {
    const idx = nodes.findIndex((n) => n.id === id);
    const colors = ['#2D4A3E', '#3D5A4E', '#C77D43', '#D99B5E', '#0F766E', '#0D9488', '#78716C', '#71717A', '#2D4A3E', '#3D5A4E'];
    return colors[idx % colors.length];
  };

  return (
    <div ref={containerRef} className="w-full h-[520px] bg-surface border border-border rounded-lg overflow-hidden">
      <svg ref={svgRef} width={dimensions.w} height={dimensions.h} className="w-full h-full">
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#F0EDE8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={dimensions.w} height={dimensions.h} fill="url(#grid)" />

        {/* Edges */}
        {edges.map((edge) => {
          const from = nodePositions.current.get(edge.from);
          const to = nodePositions.current.get(edge.to);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2 - 14;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              {/* Arrow line */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#D4D0CB" strokeWidth="1.5" strokeDasharray="4,3"
              />
              {/* Arrow head */}
              <polygon
                points={`${to.x},${to.y} ${to.x - 8},${to.y - 5} ${to.x - 8},${to.y + 5}`}
                fill="#D4D0CB"
                transform={`rotate(${Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI}, ${to.x}, ${to.y})`}
              />
              {/* Edge label */}
              <text x={midX} y={midY} textAnchor="middle" fill="#8B8580" fontSize="11" fontFamily="sans-serif">
                {edge.label}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions.current.get(node.id);
          if (!pos) return null;
          const isComplete = completedNodes.has(node.id);
          const color = getNodeColor(node.id);

          return (
            <g key={node.id}>
              {/* Connection line from center */}
              <line x1={centerX} y1={centerY} x2={pos.x} y2={pos.y} stroke="#EDE8E3" strokeWidth="1" />
              {/* Node circle */}
              <circle
                cx={pos.x} cy={pos.y} r="28"
                fill={isComplete ? color : '#FFFFFF'}
                stroke={color}
                strokeWidth="2"
                opacity={isComplete ? 0.9 : 1}
              />
              {isComplete && (
                <text x={pos.x} y={pos.y + 1} textAnchor="middle" fill="#FFFFFF" fontSize="16">✓</text>
              )}
              <text x={pos.x} y={pos.y + 48} textAnchor="middle" fill="#2D4A3E" fontSize="11" fontFamily="sans-serif" fontWeight="500">
                {node.title.length > 8 ? node.title.slice(0, 7) + '…' : node.title}
              </text>
              {/* Duration badge — 放在节点圆圈上方 */}
              {node.duration && (
                <g>
                  <rect x={pos.x - 20} y={pos.y - 32} width="40" height="14" rx="7" fill="#F5F0EB" />
                  <text x={pos.x} y={pos.y - 22} textAnchor="middle" fill="#8B8580" fontSize="9" fontFamily="sans-serif">
                    {node.duration}
                  </text>
                </g>
              )}

              {/* Title — 放在节点圆圈下方，与上方 badge 不再重叠 */}
              <text x={pos.x} y={pos.y + 48} textAnchor="middle" fill="#2D4A3E" fontSize="11" fontFamily="sans-serif" fontWeight="500">
                {node.title.length > 8 ? node.title.slice(0, 7) + '…' : node.title}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <circle cx={centerX} cy={centerY} r="18" fill="#2D4A3E" />
        <text x={centerX} y={centerY + 1} textAnchor="middle" fill="#F5F0EB" fontSize="11" fontWeight="bold">课程</text>
      </svg>
    </div>
  );
}
