import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import CodeBlock from '../../components/CodeBlock';
import { fetchResources, fetchResourceDetail, generateResourcesStream, updateResource, type AgentStatusEvent } from '../../services/api';
import { useProfileStore } from '../../stores/profileStore';
import { useAutoTracker, useScrollTracker } from '../../hooks/useAutoTracker';
import { downloadText, safeFilename } from '../../utils/export';

const MARKDOWN_PLUGINS = {
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [rehypeKatex],
  components: {
    code: CodeBlock,
    img: ({ src, alt }: { src?: string; alt?: string }) => {
      if (!src || (!src.startsWith('/') && !src.startsWith('data:'))) {
        return null
      }
      return <img src={src} alt={alt} className="max-w-full rounded" />
    },
  },
};

const RESOURCE_TYPES = [
  { key: '', label: '全部' },
  { key: 'doc', label: '课程文档' },
  { key: 'mindmap', label: '思维导图' },
  { key: 'quiz', label: '练习题' },
  { key: 'video', label: '视频脚本' },
  { key: 'code', label: '实操案例' },
] as const;

const TYPE_ICONS: Record<string, string> = {
  doc: '📄', mindmap: '🧠', quiz: '✏️', video: '🎬', code: '💻',
};

interface Resource {
  id: number;
  type: string;
  title: string;
  description: string;
  chapter: string;
  difficulty: number;
  created_at: string;
  content?: string;
}

interface AgentState {
  agent: string;
  label: string;
  icon: string;
  status: 'working' | 'done' | 'error';
  message: string;
}

const INITIAL_AGENTS: AgentState[] = [
  { agent: 'rag', label: '检索助手', icon: '📖', status: 'done', message: '等待中' },
  { agent: 'orchestrator', label: '资源设计总监', icon: '🎯', status: 'done', message: '等待中' },
  { agent: 'doc_agent', label: '课程内容专家', icon: '📄', status: 'done', message: '等待中' },
  { agent: 'safety_checker', label: '安全审查员', icon: '🛡️', status: 'done', message: '等待中' },
];

// Agent 类型到状态列表中对应 index 的映射
const AGENT_ORDER: Record<string, number> = {
  rag: 0,
  orchestrator: 1,
  doc_agent: 2,
  mindmap_agent: 2,
  quiz_agent: 2,
  video_agent: 2,
  code_agent: 2,
  safety_checker: 3,
};

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [activeType, setActiveType] = useState('');
  const [selected, setSelected] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genTopic, setGenTopic] = useState('');
  const [genChapter, setGenChapter] = useState('');
  const [genType, setGenType] = useState('doc');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContent, setEditingContent] = useState<string | null>(null); // F32 编辑模式
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('resource_favorites') || '[]')); } catch { return new Set(); }
  });
  // F31 评分状态: resourceId → 'up' | 'down' | null
  const [ratings, setRatings] = useState<Record<number, 'up' | 'down'>>(() => {
    try { return JSON.parse(localStorage.getItem('resource_ratings') || '{}'); } catch { return {}; }
  });
  const { profile } = useProfileStore();

  // ── resizable split ─────────────────────────────────────────
  const SPLIT_KEY = 'resources_split_ratio';
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = parseFloat(localStorage.getItem(SPLIT_KEY) || '');
    return Number.isFinite(saved) && saved > 0.15 && saved < 0.85 ? saved : 0.38;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startRatio = useRef(0);

  // 左侧面板宽度自适应：小于 340px 切换紧凑模式
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = leftPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 340);
    });
    ro.observe(el);
    // 初始检测
    setCompact(el.clientWidth < 340);
    return () => ro.disconnect();
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startRatio.current = splitRatio;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [splitRatio]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const width = containerRef.current.offsetWidth;
    const dx = e.clientX - startX.current;
    const next = startRatio.current + dx / width;
    const clamped = Math.min(0.75, Math.max(0.18, next));
    setSplitRatio(clamped);
  }, []);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(SPLIT_KEY, String(splitRatio));
  }, [splitRatio]);

  useEffect(() => {
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  // Streaming state
  const [streamText, setStreamText] = useState('');
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [, setShowAgentPanel] = useState(false);

  // 自动学习行为追踪
  useAutoTracker(true);
  const detailRef = useRef<HTMLDivElement>(null);
  useScrollTracker(detailRef, selected?.id ?? null);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await fetchResources(activeType || undefined);
      setResources(data.resources || []);
    } catch { /* 资源加载失败，静默处理 */ }
    setLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => { loadResources(); });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText]);

  const loadDetail = async (id: number) => {
    try {
      const data = await fetchResourceDetail(id);
      if (data && !data.detail) setSelected(data);
    } catch { /* 资源加载失败，静默处理 */ }
  };

  const handleAgentStatus = (status: AgentStatusEvent) => {
    const idx = AGENT_ORDER[status.agent] ?? -1;
    if (idx >= 0) {
      setAgents((prev) => {
        const next = [...prev];
        next[idx] = {
          agent: status.agent,
          label: status.label,
          icon: status.icon,
          status: status.status,
          message: status.message,
        };
        return next;
      });
    }
  };

  // 导出当前资源为 Markdown 文件
  const handleExportMarkdown = () => {
    if (!selected?.content) return;
    const typeLabel = RESOURCE_TYPES.find((t) => t.key === selected.type)?.label || selected.type;
    const meta = [
      `# ${selected.title}`,
      '',
      `> 类型：${typeLabel} | 章节：${selected.chapter || '未分类'} | 难度：${Math.round((selected.difficulty || 0) * 100)}%`,
      `> 生成时间：${selected.created_at || ''}`,
      '',
      '---',
      '',
    ].join('\n');
    downloadText(`${safeFilename(selected.title)}.md`, meta + selected.content);
  };

  // 导出当前资源为 PDF（浏览器打印 → 另存为 PDF，复用已渲染的 KaTeX/Mermaid/Prism DOM）
  const handleExportPDF = () => {
    if (!selected?.content) return;
    window.print();
  };

  // F32 编辑：进入编辑模式
  const handleStartEdit = () => {
    if (!selected?.content) return;
    setEditingContent(selected.content);
  };

  // F32 编辑：保存
  const handleSaveEdit = async () => {
    if (!selected || editingContent === null) return;
    setSaving(true);
    try {
      await updateResource(selected.id, { content: editingContent });
      // 更新本地 selected 和 resources 列表
      const updated = { ...selected, content: editingContent };
      setSelected(updated);
      setResources((prev) => prev.map((r) => r.id === selected.id ? updated : r));
      setEditingContent(null);
    } catch { /* ignore */ }
    setSaving(false);
  };

  // F32 编辑：取消
  const handleCancelEdit = () => setEditingContent(null);

  // F30 收藏切换
  const toggleFavorite = (id: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('resource_favorites', JSON.stringify([...next]));
      return next;
    });
  };

  // F31 评分切换
  const toggleRating = (id: number, value: 'up' | 'down') => {
    setRatings((prev) => {
      const next = { ...prev };
      next[id] = next[id] === value ? undefined! : value;
      if (!next[id]) delete next[id];
      localStorage.setItem('resource_ratings', JSON.stringify(next));
      return next;
    });
  };

  // F34 搜索过滤
  const filteredResources = (() => {
    let list = resources;
    // 收藏筛选
    if (searchQuery === '__favorites__') {
      list = list.filter((r) => favorites.has(r.id));
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.chapter.toLowerCase().includes(q)
      );
    }
    return list;
  })();

  // F35 同章节关联资源（排除当前选中）
  const relatedResources = selected && selected.chapter
    ? resources.filter((r) => r.chapter === selected.chapter && r.id !== selected.id).slice(0, 6)
    : [];

  const handleGenerate = async () => {
    if (!genTopic.trim() || generating) return;

    setGenerating(true);
    setStreamText('');
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: 'done' as const, message: '等待中' })));
    setShowAgentPanel(true);
    setSelected(null);

    try {
      await generateResourcesStream(
        {
          // user_id removed (now from JWT)
          resource_type: genType,
          topic: genTopic,
          chapter: genChapter,
          difficulty: 0.5,
          profile: profile || {},
        },
        // onChunk
        (chunk) => setStreamText((prev) => prev + chunk),
        // onDone
        () => {
          setGenerating(false);
          loadResources();
        },
        // onError
        (err) => {
          setStreamText((prev) => prev + `\n\n> ❌ 出错了: ${err}`);
          setGenerating(false);
        },
        // onAgentStatus
        handleAgentStatus,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '网络错误';
      setStreamText((prev) => prev || `\n\n> ❌ ${msg}`);
      setGenerating(false);
    }
  };

  return (
    <div ref={containerRef} className="flex h-screen max-h-screen select-none">
      {/* Resource list — left panel */}
      <div
        ref={leftPanelRef}
        className="flex flex-col min-w-0 bg-warm-white overflow-hidden"
        style={{ width: `${splitRatio * 100}%`, flexShrink: 0 }}
      >
        {/* Header */}
        <div className={`flex-shrink-0 border-b border-border bg-surface/50 ${compact ? 'px-3 py-2' : 'px-6 py-4'}`}>
          <h1 className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-lg'}`}>学习资源</h1>
          {!compact && <p className="text-[13px] text-muted mt-0.5">多智能体协作生成的个性化学习资料</p>}
        </div>

        {/* Type filter + Search */}
        <div className={`flex-shrink-0 border-b border-border/50 flex gap-1.5 items-center flex-wrap ${compact ? 'px-3 py-2' : 'px-6 py-3 gap-2'}`}>
          {RESOURCE_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveType(t.key); if (t.key) setGenType(t.key); }}
              className={`rounded-full transition-colors whitespace-nowrap
                ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'}
                ${activeType === t.key
                  ? 'bg-ink text-warm-white'
                  : 'bg-surface border border-border text-muted hover:text-ink hover:bg-cream'
                }`}
            >
              {t.label}
            </button>
          ))}
          {/* Favorites toggle filter */}
          <button
            onClick={() => { setActiveType(''); setSearchQuery(searchQuery === '__favorites__' ? '' : '__favorites__'); }}
            className={`rounded-full transition-colors border whitespace-nowrap
              ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'}
              ${searchQuery === '__favorites__' ? 'bg-amber text-warm-white border-amber' : 'bg-surface border-border text-muted hover:text-ink hover:bg-cream'}`}
          >
            ⭐{!compact && ' 收藏'}
          </button>
          <div className={`relative flex-shrink-0 ${compact ? 'ml-auto' : 'ml-auto'}`}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              className={`${compact ? 'w-24 px-2 py-1 pl-7 text-[11px]' : 'w-40 px-3 py-1.5 pl-8 text-[13px]'} bg-surface border border-border rounded-full outline-none focus:border-ink transition-all`}
            />
            <svg className={`absolute top-1/2 -translate-y-1/2 text-muted ${compact ? 'left-2 w-3 h-3' : 'left-2.5 w-3.5 h-3.5'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
        </div>

        {/* Generate bar */}
        <div className={`flex-shrink-0 border-b border-border/50 bg-cream/30 ${compact ? 'px-3 py-2' : 'px-6 py-3'}`}>
          {compact ? (
            /* 紧凑模式：单行，input + 按钮 */
            <div className="flex items-center gap-2">
              <input
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="知识点..."
                className="flex-1 min-w-0 px-2 py-1.5 text-[12px] bg-surface border border-border rounded outline-none focus:border-ink transition-colors"
              />
              <button
                onClick={handleGenerate}
                disabled={!genTopic.trim() || generating}
                className="px-3 py-1.5 bg-ink text-warm-white text-[12px] rounded hover:bg-ink-light transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-1.5"
              >
                {generating ? (
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                ) : '生成'}
              </button>
            </div>
          ) : (
            /* 标准模式 */
            <div className="flex items-center gap-3">
              <input
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="输入知识点，如：反向传播算法"
                className="flex-1 px-3 py-2 text-[14px] bg-surface border border-border rounded-md outline-none focus:border-ink transition-colors"
              />
              <input
                value={genChapter}
                onChange={(e) => setGenChapter(e.target.value)}
                placeholder="章节（可选）"
                className="w-36 px-3 py-2 text-[14px] bg-surface border border-border rounded-md outline-none focus:border-ink transition-colors"
              />
              <button
                onClick={handleGenerate}
                disabled={!genTopic.trim() || generating}
                className="px-4 py-2 bg-ink text-warm-white text-[13px] rounded-md hover:bg-ink-light transition-colors disabled:opacity-50 flex-shrink-0 flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                    </svg>
                    协作生成中...
                  </>
                ) : (
                  '生成资源'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className={`flex-1 overflow-y-auto ${compact ? 'px-3 py-3' : 'px-6 py-4'}`}>
          {/* Streaming content */}
          {generating && (
            <div className="mb-4">
              {/* Agent collaboration status bar */}
              <div className="p-4 rounded-lg border border-border bg-surface mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-ink flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    多智能体协作过程
                  </h3>
                  {generating && (
                    <span className="text-[11px] text-amber animate-pulse">● 进行中</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {agents.map((agent) => (
                    <div key={agent.agent} className="flex items-center gap-3 py-1.5">
                      {/* Status indicator */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        agent.status === 'working' ? 'bg-amber animate-pulse' :
                        agent.status === 'done' ? 'bg-ink' :
                        agent.status === 'error' ? 'bg-red-500' :
                        'bg-border'
                      }`} />
                      {/* Icon */}
                      <span className="text-sm flex-shrink-0">{agent.icon}</span>
                      {/* Label */}
                      <span className={`text-[13px] flex-1 ${
                        agent.status === 'working' ? 'text-ink font-medium' :
                        agent.status === 'done' ? 'text-muted' :
                        agent.status === 'error' ? 'text-red-600' :
                        'text-muted/60'
                      }`}>
                        {agent.label}
                      </span>
                      {/* Message */}
                      <span className={`text-[11px] ${
                        agent.status === 'working' ? 'text-amber' :
                        agent.status === 'done' ? 'text-muted' :
                        agent.status === 'error' ? 'text-red-500' :
                        'text-muted/50'
                      }`}>
                        {agent.status === 'working' ? (
                          <span className="flex items-center gap-1">
                            {agent.message}
                            <span className="inline-flex">
                              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                            </span>
                          </span>
                        ) : agent.status === 'done' && agent.message !== '等待中' ? (
                          `✅ ${agent.message}`
                        ) : agent.status === 'error' ? (
                          `❌ ${agent.message}`
                        ) : (
                          agent.message
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Streaming output */}
              {streamText && (
                <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                  <ReactMarkdown {...MARKDOWN_PLUGINS}>
                    {streamText}
                  </ReactMarkdown>
                  <span className="inline-block w-1.5 h-4 bg-amber animate-pulse ml-0.5" />
                </div>
              )}
              <div ref={streamEndRef} />
            </div>
          )}

          {/* Generated content (after stream ends) */}
          {!generating && streamText && (
            <div className="mb-4">
              {/* Agent collaboration result summary */}
              <div className="p-3 rounded-lg border border-border bg-surface mb-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-sm">
                  ✅
                </div>
                <div>
                  <span className="text-[13px] font-medium text-ink">多智能体协作完成</span>
                  <span className="text-[12px] text-muted ml-2">
                    {agents.filter((a) => a.status === 'done').length}/4 个 Agent 参与
                  </span>
                </div>
                <button
                  onClick={() => setShowAgentPanel(false)}
                  className="ml-auto text-[12px] text-muted hover:text-ink px-2 py-1 rounded hover:bg-cream transition-colors"
                >
                  收起详情
                </button>
              </div>

              <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                <ReactMarkdown {...MARKDOWN_PLUGINS}>
                  {streamText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!generating && streamText === '' && resources.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-cream flex items-center justify-center text-2xl">
                📚
              </div>
              <h2 className="text-base font-medium text-ink mb-2">暂未生成资源</h2>
              <p className="text-sm text-muted">多智能体系统将为你协作生成个性化的学习资料</p>
            </div>
          )}

          {/* Resource cards */}
          {loading ? (
            <div className="text-center text-muted py-12">加载中...</div>
          ) : resources.length > 0 && !generating ? (
            <>
              {/* 搜索结果为空 */}
              {filteredResources.length === 0 && searchQuery.trim() && (
                <div className="text-center py-8 mb-4">
                  <p className="text-sm text-muted">没有找到匹配的资源</p>
                  <button onClick={() => setSearchQuery('')} className="text-[12px] text-ink hover:underline mt-1">清除搜索</button>
                </div>
              )}
              {filteredResources.length > 0 && (
                <div className={compact ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
                  {filteredResources.map((r) => (
                    <div key={r.id} className="group relative">
                      <button
                        onClick={() => loadDetail(r.id)}
                        className={`w-full text-left rounded-lg border transition-all hover:shadow-sm
                          ${selected?.id === r.id
                            ? 'border-ink bg-ink/5'
                            : 'border-border bg-surface hover:border-muted'
                          }
                          ${compact ? 'p-2.5' : 'p-4'}`}
                      >
                        {compact ? (
                          /* 紧凑模式：单行卡片 */
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base flex-shrink-0">{TYPE_ICONS[r.type] || '📝'}</span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[12px] font-medium text-ink leading-snug truncate">{r.title}</h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] px-1 py-0.5 bg-cream rounded text-muted truncate max-w-[80px]">{r.chapter}</span>
                                <span className="text-[10px] text-muted/60 flex-shrink-0">难度 {Math.round(r.difficulty * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* 标准模式 */
                          <div className="flex items-start gap-3">
                            <span className="text-xl flex-shrink-0">{TYPE_ICONS[r.type] || '📝'}</span>
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-medium text-ink leading-snug truncate">{r.title}</h3>
                              <p className="text-[12px] text-muted mt-1 line-clamp-2">{r.description}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] px-1.5 py-0.5 bg-cream rounded text-muted">{r.chapter}</span>
                                <span className="text-[11px] text-muted">
                                  难度 {Math.round(r.difficulty * 100)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </button>
                      {/* Favorite toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(r.id); }}
                        className={`absolute flex items-center justify-center rounded-full text-sm opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110
                          ${compact ? 'top-1 right-1 w-5 h-5 text-xs' : 'top-2 right-2 w-6 h-6'}`}
                        title={favorites.has(r.id) ? '取消收藏' : '收藏'}
                      >
                        {favorites.has(r.id) ? '⭐' : '☆'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* ── Draggable divider ── */}
      <div
        onMouseDown={handleDragStart}
        className="w-1.5 flex-shrink-0 cursor-col-resize bg-border/60 hover:bg-ink/40 active:bg-ink/60 transition-colors relative group/divider"
        title="拖拽调整面板宽度"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-muted/40 group-hover/divider:bg-white/80 transition-colors" />
      </div>

      {/* Detail panel — right side, takes remaining space */}
      <div ref={detailRef} className={`flex-1 min-w-0 border-l border-border bg-surface overflow-y-auto
        max-md:fixed max-md:inset-0 max-md:z-30 max-md:transition-transform max-md:duration-300 max-md:ease-out
        ${selected ? 'max-md:translate-x-0' : 'max-md:translate-x-full'}`}>
        {selected ? (
          <div className="p-6 print-area">
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 className="text-base font-semibold text-ink">{selected.title}</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExportMarkdown}
                  disabled={!selected.content}
                  title="导出为 Markdown 文件"
                  className="text-xs px-2 py-1 rounded text-muted hover:text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  导出 .md
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={!selected.content}
                  title="打印 / 另存为 PDF"
                  className="text-xs px-2 py-1 rounded text-muted hover:text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  导出 PDF
                </button>
                {/* F32 编辑按钮 */}
                <button
                  onClick={handleStartEdit}
                  disabled={editingContent !== null}
                  title="编辑内容"
                  className="text-xs px-2 py-1 rounded text-muted hover:text-ink hover:bg-cream transition-colors disabled:opacity-40"
                >
                  编辑
                </button>
                {/* F31 评分按钮 */}
                <button
                  onClick={() => toggleRating(selected.id, 'up')}
                  title="资源质量好"
                  className={`text-xs px-1.5 py-1 rounded transition-colors ${ratings[selected.id] === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-muted hover:text-ink hover:bg-cream'}`}
                >
                  👍
                </button>
                <button
                  onClick={() => toggleRating(selected.id, 'down')}
                  title="资源需要改进"
                  className={`text-xs px-1.5 py-1 rounded transition-colors ${ratings[selected.id] === 'down' ? 'text-red-500 bg-red-50' : 'text-muted hover:text-ink hover:bg-cream'}`}
                >
                  👎
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="text-muted hover:text-ink transition-colors ml-1"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            {/* F32 编辑模式 / 阅读模式 */}
            {editingContent !== null ? (
              <div className="no-print">
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="w-full min-h-[400px] p-4 text-sm font-mono bg-warm-white border border-border rounded-lg outline-none focus:border-ink resize-y"
                  placeholder="输入 Markdown 内容..."                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-cream transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none prose-headings:text-ink prose-code:text-sm">
                {selected.content ? (
                  <ReactMarkdown {...MARKDOWN_PLUGINS}>
                    {selected.content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-muted">加载内容中...</p>
                )}
              </div>
            )}

            {/* F35 关联资源推荐 */}
            {relatedResources.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border/50 no-print">
                <h3 className="text-[12px] text-muted mb-3">同章节相关资源</h3>
                <div className="space-y-2">
                  {relatedResources.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => loadDetail(r.id)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-cream hover:border-muted transition-colors text-sm"
                    >
                      <span className="flex-shrink-0">{TYPE_ICONS[r.type] || '📝'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink truncate">{r.title}</div>
                        <div className="text-[11px] text-muted truncate">{r.description}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 bg-cream rounded text-muted flex-shrink-0">
                        {RESOURCE_TYPES.find((t) => t.key === r.type)?.label || r.type}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            选择左侧资源查看详细内容
          </div>
        )}
      </div>
    </div>
  );
}
