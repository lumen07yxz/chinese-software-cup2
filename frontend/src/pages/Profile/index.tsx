import { useProfileStore } from '../../stores/profileStore';
import ProfilePanel from '../../components/ProfilePanel';

export default function ProfilePage() {
  const { profile } = useProfileStore();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-lg font-semibold text-ink mb-6">我的学习画像</h1>

      <ProfilePanel profile={profile} />

      {/* Dimensional detail */}
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
  );
}
