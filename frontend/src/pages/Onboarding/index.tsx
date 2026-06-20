import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { updateProfile } from '../../services/api'

const COGNITIVE_STYLES = [
  { value: 'visual', label: '视觉型', desc: '喜欢图文、图表、思维导图等视觉化学习' },
  { value: 'verbal', label: '言语型', desc: '喜欢文字阅读、听讲、讨论交流' },
  { value: 'active', label: '活动型', desc: '喜欢动手实践、做练习、项目驱动' },
  { value: 'reflective', label: '反思型', desc: '喜欢独立思考、做笔记、反复消化' },
]

const INTERESTS_OPTIONS = [
  '机器学习', '深度学习', '自然语言处理', '计算机视觉',
  '强化学习', 'AI 伦理', '自动驾驶', 'AI 医疗',
  'AI 教育', '机器人', '数据分析', '知识图谱',
  '多模态 AI', '生成式 AI', 'AI Agent',
]

const GOAL_OPTIONS = [
  '系统学习 AI 基础知识',
  '掌握深度学习与神经网络',
  '学习 NLP 自然语言处理',
  '入门计算机视觉',
  '了解强化学习',
  'AI 项目实践与工程落地',
  '准备面试与考试',
  '拓展技术视野',
]

const TIME_OPTIONS = [
  { value: '<3h', label: '< 3小时/周', desc: '时间有限，碎片化学习' },
  { value: '3-5h', label: '3-5小时/周', desc: '中等投入，循序渐进' },
  { value: '5-10h', label: '5-10小时/周', desc: '较多投入，稳步提升' },
  { value: '>10h', label: '> 10小时/周', desc: '高强度学习，快速进阶' },
]

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const { setProfile } = useProfileStore()
  const { user } = useAuthStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<Record<string, unknown>>({})

  const update = (partial: Record<string, unknown>) => {
    setData(prev => ({ ...prev, ...partial }))
  }

  const handleNext = async (stepData: Record<string, unknown>) => {
    update(stepData)
    const merged = { ...data, ...stepData }
    setData(merged)

    if (step < 3) {
      setStep(step + 1)
    } else {
      // Final step — save to DB
      setSaving(true)
      try {
        const profileData = {
          knowledge_base: {},
          cognitive_style: (merged.cognitiveStyle as string) || 'visual',
          weak_points: [],
          learning_goal: (merged.goal as string) || '',
          available_time: (merged.availableTime as string) || '3-5h',
          interests: (merged.interests as string[]) || [],
          conversation_summary: '',
        }
        await updateProfile(profileData)
        setProfile(profileData, user?.username)
        localStorage.setItem('onboarding-complete', 'true')
        navigate('/')
      } catch {
        // Fallback — save locally
        setProfile({
          knowledge_base: {},
          cognitive_style: (merged.cognitiveStyle as string) || 'visual',
          weak_points: [],
          learning_goal: (merged.goal as string) || '',
          available_time: (merged.availableTime as string) || '3-5h',
          interests: (merged.interests as string[]) || [],
          conversation_summary: '',
        }, user?.username)
        localStorage.setItem('onboarding-complete', 'true')
        navigate('/')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleSkip = () => {
    localStorage.setItem('onboarding-complete', 'true')
    navigate('/')
  }

  const steps = [
    <Step1Goal key={0} data={data} onNext={(d) => handleNext(d)} />,
    <Step2Style key={1} data={data} onNext={(d) => handleNext(d)} />,
    <Step3Interests key={2} data={data} onNext={(d) => handleNext(d)} />,
    <Step4Time key={3} data={data} saving={saving} onNext={(d) => handleNext(d)} />,
  ]

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-ink' : i < step ? 'bg-ink/40' : 'bg-cream'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="animate-fadeIn">
          {steps[step]}
        </div>

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={handleSkip}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            跳过引导，直接开始学习 →
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Step 1: Learning Goal ── */
function Step1Goal({ data, onNext }: { data: Record<string, unknown>; onNext: (d: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<string>((data.goal as string) || '')

  return (
    <div className="text-center">
      <div className="text-4xl mb-4">🎯</div>
      <h1 className="text-xl font-semibold text-ink mb-2">你的学习目标是什么？</h1>
      <p className="text-sm text-muted mb-6">选择一个最符合你当前需求的目标，AI 会为你定制学习内容</p>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {GOAL_OPTIONS.map(g => (
          <button
            key={g}
            onClick={() => setSelected(g)}
            className={`px-4 py-3 rounded-lg text-sm text-left transition-all ${
              selected === g
                ? 'bg-ink text-warm-white shadow-sm'
                : 'bg-surface border border-border text-ink hover:border-ink/40'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext({ goal: selected })}
        disabled={!selected}
        className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
      >
        继续
      </button>
    </div>
  )
}

/* ── Step 2: Cognitive Style ── */
function Step2Style({ data, onNext }: { data: Record<string, unknown>; onNext: (d: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<string>((data.cognitiveStyle as string) || '')

  return (
    <div className="text-center">
      <div className="text-4xl mb-4">🧠</div>
      <h1 className="text-xl font-semibold text-ink mb-2">你的学习风格是？</h1>
      <p className="text-sm text-muted mb-6">了解你的学习风格，帮助 AI 选择最适合你的呈现方式</p>

      <div className="space-y-2 mb-6">
        {COGNITIVE_STYLES.map(s => (
          <button
            key={s.value}
            onClick={() => setSelected(s.value)}
            className={`w-full flex items-start gap-4 px-5 py-4 rounded-xl text-left transition-all ${
              selected === s.value
                ? 'bg-ink text-warm-white shadow-sm'
                : 'bg-surface border border-border text-ink hover:border-ink/40'
            }`}
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0
              ${selected === s.value ? 'bg-white/20' : 'bg-cream'}`}
            >
              {s.value === 'visual' ? '👁' : s.value === 'verbal' ? '📝' : s.value === 'active' ? '🔧' : '🤔'}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{s.label}</div>
              <div className={`text-xs mt-0.5 ${selected === s.value ? 'text-white/70' : 'text-muted'}`}>{s.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext({ cognitiveStyle: selected })}
        disabled={!selected}
        className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
      >
        继续
      </button>
    </div>
  )
}

/* ── Step 3: Interests ── */
function Step3Interests({ data, onNext }: { data: Record<string, unknown>; onNext: (d: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<string[]>((data.interests as string[]) || [])

  const toggle = (interest: string) => {
    setSelected(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    )
  }

  return (
    <div className="text-center">
      <div className="text-4xl mb-4">⭐</div>
      <h1 className="text-xl font-semibold text-ink mb-2">你对哪些方向感兴趣？</h1>
      <p className="text-sm text-muted mb-6">多选你感兴趣的方向（至少选 1 个）</p>

      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {INTERESTS_OPTIONS.map(i => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`px-4 py-2 rounded-full text-sm transition-all ${
              selected.includes(i)
                ? 'bg-ink text-warm-white shadow-sm'
                : 'bg-surface border border-border text-ink hover:border-ink/40'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext({ interests: selected })}
        disabled={selected.length === 0}
        className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
      >
        继续
      </button>
    </div>
  )
}

/* ── Step 4: Available Time ── */
function Step4Time({ data, saving = false, onNext }: { data: Record<string, unknown>; saving?: boolean; onNext: (d: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<string>((data.availableTime as string) || '')

  return (
    <div className="text-center">
      <div className="text-4xl mb-4">⏰</div>
      <h1 className="text-xl font-semibold text-ink mb-2">每周能投入多少时间？</h1>
      <p className="text-sm text-muted mb-6">AI 会根据你的时间安排合理规划学习节奏</p>

      <div className="space-y-2 mb-6">
        {TIME_OPTIONS.map(t => (
          <button
            key={t.value}
            onClick={() => setSelected(t.value)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl text-left transition-all ${
              selected === t.value
                ? 'bg-ink text-warm-white shadow-sm'
                : 'bg-surface border border-border text-ink hover:border-ink/40'
            }`}
          >
            <div>
              <div className="text-sm font-medium">{t.label}</div>
              <div className={`text-xs mt-0.5 ${selected === t.value ? 'text-white/70' : 'text-muted'}`}>{t.desc}</div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              selected === t.value ? 'border-white bg-white/20' : 'border-border'
            }`}>
              {selected === t.value && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext({ availableTime: selected })}
        disabled={!selected}
        className="w-full px-6 py-3 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
            </svg>
            保存中...
          </span>
        ) : '✨ 完成设置，开始学习'}
      </button>
    </div>
  )
}
