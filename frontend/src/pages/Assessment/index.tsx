import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { fetchAssessment, generateAssessmentStream, recordBehavior } from '../../services/api';
import { useProfileStore } from '../../stores/profileStore';

interface AssessmentRecord {
  id: number;
  study_time_minutes: number;
  quiz_scores: number[];
  resource_interactions: number;
  report: Record<string, unknown>;
  created_at: string;
}

type DimensionKey = 'knowledge' | 'depth' | 'practice' | 'consistency' | 'progress';

interface DimensionDef {
  key: DimensionKey;
  label: string;
  score: number;
  color: string;
}

const DIMENSION_COLORS = ['#2D4A3E', '#C77D43', '#0F766E', '#8B8580', '#D99B5E'];

export default function AssessmentPage() {
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [latestReport, setLatestReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const { profile } = useProfileStore();
  const streamEndRef = useRef<HTMLDivElement>(null);

  // Load assessment data on mount
  useEffect(() => {
    loadAssessment();
  }, []);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText]);

  const loadAssessment = async () => {
    setLoading(true);
    try {
      const data = await fetchAssessment();
      setRecords(data.records || []);
      setLatestReport(data.latest_report || null);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleRecordBehavior = async () => {
    const minutes = parseInt(timeInput, 10);
    if (isNaN(minutes) || minutes <= 0) return;
    await recordBehavior({
      user_id: 'default',
      study_time_minutes: minutes,
      resource_type: 'general',
    });
    setTimeInput('');
    loadAssessment();
  };

  const handleGenerateReport = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setStreamText('');

    const totalTime = records.reduce((sum, r) => sum + r.study_time_minutes, 0);
    const totalInteractions = records.reduce((sum, r) => sum + r.resource_interactions, 0);

    await generateAssessmentStream(
      {
        user_id: 'default',
        profile: profile || {},
        study_data: {
          total_study_time_minutes: totalTime,
          total_resource_interactions: totalInteractions,
          session_count: records.length,
          recent_quiz_scores: records.length > 0 ? records[0].quiz_scores : [],
        },
      },
      (chunk) => setStreamText((prev) => prev + chunk),
      () => {
        setGenerating(false);
        loadAssessment();
      },
      (err) => {
        setStreamText((prev) => prev + `\n\n> ❌ 出错了: ${err}`);
        setGenerating(false);
      },
    );
  }, [generating, records, profile]);

  // Compute stats
  const totalTime = records.reduce((sum, r) => sum + r.study_time_minutes, 0);
  const totalInteractions = records.reduce((sum, r) => sum + r.resource_interactions, 0);
  const avgTimePerSession = records.length > 0 ? Math.round(totalTime / records.length) : 0;

  // Mock dimension scores for radar (based on actual data)
  const hasData = records.length > 0;
  const dimensions: DimensionDef[] = [
    { key: 'knowledge', label: '知识掌握', score: hasData ? estimateKnowledgeScore(records) : 0, color: DIMENSION_COLORS[0] },
    { key: 'depth', label: '学习深度', score: hasData ? Math.min(85, 40 + totalInteractions * 3) : 0, color: DIMENSION_COLORS[1] },
    { key: 'practice', label: '实践能力', score: hasData ? Math.min(90, 30 + avgTimePerSession) : 0, color: DIMENSION_COLORS[2] },
    { key: 'consistency', label: '学习连贯', score: hasData ? Math.min(100, records.length * 15) : 0, color: DIMENSION_COLORS[3] },
    { key: 'progress', label: '进步幅度', score: hasData ? Math.min(95, 50 + avgTimePerSession / 2) : 0, color: DIMENSION_COLORS[4] },
  ];

  return (
    <div className="flex h-screen max-h-screen">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 bg-warm-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-surface/50">
          <h1 className="text-lg font-semibold text-ink">学习评估</h1>
          <p className="text-[13px] text-muted mt-0.5">实时跟踪学习行为，多维度评估学习效果，动态优化学习方案</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: '累计学习', value: `${totalTime} 分钟`, icon: '⏱️', desc: '总学习时长' },
              { label: '学习次数', value: `${records.length} 次`, icon: '📊', desc: '记录会话数' },
              { label: '资源交互', value: `${totalInteractions} 次`, icon: '📚', desc: '资源使用' },
              { label: '次均时长', value: `${avgTimePerSession} 分钟`, icon: '🎯', desc: '每次平均' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-muted uppercase tracking-wider">{stat.label}</span>
                  <span className="text-lg">{stat.icon}</span>
                </div>
                <div className="text-2xl font-semibold text-ink">{stat.value}</div>
                <div className="text-[11px] text-muted mt-1">{stat.desc}</div>
              </div>
            ))}
          </div>

          {/* Record behavior bar */}
          <div className="flex items-center gap-3 mb-6 p-4 rounded-lg border border-border bg-cream/30">
            <span className="text-[13px] text-ink whitespace-nowrap">📝 记录学习</span>
            <input
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value.replace(/\D/g, ''))}
              placeholder="学习时长（分钟）"
              type="number"
              min="1"
              className="w-40 px-3 py-2 text-[14px] bg-surface border border-border rounded-md outline-none focus:border-ink transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleRecordBehavior()}
            />
            <button
              onClick={handleRecordBehavior}
              disabled={!timeInput || parseInt(timeInput) <= 0}
              className="px-4 py-2 bg-ink text-warm-white text-[13px] rounded-md hover:bg-ink-light transition-colors disabled:opacity-50"
            >
              记录
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={generating || !hasData}
              className="px-4 py-2 bg-amber text-warm-white text-[13px] rounded-md hover:bg-amber-light transition-colors disabled:opacity-50 ml-auto flex items-center gap-2"
            >
              {generating ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  生成评估报告...
                </>
              ) : (
                '生成评估报告'
              )}
            </button>
          </div>

          {/* Radar chart + Dimensions side by side */}
          {hasData && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
              {/* Radar chart */}
              <div className="lg:col-span-3 p-5 rounded-lg border border-border bg-surface">
                <h3 className="text-sm font-medium text-ink mb-4">能力维度雷达图</h3>
                <RadarChart dimensions={dimensions} size={280} />
              </div>

              {/* Dimension details */}
              <div className="lg:col-span-2 p-5 rounded-lg border border-border bg-surface">
                <h3 className="text-sm font-medium text-ink mb-4">维度详情</h3>
                <div className="space-y-3">
                  {dimensions.map((dim) => (
                    <div key={dim.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] text-gray-700">{dim.label}</span>
                        <span className="text-[12px] font-medium" style={{ color: dim.color }}>{dim.score}/100</span>
                      </div>
                      <div className="h-2 bg-cream rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${dim.score}%`, backgroundColor: dim.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasData && !generating && streamText === '' && (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-cream flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2D4A3E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <h2 className="text-lg font-medium text-ink mb-2">尚未记录学习行为</h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                在上方输入学习时长点击"记录"，或使用资源后系统自动统计。积累足够数据后即可生成评估报告。
              </p>
            </div>
          )}

          {/* Generating report stream */}
          {generating && streamText && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                <span className="text-sm text-muted">AI 正在生成评估报告...</span>
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

          {/* Cached report */}
          {latestReport && !generating && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                已有评估报告
              </h3>
              <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
                  {typeof latestReport === 'string' ? latestReport : JSON.stringify(latestReport, null, 2)}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Streamed report after generation */}
          {!generating && streamText && !latestReport && (
            <div className="mb-6">
              <div className="p-5 rounded-lg border border-border bg-surface prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>
                  {streamText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* History records */}
          {records.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                学习历史记录
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-3 text-muted font-medium">时间</th>
                      <th className="text-left py-2.5 px-3 text-muted font-medium">学习时长</th>
                      <th className="text-left py-2.5 px-3 text-muted font-medium">资源交互</th>
                      <th className="text-left py-2.5 px-3 text-muted font-medium">测试得分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 20).map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                        <td className="py-3 px-3 text-muted">
                          {formatDate(r.created_at)}
                        </td>
                        <td className="py-3 px-3 text-ink font-medium">{r.study_time_minutes} 分钟</td>
                        <td className="py-3 px-3 text-ink">{r.resource_interactions} 次</td>
                        <td className="py-3 px-3">
                          {r.quiz_scores && r.quiz_scores.length > 0 ? (
                            <span className="text-ink">{r.quiz_scores.join(', ')}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── SVG Radar Chart ─── */

function RadarChart({ dimensions, size }: { dimensions: DimensionDef[]; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const levels = 5;
  const n = dimensions.length;

  const getPoint = (index: number, r: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const getDataPoint = (index: number) => getPoint(index, (radius * dimensions[index].score) / 100);

  const dataPoints = dimensions.map((_, i) => getDataPoint(i));
  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid levels */}
        {Array.from({ length: levels }, (_, level) => {
          const r = (radius * (level + 1)) / levels;
          const pts = dimensions.map((_, i) => getPoint(i, r));
          return (
            <polygon
              key={level}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#EDE8E3"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {dimensions.map((_, i) => {
          const p = getPoint(i, radius + 12);
          return (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={p.x} y2={p.y}
              stroke="#EDE8E3"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon fill */}
        <polygon
          points={polygonPoints}
          fill="#2D4A3E"
          opacity="0.12"
          stroke="#2D4A3E"
          strokeWidth="2"
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r="4"
            fill={dimensions[i].color}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        ))}

        {/* Labels */}
        {dimensions.map((_, i) => {
          const labelR = radius + 32;
          const p = getPoint(i, labelR);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8B8580"
              fontSize="12"
              fontFamily="sans-serif"
            >
              {dimensions[i].label}
            </text>
          );
        })}

        {/* Score labels near data points */}
        {dimensions.map((_, i) => {
          const p = getDataPoint(i);
          const offset = 14;
          const labelAngle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = p.x + offset * Math.cos(labelAngle);
          const ly = p.y + offset * Math.sin(labelAngle);
          return (
            <text
              key={`score-${i}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={dimensions[i].color}
              fontSize="11"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              {dimensions[i].score}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Helpers ─── */

function estimateKnowledgeScore(records: AssessmentRecord[]): number {
  let score = 30;
  if (records.length >= 1) score += 10;
  if (records.length >= 3) score += 10;
  if (records.length >= 5) score += 10;
  const totalTime = records.reduce((s, r) => s + r.study_time_minutes, 0);
  if (totalTime > 60) score += 10;
  if (totalTime > 180) score += 10;
  const totalInteractions = records.reduce((s, r) => s + r.resource_interactions, 0);
  if (totalInteractions > 5) score += 10;
  return Math.min(score, 95);
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}
