import type { StudentProfile } from '../services/api';

interface Props {
  profile: StudentProfile | null;
}

const DIMENSION_LABELS: Record<string, string> = {
  knowledge_base: '知识基础',
  cognitive_style: '认知风格',
  weak_points: '易错点偏好',
  learning_goal: '学习目标',
  available_time: '可用时间',
  interests: '兴趣方向',
};

const COGNITIVE_STYLES: Record<string, string> = {
  visual: '视觉型 (Visual)',
  verbal: '语言型 (Verbal)',
  active: '动手型 (Active)',
  reflective: '反思型 (Reflective)',
};

export default function ProfilePanel({ profile }: Props) {
  if (!profile) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-ink mb-3">学习画像</h3>
        <p className="text-muted text-[13px]">
          尚未构建画像。请在左侧对话中告诉 AI 你的学习背景，系统将自动为你构建个性化学习画像。
        </p>
      </div>
    );
  }

  const hasData = (Object.keys(DIMENSION_LABELS) as (keyof StudentProfile)[]).some((key) => {
    const val = profile[key];
    return val != null && (Array.isArray(val) ? val.length > 0 : val !== '');
  });

  if (!hasData) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-ink mb-3">学习画像</h3>
        <p className="text-muted text-[13px]">画像构建中，继续对话以完善更多维度...</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h3 className="text-sm font-medium text-ink mb-4">你的学习画像</h3>
      <div className="space-y-4">
        {/* Knowledge Base */}
        {profile.knowledge_base && Object.keys(profile.knowledge_base).length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">知识基础</div>
            <div className="space-y-1.5">
              {Object.entries(profile.knowledge_base).map(([topic, level]) => (
                <div key={topic} className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-700 w-20 flex-shrink-0 truncate">{topic}</span>
                  <div className="flex-1 h-1.5 bg-cream rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(Number(level) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted w-8 text-right">{Math.round(Number(level) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cognitive Style */}
        {profile.cognitive_style && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-1">认知风格</div>
            <div className="inline-block px-3 py-1 bg-cream rounded-full text-[13px] text-ink">
              {COGNITIVE_STYLES[profile.cognitive_style] || profile.cognitive_style}
            </div>
          </div>
        )}

        {/* Learning Goal */}
        {profile.learning_goal && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-1">学习目标</div>
            <p className="text-[13px] text-gray-700">{profile.learning_goal}</p>
          </div>
        )}

        {/* Available Time */}
        {profile.available_time && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-1">可用时间</div>
            <div className="inline-block px-3 py-1 bg-cream rounded-full text-[13px] text-ink">
              {profile.available_time}
            </div>
          </div>
        )}

        {/* Weak Points */}
        {profile.weak_points && profile.weak_points.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">易错点偏好</div>
            <div className="flex flex-wrap gap-1.5">
              {profile.weak_points.map((wp, i) => (
                <span key={i} className="px-2.5 py-0.5 bg-amber/10 text-amber text-[12px] rounded-full">
                  {wp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">兴趣方向</div>
            <div className="flex flex-wrap gap-1.5">
              {profile.interests.map((int, i) => (
                <span key={i} className="px-2.5 py-0.5 bg-cream text-ink text-[12px] rounded-full">
                  {int}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
