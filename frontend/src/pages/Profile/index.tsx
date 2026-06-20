import { useState } from 'react'
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import ProfilePanel from '../../components/ProfilePanel'
import { updateProfile as apiUpdateProfile } from '../../services/api'

const COGNITIVE_STYLES = ['visual', 'verbal', 'active', 'reflective']
const COGNITIVE_LABELS: Record<string, string> = {
  visual: '视觉型 (Visual)',
  verbal: '语言型 (Verbal)',
  active: '动手型 (Active)',
  reflective: '反思型 (Reflective)',
}

const ALL_INTERESTS = [
  '机器学习', '深度学习', '自然语言处理', '计算机视觉',
  '强化学习', 'AI 伦理', '自动驾驶', 'AI 医疗',
  'AI 教育', '机器人', '数据分析', '知识图谱',
]

export default function ProfilePage() {
  const { profile, setProfile } = useProfileStore()
  const { user } = useAuthStore()
  const [editing, setEditing] = useState<'goal' | 'style' | 'time' | 'interests' | null>(null)
  const [saving, setSaving] = useState(false)

  // Editable state copies
  const [editGoal, setEditGoal] = useState('')
  const [editStyle, setEditStyle] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editInterests, setEditInterests] = useState<string[]>([])

  const startEdit = (field: 'goal' | 'style' | 'time' | 'interests') => {
    if (!profile) return
    switch (field) {
      case 'goal': setEditGoal(profile.learning_goal || ''); break
      case 'style': setEditStyle(profile.cognitive_style || ''); break
      case 'time': setEditTime(profile.available_time || ''); break
      case 'interests': setEditInterests([...(profile.interests || [])]); break
    }
    setEditing(field)
  }

  const saveEdit = async (field: 'goal' | 'style' | 'time' | 'interests') => {
    setSaving(true)
    let updateData: Record<string, unknown> = {}
    switch (field) {
      case 'goal': updateData = { learning_goal: editGoal }; break
      case 'style': updateData = { cognitive_style: editStyle }; break
      case 'time': updateData = { available_time: editTime }; break
      case 'interests': updateData = { interests: editInterests }; break
    }

    const updated = { ...profile, ...updateData } as Record<string, unknown>
    // Optimistic save
    setProfile(updated as unknown as Parameters<typeof setProfile>[0], user?.username)

    try {
      await apiUpdateProfile(updateData)
    } catch { /* fallback to local */ }
    setSaving(false)
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)

  const toggleInterest = (i: string) => {
    setEditInterests(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-ink">我的学习画像</h1>
      </div>

      <ProfilePanel profile={profile} />

      {/* Editable fields */}
      <div className="mt-6 space-y-3">
        {/* Learning Goal */}
        {editing === 'goal' ? (
          <div className="p-4 rounded-lg border border-ink/30 bg-surface">
            <label className="text-sm font-medium text-ink mb-2 block">修改学习目标</label>
            <textarea
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 min-h-[80px]"
              placeholder="输入你的学习目标..."
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={cancelEdit} className="px-4 py-2 text-sm text-muted hover:text-ink">取消</button>
              <button onClick={() => saveEdit('goal')} disabled={saving} className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : editing === 'style' ? (
          <div className="p-4 rounded-lg border border-ink/30 bg-surface">
            <label className="text-sm font-medium text-ink mb-3 block">修改认知风格</label>
            <div className="grid grid-cols-2 gap-2">
              {COGNITIVE_STYLES.map(s => (
                <button
                  key={s}
                  onClick={() => setEditStyle(s)}
                  className={`px-4 py-3 rounded-lg text-sm transition-all ${
                    editStyle === s ? 'bg-ink text-warm-white' : 'bg-cream text-ink hover:bg-cream/80'
                  }`}
                >
                  {COGNITIVE_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={cancelEdit} className="px-4 py-2 text-sm text-muted hover:text-ink">取消</button>
              <button onClick={() => saveEdit('style')} disabled={saving} className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : editing === 'time' ? (
          <div className="p-4 rounded-lg border border-ink/30 bg-surface">
            <label className="text-sm font-medium text-ink mb-3 block">修改可用时间</label>
            {['<3h', '3-5h', '5-10h', '>10h'].map(t => (
              <button
                key={t}
                onClick={() => setEditTime(t)}
                className={`block w-full text-left px-4 py-3 rounded-lg text-sm mb-2 transition-all ${
                  editTime === t ? 'bg-ink text-warm-white' : 'bg-cream text-ink hover:bg-cream/80'
                }`}
              >
                {t === '<3h' ? '< 3小时/周' : t === '3-5h' ? '3-5小时/周' : t === '5-10h' ? '5-10小时/周' : '> 10小时/周'}
              </button>
            ))}
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={cancelEdit} className="px-4 py-2 text-sm text-muted hover:text-ink">取消</button>
              <button onClick={() => saveEdit('time')} disabled={saving} className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : editing === 'interests' ? (
          <div className="p-4 rounded-lg border border-ink/30 bg-surface">
            <label className="text-sm font-medium text-ink mb-3 block">修改兴趣方向</label>
            <div className="flex flex-wrap gap-2">
              {ALL_INTERESTS.map(i => (
                <button
                  key={i}
                  onClick={() => toggleInterest(i)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${
                    editInterests.includes(i) ? 'bg-ink text-warm-white' : 'bg-cream text-ink hover:bg-cream/80'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={cancelEdit} className="px-4 py-2 text-sm text-muted hover:text-ink">取消</button>
              <button onClick={() => saveEdit('interests')} disabled={saving} className="px-4 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {profile && (
              <>
                <EditRow
                  label="🎯 学习目标"
                  value={profile.learning_goal || '未设置'}
                  onEdit={() => startEdit('goal')}
                />
                <EditRow
                  label="🧩 认知风格"
                  value={COGNITIVE_LABELS[profile.cognitive_style || ''] || profile.cognitive_style || '未设置'}
                  onEdit={() => startEdit('style')}
                />
                <EditRow
                  label="⏰ 可用时间"
                  value={profile.available_time || '未设置'}
                  onEdit={() => startEdit('time')}
                />
                <EditRow
                  label="💡 兴趣方向"
                  value={(profile.interests || []).join('、') || '未设置'}
                  onEdit={() => startEdit('interests')}
                />
                <EditRow
                  label="📌 薄弱知识点"
                  value={(profile.weak_points || []).join('、') || '暂无'}
                  onEdit={() => {}}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Dimension explanations */}
      <div className="mt-8">
        <h2 className="text-base font-medium text-ink mb-4">画像维度说明</h2>
        <div className="space-y-3">
          {[
            { dim: '知识基础', desc: '各学科领域的当前掌握程度，通过对话和测试结果动态评估', icon: '📊' },
            { dim: '认知风格', desc: '你最适合的学习方式——视觉型喜欢图表、语言型喜欢文字、动手型喜欢实操', icon: '🧩' },
            { dim: '易错点偏好', desc: '你容易出错的题型或概念类型，系统会针对这些提供更多练习', icon: '⚠️' },
            { dim: '学习目标', desc: '你期望达成的学习成果，系统据此规划学习路径', icon: '🎯' },
            { dim: '可用时间', desc: '每周可用于学习的时间，影响学习节奏和内容深度', icon: '⏰' },
            { dim: '兴趣方向', desc: '你最感兴趣的细分领域，系统会优先推送相关内容', icon: '💡' },
          ].map((item) => (
            <div key={item.dim} className="flex gap-4 p-4 rounded-lg border border-border bg-surface">
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              <div>
                <h3 className="text-sm font-medium text-ink">{item.dim}</h3>
                <p className="text-[13px] text-muted mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EditRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-surface hover:border-muted transition-colors group">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-muted">{label}</div>
        <div className="text-sm text-ink mt-0.5 truncate">{value || '点击编辑'}</div>
      </div>
      <button
        onClick={onEdit}
        className="ml-3 px-3 py-1.5 text-xs text-muted hover:text-ink hover:bg-cream rounded-md transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
      >
        编辑
      </button>
    </div>
  )
}
