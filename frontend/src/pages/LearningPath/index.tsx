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

interface SubTopic {
  title: string;
  description: string;
  key_points: string[];
}

interface PathNode {
  id: string;
  title: string;
  duration: string;
  estimated_hours: number;
  estimated_days: number;
  priority: number;
  description: string;
  goals: string;
  key_concepts: string[];
  difficulty: number;
  mastery: number;
  sub_topics: SubTopic[];
  learning_methods: string[];
  milestones: string[];
  prerequisites: string[];
  resources_hint: string[];
}

interface PathEdge {
  from: string;
  to: string;
  label: string;
}

interface PathSummary {
  total_chapters: number;
  total_hours: number;
  total_days: number;
  daily_hours: number;
  hard_chapters: number;
  avg_difficulty: number;
}

interface PathData {
  nodes: PathNode[];
  edges: PathEdge[];
  suggestions: string[];
  summary: PathSummary;
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
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { profile } = useProfileStore();
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [learningGoal, setLearningGoal] = useState('');

  // Load saved path on mount
  useEffect(() => {
    loadSavedPath();
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

  const handleGenerate = useCallback(() => {
    setShowGoalDialog(true);
  }, []);

  const handleConfirmGenerate = useCallback(async () => {
    setShowGoalDialog(false);
    if (generating) return;
    setGenerating(true);
    setStreamText('');
    setStreamExpanded(false);

    try {
      await generateLearningPathStream(
        { profile: profile || {}, learning_goal: learningGoal },
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
      const msg = e instanceof Error ? e.message : '网络错误';
      setStreamText((prev) => prev || `\n\n> ❌ ${msg}`);
      setGenerating(false);
    }
  }, [generating, profile, learningGoal]);

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

  const toggleCardExpand = (nodeId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const pathData: PathData | null = savedPath?.data || null;
  const totalNodes = pathData?.nodes.length || 0;
  const completedCount = completedNodes.size;

  // 计算阶段划分
  const getPhaseInfo = (idx: number, total: number) => {
    const ratio = idx / Math.max(total - 1, 1);
    if (ratio < 0.15) return { label: '入门', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' };
    if (ratio < 0.4) return { label: '基础', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
    if (ratio < 0.7) return { label: '进阶', color: 'text-amber', bg: 'bg-amber/10', border: 'border-amber/30' };
    return { label: '前沿', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
  };

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
    if (pathData.summary) {
      lines.push(
        `> 总计 ${pathData.summary.total_chapters} 章 | 约 ${pathData.summary.total_hours} 学时 | 预计 ${pathData.summary.total_days} 天完成 | 每日 ${pathData.summary.daily_hours} 小时`,
        '',
      );
    }
    let lastPhase = '';
    pathData.nodes.forEach((n, i) => {
      const phase = getPhaseInfo(i, totalNodes).label;
      if (phase !== lastPhase) {
        lines.push(`## 📌 ${phase}阶段`, '');
        lastPhase = phase;
      }
      const done = completedNodes.has(n.id) ? '✅' : '⬜';
      lines.push(`### ${i + 1}. ${done} ${n.title}`);
      lines.push(`- 难度：${Math.round((n.difficulty || 0) * 100)}% | 预估学时：${n.estimated_hours || '?'}h | 预计时长：${n.duration || '未指定'} | 优先级：${'★'.repeat(Math.max(1, n.priority || 1))}`);
      if (n.goals) lines.push(`- 🎯 学习目标：${n.goals}`);
      if (n.description) lines.push(`- 📝 ${n.description}`);
      if (n.key_concepts?.length) lines.push(`- 🔑 核心概念：${n.key_concepts.join('、')}`);
      if (n.prerequisites?.length) {
        const prereqTitles = n.prerequisites.map(p => {
          const ch = pathData.nodes.find(nd => nd.id === p);
          return ch ? ch.title : p;
        });
        lines.push(`- 📋 前置知识：${prereqTitles.join('、')}`);
      }
      if (n.sub_topics?.length) {
        lines.push('- 📖 子主题：');
        n.sub_topics.forEach(st => {
          lines.push(`  - **${st.title}**：${st.description}`);
          if (st.key_points?.length) lines.push(`    - 要点：${st.key_points.join('、')}`);
        });
      }
      if (n.learning_methods?.length) lines.push(`- 💡 学习方法：${n.learning_methods.join('、')}`);
      if (n.milestones?.length) {
        lines.push('- 🏆 学习里程碑：');
        n.milestones.forEach(m => lines.push(`  - [ ] ${m}`));
      }
      lines.push('');
    });
    if (pathData.suggestions?.length) {
      lines.push('## 💡 学习建议');
      pathData.suggestions.forEach((s) => lines.push(`- ${s}`));
    }
    downloadText('学习路径.md', lines.join('\n'));
  };

  return (
    <>
      {/* Learning goal dialog */}
      {showGoalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setShowGoalDialog(false)}>
          <div className="w-[480px] max-w-[90vw] bg-surface rounded-xl border border-border shadow-xl p-6"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-medium text-ink mb-1">生成个性化学习路径</h2>
            <p className="text-[13px] text-muted mb-4">
              告诉 AI 你想学习什么，留空则根据画像自动推荐。
            </p>
            <textarea
              className="w-full min-h-[90px] p-3 rounded-lg border border-border bg-warm-white text-[14px] text-ink
                placeholder:text-muted/60 resize-none focus:outline-none focus:ring-2 focus:ring-ink/20 transition-all"
              placeholder="例如：我想系统学习自然语言处理，重点是 Transformer 和 BERT..."
              value={learningGoal}
              onChange={(e) => setLearningGoal(e.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['深度学习入门', 'NLP与Transformer', '计算机视觉基础', '强化学习实践', 'MLOps工程部署'].map(s => (
                <button key={s} onClick={() => setLearningGoal(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-cream text-muted hover:bg-border hover:text-ink transition-colors">
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
              <button onClick={() => setShowGoalDialog(false)}
                className="px-4 py-2 text-[13px] text-muted hover:text-ink transition-colors">
                取消
              </button>
              <button onClick={handleConfirmGenerate}
                className="px-5 py-2 text-[13px] bg-ink text-warm-white rounded-lg hover:bg-ink-light transition-colors">
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="flex h-screen max-h-screen">
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

          {/* Summary stats */}
          {pathData?.summary && !generating && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
              <span className="flex items-center gap-1 px-2.5 py-1 bg-cream rounded-full">
                📚 {pathData.summary.total_chapters} 章节
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 bg-cream rounded-full">
                ⏱ 约 {pathData.summary.total_hours} 学时
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 bg-cream rounded-full">
                📅 约 {pathData.summary.total_days} 天完成
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 bg-cream rounded-full">
                📊 每日 {pathData.summary.daily_hours}h
              </span>
              {pathData.summary.hard_chapters > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-full">
                  🔥 {pathData.summary.hard_chapters} 个高难度章节
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {pathData && !generating && (
            <div className="mt-3 flex items-center gap-4">
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

          {/* Generating stream */}
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

          {/* Post-generation collapsible stream */}
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
                {streamExpanded ? '收起规划说明' : '查看 AI 详细规划说明'}
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

          {/* Timeline view — 丰富版 */}
          {pathData && !generating && activeTab === 'timeline' && (
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />

                <div className="space-y-0">
                  {(pathData.nodes || []).map((node, idx) => {
                    const isComplete = completedNodes.has(node.id);
                    const priority = node.priority || 5;
                    const nodeEdges = pathData.edges || [];
                    const status = getNodeStatus(node.id, completedNodes, nodeEdges);
                    const statusIcon = status === 'completed' ? '✅' : status === 'recommended' ? '🔴' : status === 'skippable' ? '⏭' : '⚪';
                    const isExpanded = expandedCards.has(node.id);
                    const phase = getPhaseInfo(idx, totalNodes);
                    const subTopicDoneCount = 0; // 子主题完成数（未来可追踪）

                    return (
                      <div key={node.id} className="relative flex items-start gap-5 pb-3">
                        {/* Timeline dot */}
                        <div
                          onClick={() => handleToggleComplete(node.id)}
                          className={`relative z-10 mt-1 w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all duration-300 cursor-pointer
                            ${isComplete
                              ? 'bg-ink border-ink'
                              : 'bg-surface border-border hover:border-ink/40'
                            }`}
                        >
                          {isComplete ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5F0EB" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className="text-sm font-semibold text-ink">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        {/* Node card — 丰富版 */}
                        <div className="flex-1 rounded-lg border transition-all duration-200 overflow-hidden
                          bg-surface border-border hover:shadow-sm hover:border-muted">
                          {/* Card header */}
                          <div className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${phase.color} ${phase.bg}`}>
                                    {phase.label}
                                  </span>
                                  <h3 className={`text-base font-medium ${isComplete ? 'text-muted line-through' : 'text-ink'}`}>
                                    {statusIcon} {node.title}
                                  </h3>
                                  {isComplete && (
                                    <span className="text-[11px] px-1.5 py-0.5 bg-ink/10 text-ink rounded-full">已完成</span>
                                  )}
                                  {status === 'recommended' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full animate-pulse">推荐</span>
                                  )}
                                </div>
                                <p className="text-[13px] text-muted mt-1 leading-relaxed">{node.description}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[12px] px-2 py-0.5 bg-cream rounded-full text-muted whitespace-nowrap">
                                  ⏱ {node.duration || '待定'}
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

                            {/* Goals */}
                            {node.goals && (
                              <p className="text-[12px] text-muted mt-2">🎯 {node.goals}</p>
                            )}

                            {/* Stats row */}
                            <div className="flex flex-wrap items-center gap-3 mt-2.5">
                              {/* Difficulty */}
                              {typeof node.difficulty === 'number' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted">难度</span>
                                  <div className="w-16 h-1.5 bg-cream rounded-full overflow-hidden">
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
                              {/* Estimated hours */}
                              {node.estimated_hours && (
                                <span className="text-[11px] text-muted">📖 {node.estimated_hours}学时</span>
                              )}
                              {/* Mastery */}
                              {typeof node.mastery === 'number' && (
                                <span className={`text-[11px] ${node.mastery >= 0.6 ? 'text-green-600' : node.mastery >= 0.3 ? 'text-amber' : 'text-red-500'}`}>
                                  📊 掌握度 {Math.round(node.mastery * 100)}%
                                </span>
                              )}
                              {/* Sub-topics count */}
                              {node.sub_topics?.length > 0 && (
                                <span className="text-[11px] text-muted">📑 {node.sub_topics.length} 个子主题</span>
                              )}
                            </div>

                            {/* Key concepts */}
                            {node.key_concepts && node.key_concepts.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {node.key_concepts.map((concept) => (
                                  <span key={concept} className="text-[11px] px-2 py-0.5 bg-cream rounded-full text-muted">
                                    {concept}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Learning methods — 精简展示 */}
                            {node.learning_methods && node.learning_methods.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {node.learning_methods.slice(0, isExpanded ? undefined : 2).map((method, mi) => (
                                  <span key={mi} className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                                    {method}
                                  </span>
                                ))}
                                {!isExpanded && node.learning_methods.length > 2 && (
                                  <span className="text-[11px] px-2 py-0.5 text-blue-500">
                                    +{node.learning_methods.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Expandable section */}
                          <div className="border-t border-border/50">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCardExpand(node.id); }}
                              className="w-full px-4 py-2 flex items-center justify-between text-[12px] text-muted hover:text-ink hover:bg-cream/50 transition-colors"
                            >
                              <span>{isExpanded ? '收起详情' : '展开子主题与学习计划'}</span>
                              <svg
                                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3">
                                {/* Sub-topics */}
                                {node.sub_topics?.length > 0 && (
                                  <div>
                                    <p className="text-[12px] font-medium text-ink mb-2">📖 子主题</p>
                                    <div className="space-y-2">
                                      {node.sub_topics.map((st, si) => (
                                        <div key={si} className="p-2.5 rounded-md bg-cream/50 border border-border/50">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-muted">#{si + 1}</span>
                                            <p className="text-[12px] font-medium text-ink">{st.title}</p>
                                            {subTopicDoneCount > si && <span className="text-[10px] text-green-600">✓</span>}
                                          </div>
                                          <p className="text-[11px] text-muted mt-0.5 ml-5">{st.description}</p>
                                          {st.key_points && st.key_points.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
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

                                {/* Milestones */}
                                {node.milestones?.length > 0 && (
                                  <div>
                                    <p className="text-[12px] font-medium text-ink mb-1.5">🏆 学习里程碑</p>
                                    <div className="space-y-1">
                                      {node.milestones.map((m, mi) => (
                                        <div key={mi} className="flex items-start gap-2 text-[12px]">
                                          <span className="text-amber mt-0.5">◆</span>
                                          <span className="text-ink">{m}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Prerequisites */}
                                {node.prerequisites && node.prerequisites.length > 0 && (
                                  <div>
                                    <p className="text-[12px] font-medium text-ink mb-1.5">📋 前置知识</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {node.prerequisites.map((p) => {
                                        const pch = pathData.nodes.find(nd => nd.id === p);
                                        const pDone = completedNodes.has(p);
                                        return (
                                          <span key={p} className={`text-[11px] px-2 py-0.5 rounded-full border
                                            ${pDone
                                              ? 'bg-green-50 border-green-200 text-green-700'
                                              : 'bg-cream border-border text-muted'
                                            }`}>
                                            {pDone ? '✅' : '📖'} {pch?.title || p}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/quiz?chapter=${node.id}`); }}
                                    className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-colors bg-amber/10 text-amber hover:bg-amber/20"
                                  >
                                    📝 章节测评
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
                                    className="flex-1 py-2 rounded-lg text-[12px] font-medium transition-colors bg-cream text-ink hover:bg-border"
                                  >
                                    📊 查看图谱
                                  </button>
                                </div>
                              </div>
                            )}
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
              <div className="h-[520px] bg-surface rounded-xl border border-border overflow-hidden">
                <DependencyGraph
                  nodes={pathData.nodes || []}
                  edges={pathData.edges || []}
                  completedNodes={[...completedNodes]}
                  selectedNode={selectedNode}
                  onNodeClick={(id) => setSelectedNode(id === selectedNode ? null : id)}
                />
              </div>
            </div>
          )}

          {/* Suggestions */}
          {pathData && pathData.suggestions && pathData.suggestions.length > 0 && !generating && (
            <div className="max-w-3xl mx-auto mt-6">
              <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                个性化学习建议
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pathData.suggestions.map((s, i) => (
                  <div key={i} className="p-4 rounded-lg border border-border bg-surface flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-cream text-ink text-[12px] font-medium flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-ink leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Node detail panel */}
      <NodeDetailPanel
        node={(pathData?.nodes || []).find(n => n.id === selectedNode) || null}
        completedNodes={[...completedNodes]}
        edges={pathData?.edges || []}
        allNodes={pathData?.nodes || []}
        onClose={() => setSelectedNode(null)}
        onToggleComplete={handleToggleComplete}
        onStartChapterQuiz={(chapter) => {
          setSelectedNode(null);
          navigate(`/quiz?chapter=${chapter}`);
        }}
        onStartClassroom={(nodeId) => {
          setSelectedNode(null);
          navigate(`/classroom/${nodeId}`);
        }}
      />
    </div>
    </>
  );
}
