import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { fetchResources, generateResourcesStream, type AgentStatusEvent } from '../../services/api';
import { useProfileStore } from '../../stores/profileStore';

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
  const { profile } = useProfileStore();

  // Streaming state
  const [streamText, setStreamText] = useState('');
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [showAgentPanel, setShowAgentPanel] = useState(false);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await fetchResources(activeType || undefined);
      setResources(data.resources || []);
    } catch (e) { console.error(e); }
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
      const resp = await fetch(`/api/resources/${id}`);
      if (resp.ok) {
        const data = await resp.json();
        setSelected(data);
      }
    } catch (e) { console.error(e); }
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

  const handleGenerate = async () => {
    if (!genTopic.trim() || generating) return;

    setGenerating(true);
    setStreamText('');
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: 'done' as const, message: '等待中' })));
    setShowAgentPanel(true);
    setSelected(null);

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
  };

  return (
    <div className="flex h-screen max-h-screen">
      {/* Resource list */}
      <div className="flex-1 flex flex-col min-w-0 bg-warm-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50">
          <h1 className="text-lg font-semibold text-ink">学习资源</h1>
          <p className="text-[13px] text-muted mt-0.5">多智能体协作生成的个性化学习资料</p>
        </div>

        {/* Type filter */}
        <div className="flex-shrink-0 px-6 py-3 flex gap-2 border-b border-border/50 flex-wrap items-center">
          {RESOURCE_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveType(t.key); if (t.key) setGenType(t.key); }}
              className={`px-3 py-1.5 text-[13px] rounded-full transition-colors
                ${activeType === t.key
                  ? 'bg-ink text-warm-white'
                  : 'bg-surface border border-border text-muted hover:text-ink hover:bg-cream'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Generate bar */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-border/50 bg-cream/30">
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
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {resources.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadDetail(r.id)}
                  className={`text-left p-4 rounded-lg border transition-all hover:shadow-sm
                    ${selected?.id === r.id
                      ? 'border-ink bg-ink/5'
                      : 'border-border bg-surface hover:border-muted'
                    }`}
                >
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
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Detail panel */}
      <div className="w-[480px] flex-shrink-0 border-l border-border bg-surface overflow-y-auto">
        {selected ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">{selected.title}</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-muted hover:text-ink transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="prose prose-sm max-w-none prose-headings:text-ink prose-code:text-sm">
              {selected.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
                  {selected.content}
                </ReactMarkdown>
              ) : (
                <p className="text-muted">加载内容中...</p>
              )}
            </div>
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
