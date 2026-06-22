import { useState } from 'react';
import { useProfileStore } from '../stores/profileStore';
import { updateProfile } from '../services/api';
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

type EditableField = 'learning_goal' | 'available_time' | 'cognitive_style' | 'interests';

export default function ProfilePanel({ profile }: Props) {
  const { updateProfile: storeUpdate } = useProfileStore();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');

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

  const startEdit = (field: EditableField, currentVal: string) => {
    setDraft(currentVal);
    setEditing(field);
  };

  const saveEdit = async (field: EditableField) => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditing(null);
      return;
    }

    let payload: Partial<StudentProfile>;

    if (field === 'interests') {
      // 逗号/空格/换行分隔 → 数组
      const arr = trimmed.split(/[,，\s\n]+/).filter(Boolean);
      payload = { interests: arr };
    } else if (field === 'cognitive_style') {
      // 验证是否为合法值
      const valid = Object.keys(COGNITIVE_STYLES).includes(trimmed);
      payload = { cognitive_style: valid ? trimmed : trimmed };
    } else if (field === 'learning_goal') {
      payload = { learning_goal: trimmed };
    } else if (field === 'available_time') {
      payload = { available_time: trimmed };
    } else {
      return;
    }

    // 乐观更新本地 store
    storeUpdate(payload);
    setEditing(null);

    // 异步同步到后端
    try {
      await updateProfile(payload);
    } catch {
      // 静默失败，本地已更新
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h3 className="text-sm font-medium text-ink mb-4">你的学习画像</h3>
      <div className="space-y-4">
        {/* Knowledge Base (read-only) */}
        {profile.knowledge_base && Object.keys(profile.knowledge_base).length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">知识基础</div>
            <div className="space-y-1.5">
              {Object.entries(profile.knowledge_base).map(([topic, level]) => (
                <div key={topic} className="flex items-center gap-2">
                  <span className="text-[13px] text-ink w-20 flex-shrink-0 truncate">{topic}</span>
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

        {/* Cognitive Style (editable) */}
        {renderField('cognitive_style', profile.cognitive_style || '', COGNITIVE_STYLES[profile.cognitive_style] || profile.cognitive_style)}

        {/* Learning Goal (editable) */}
        {renderField('learning_goal', profile.learning_goal || '')}

        {/* Available Time (editable) */}
        {renderField('available_time', profile.available_time || '')}

        {/* Weak Points (read-only) */}
        {profile.weak_points && profile.weak_points.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">易错点偏好</div>
            <div className="flex flex-wrap gap-1.5">
              {profile.weak_points.map((wp, i) => (
                <span key={i} className="px-2.5 py-0.5 bg-amber/10 text-amber text-[12px] rounded-full">{wp}</span>
              ))}
            </div>
          </div>
        )}

        {/* Interests (editable) */}
        {renderField('interests', Array.isArray(profile.interests) ? profile.interests.join('、') : profile.interests || '')}
      </div>
    </div>
  );

  function renderField(field: EditableField, displayValue: string, chipLabel?: string) {
    if (!displayValue) return null;

    const isEditing = editing === field;

    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wider text-muted">{DIMENSION_LABELS[field]}</div>
          {!isEditing && (
            <button
              onClick={() => startEdit(field, field === 'interests' ? (Array.isArray(profile[field]) ? (profile[field] as string[]).join('、') : (profile[field] as string) || '') : (profile[field] as string) || '')}
              className="text-[11px] text-muted/50 hover:text-ink transition-colors"
              title="编辑"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-1.5">
            {field === 'cognitive_style' ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] text-ink bg-white border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                {Object.entries(COGNITIVE_STYLES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[13px] text-ink bg-white border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ink/20"
                rows={field === 'learning_goal' ? 3 : 2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(field); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
            )}
            {field === 'interests' && (
              <p className="text-[10px] text-muted/60">多个兴趣用逗号或空格分隔</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => saveEdit(field)}
                className="px-2.5 py-1 text-[11px] bg-ink text-warm-white rounded-md hover:bg-ink-light transition-colors"
              >
                保存
              </button>
              <button
                onClick={cancelEdit}
                className="px-2.5 py-1 text-[11px] text-muted hover:text-ink transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          chipLabel ? (
            <div className="inline-block px-3 py-1 bg-cream rounded-full text-[13px] text-ink">{chipLabel}</div>
          ) : (
            <p className="text-[13px] text-ink">{displayValue}</p>
          )
        )}
      </div>
    );
  }
}
