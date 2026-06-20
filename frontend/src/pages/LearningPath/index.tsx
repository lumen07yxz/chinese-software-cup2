import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import CodeBlock from '../../components/CodeBlock';
import { fetchLearningPath, generateLearningPathStream, toggleNodeComplete as apiToggleNode } from '../../services/api';
import { useProfileStore } from '../../stores/profileStore';
import DependencyGraph from './DependencyGraph';
import NodeDetailPanel from './NodeDetailPanel';
import { getNodeStatus } from './nodeStatus';
import { downloadText } from '../../utils/export';

interface PathNode {
  id: string;
  title: string;
  duration: string;
  priority: number;
  description: string;
  goals: string;
  key_concepts: string[];
  difficulty: number;
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
  completed_nodes: string[];
  updated_at: string;
}

export default function LearningPathPage() {
  const navigate = useNavigate();
  const [savedPath, setSavedPath] = useState<SavedPath | null>(null);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'graph'>('timeline');
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [streamExpanded, setStreamExpanded] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
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
      if (data.path) {
        setSavedPath(data.path);
        if (data.path.completed_nodes) {
          setCompletedNodes(new Set(data.path.completed_nodes));
          localStorage.setItem('learning-path-completed', JSON.stringify(data.path.completed_nodes));
        }
      }
    } catch { /* ignore */ }
  };

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setStreamText('');
    setStreamExpanded(false);

    try {
      await generateLearningPathStream(
        { profile: profile || {} },
        (chunk) => setStreamText((prev) => prev + chunk),
        () => {
          setGenerating(false);
          loadSavedPath();
        },
        (err) => {
          setStreamText((prev) => prev + `\n\n> ❌ 出错了: ${err}`);
          setGenerating(false);
        },
        (pathData: Record<string, unknown>) => {
          // 算法路径骨架到达后即刻渲染 timeline/graph 视图
          const data = pathData as unknown as PathData;
          if (!data.nodes) return;
          setSavedPath({
            data,
            current_node: data.nodes[0].id,
            completed_nodes: [],
            progress: 0,
            updated_at: new Date().toISOString(),
          });
        },
      );
    } catch (e: unknown) {
      // 401 等错误会被 apiFetch 拦截并跳转登录页，这里兜底其他异常
      const msg = e instanceof Error ? e.message : '网络错误';
      setStreamText((prev) => prev || `\n\n> ❌ ${msg}`);
      setGenerating(false);
    }
  }, [generating, profile]);

  const handleToggleComplete = async (nodeId: string) => {
    setCompletedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      localStorage.setItem('learning-path-completed', JSON.stringify([...next]));
      return next;
    });
    try { await apiToggleNode(nodeId); } catch { /* fallback to localStorage */ }
  };

  const pathData: PathData | null = savedPath?.data || null;

  // Calculate progress
  const totalNodes = pathData?.nodes.length || 0;
  const completedCount = completedNodes.size;

  // 导出学习路径为 Markdown 大纲
  const handleExportOutline = () => {
    if (!pathData) return;
    const lines: string[] = ['# 个性化学习路径', ''];
    if (savedPath) {
      lines.push(
        `> 当前进度：${Math.round((savedPath.progress || 0) * 100)}% | 已完成：${completedCount}/${totalNodes} | 更新时间：${savedPath.updated_at || ''}`,
        '',
      );
    }
    pathData.nodes.forEach((n, i) => {
      const done = completedNodes.has(n.id) ? '✅' : '⬜';
      lines.push(`## ${i + 1}. ${done} ${n.title}`);
      lines.push(`- 难度：${Math.round((n.difficulty || 0) * 100)}% | 预计时长：${n.duration || '未指定'} | 优先级：${'★'.repeat(Math.max(1, n.priority || 1))}`);
      if (n.goals) lines.push(`- 学习目标：${n.goals}`);
      if (n.key_concepts?.length) lines.push(`- 关键概念：${n.key_concepts.join('、')}`);
      if (n.description) lines.push(`- ${n.description}`);
      lines.push('');
    });
    if (pathData.suggestions?.length) {
      lines.push('## 学习建议');
      pathData.suggestions.forEach((s) => lines.push(`- ${s}`));
    }
    downloadText('学习路径.md', lines.join('\n'));
  };

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
            <div className="flex items-center gap-2">
              {pathData && (
                <button
                  onClick={handleExportOutline}
                  disabled={generating}
                  title="导出学习路径为 Markdown 大纲"
                  className="px-4 py-2 bg-surface text-ink text-[13px] rounded-md border border-border hover:border-ink/40 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  导出大纲
                </button>
              )}
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
                  onClick={() => {
                    setActiveTab(tab);
                    // 切换时滚动到顶部
                    const container = document.querySelector('.flex-1.overflow-y-auto');
                    if (container) container.scrollTop = 0;
                  }}
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

          {/* Generating stream — full height during generation */}
          {generating && streamText && (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                <span className="text-sm text-muted">AI 正在为你规划学习路径...</span>
              </div>
              <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code: CodeBlock,
                    img: ({ src, alt }: { src?: string; alt?: string }) => {
                      if (!src || (!src.startsWith('/') && !src.startsWith('data:'))) return null
                      return <img src={src} alt={alt} className="max-w-full rounded" />
                    },
                  }}
                >
                  {streamText}
                </ReactMarkdown>
                <span className="inline-block w-1.5 h-4 bg-amber animate-pulse ml-0.5" />
              </div>
              <div ref={streamEndRef} />
            </div>
          )}

          {/* Post-generation collapsible stream — does not obscure graph */}
          {!generating && streamText && pathData && (
            <div className="max-w-3xl mx-auto mb-4">
              <button
                onClick={() => setStreamExpanded((v) => !v)}
                className="flex items-center gap-2 text-[13px] text-muted hover:text-ink transition-colors"
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`transition-transform duration-200 ${streamExpanded ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {streamExpanded ? '收起规划说明' : '查看详细规划说明'}
              </button>
              {streamExpanded && (
                <div className="mt-3 p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      code: CodeBlock,
                      img: ({ src, alt }: { src?: string; alt?: string }) => {
                        if (!src || (!src.startsWith('/') && !src.startsWith('data:'))) return null
                        return <img src={src} alt={alt} className="max-w-full rounded" />
                      },
                    }}
                  >
                    {streamText}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Timeline view */}
          {pathData && !generating && activeTab === 'timeline' && (
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

                <div className="space-y-0">
                  {(pathData.nodes || []).map((node, idx) => {
                    const isComplete = completedNodes.has(node.id);
                    const priority = node.priority || 5;
                    const nodeEdges = pathData.edges || [];
                    const status = getNodeStatus(node.id, completedNodes, nodeEdges);
                    const statusIcon = status === 'completed' ? '✅' : status === 'recommended' ? '🔴' : status === 'skippable' ? '⏭' : '⚪';

                    return (
                      <div
                        key={node.id}
                        onClick={() => handleToggleComplete(node.id)}
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
                            <span className={`text-sm font-semibold text-ink`}>
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
                                  {statusIcon} {node.title}
                                </h3>
                                {isComplete && (
                                  <span className="text-[11px] px-1.5 py-0.5 bg-ink/10 text-ink rounded-full">已完成</span>
                                )}
                              </div>
                              <p className="text-[13px] text-muted mt-1">{node.description}</p>
                              {node.goals && (
                                <p className="text-[12px] text-muted mt-2">🎯 {node.goals}</p>
                              )}
                              {node.key_concepts && node.key_concepts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {node.key_concepts.map((concept) => (
                                    <span key={concept} className="text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted">
                                      {concept}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {typeof node.difficulty === 'number' && (
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-[11px] text-muted">难度</span>
                                  <div className="flex-1 h-1.5 bg-cream rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${node.difficulty * 100}%`,
                                        backgroundColor: node.difficulty >= 0.6 ? '#EF4444' : node.difficulty >= 0.4 ? '#C77D43' : '#2D4A3E',
                                      }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-muted">{Math.round(node.difficulty * 100)}%</span>
                                </div>
                              )}
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
              <DependencyGraph
                nodes={pathData.nodes || []}
                edges={pathData.edges || []}
                completedNodes={[...completedNodes]}
                selectedNode={selectedNode}
                onNodeClick={(id) => setSelectedNode(id === selectedNode ? null : id)}
              />            </div>
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

          {/* Node detail panel */}
          <NodeDetailPanel
            node={(pathData?.nodes || []).find(n => n.id === selectedNode) || null}
            completedNodes={[...completedNodes]}
            edges={pathData?.edges || []}
            onClose={() => setSelectedNode(null)}
            onToggleComplete={handleToggleComplete}
            onStartChapterQuiz={(chapter) => {
              setSelectedNode(null);
              navigate(`/quiz?chapter=${chapter}`);
            }}
          />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Dependency graph component ─── */

