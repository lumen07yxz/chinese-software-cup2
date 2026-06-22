/**
 * AIIcon — AI 助手头像
 * 使用 static/public 目录下的 ai-avatar.png
 */
export default function AIIcon({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex-shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, lineHeight: 0 }}
    >
      <img
        src="/ai-avatar.png"
        alt="AI"
        width={size}
        height={size}
        className="object-cover w-full h-full"
      />
    </div>
  )
}
