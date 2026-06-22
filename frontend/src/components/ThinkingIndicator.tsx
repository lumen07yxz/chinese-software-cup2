/**
 * AI 思考中动画组件
 * 显示 AIIcon + 呼吸光环 + 动态圆点
 */
import AIIcon from './AIIcon'

export default function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {/* AI 头像带呼吸光环 */}
      <div className="relative">
        <AIIcon size={36} />
        {/* 呼吸光环 — 在外面再包一圈 */}
        <div className="absolute -inset-1 rounded-full border-2 border-amber/30 animate-[thinkingPulse_1.5s_ease-in-out_infinite]" />
      </div>

      {/* 动态圆点 */}
      <div className="flex items-center gap-1 px-4 py-2.5 bg-surface border border-border rounded-lg">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-amber"
            style={{
              animation: `thinkingDot 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
