import { useState, useEffect, useRef } from 'react'
import { startFeynman, feynmanMessageStream, type FeynmanResult } from '../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  role: 'ai' | 'user'
  content: string
}

interface FeynmanPanelProps {
  concept: string
  topic: string
  courseId?: number
  onComplete: (concept: string, understanding: number) => void
  onSkip: () => void
}

const STAGE_CONFIG = {
  confused: { label: '还需努力', color: 'text-red-500', bg: 'bg-red-500', emoji: '🤔', hint: '理解有偏差，再想想' },
  partial: { label: '方向正确', color: 'text-amber-500', bg: 'bg-amber-500', emoji: '😊', hint: '部分理解，继续完善' },
  mastery: { label: '理解透彻', color: 'text-green-500', bg: 'bg-green-500', emoji: '🤩', hint: '非常棒！' },
}

export default function FeynmanPanel({ concept, topic, courseId, onComplete, onSkip }: FeynmanPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [understanding, setUnderstanding] = useState(0)
  const [stage, setStage] = useState<'confused' | 'partial' | 'mastery'>('confused')
  const [turns, setTurns] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // 启动费曼对话
  useEffect(() => {
    startFeynman({ concept, topic, course_id: courseId })
      .then((res) => {
        setMessages([{ role: 'ai', content: res.opening }])
        setLoading(false)
        setTimeout(() => inputRef.current?.focus(), 300)
      })
      .catch(() => {
        setMessages([{ role: 'ai', content: `你能用自己的话解释一下「${concept}」是什么意思吗？` }])
        setLoading(false)
      })
  }, [concept, topic, courseId])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    setSending(true)
    setShowHint(false)

    const newMessages = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(newMessages)
    setTurns((t) => t + 1)

    // 添加"思考中"占位
    setMessages([...newMessages, { role: 'ai', content: '' }])

    await feynmanMessageStream(
      {
        concept,
        topic,
        user_message: userMsg,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        course_id: courseId,
      },
      // onChunk: 流式文本
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'ai') {
            updated[updated.length - 1] = { ...last, content: last.content + chunk }
          }
          return updated
        })
      },
      // onResult: 结构化结果
      (result: FeynmanResult) => {
        setUnderstanding(result.understanding)
        setStage(result.stage)
        // 用最终的 feedback 替换流式文本
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'ai' && result.feedback) {
            updated[updated.length - 1] = { ...last, content: result.feedback }
          }
          return updated
        })
      },
      // onDone
      () => {
        setSending(false)
      },
      // onError
      () => {
        setSending(false)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'ai' && !last.content) {
            updated[updated.length - 1] = { ...last, content: '抱歉，我刚才走神了。你能再解释一次吗？' }
          }
          return updated
        })
      },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const config = STAGE_CONFIG[stage]
  const pct = Math.round(understanding * 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: '500px', maxHeight: '700px' }}>
      {/* 顶栏：概念 + 理解度 */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <span className="text-sm font-semibold text-gray-800">费曼学习法</span>
          </div>
          <span className="text-xs text-gray-400">第 {turns} 轮对话</span>
        </div>

        {/* 概念标签 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">正在解释：</span>
          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">{concept}</span>
        </div>

        {/* 理解度条 */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-3 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full ${config.bg} rounded-full transition-all duration-700 ease-out`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-lg">{config.emoji}</span>
            <div>
              <span className={`text-sm font-bold ${config.color}`}>{pct}%</span>
              <span className="text-[11px] text-gray-400 ml-1">{config.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-pulse text-3xl mb-2">🧠</div>
              <p className="text-sm text-gray-400">小智正在思考开场白...</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">🧑‍🎓</span>
                    <span className="text-[11px] text-gray-400">小智</span>
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {msg.role === 'ai' ? (
                    msg.content ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    )
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 底部操作区 */}
      <div className="border-t border-gray-100 px-5 py-4">
        {/* 理解度达标时显示完成按钮 */}
        {understanding >= 0.8 && !sending && turns >= 2 ? (
          <div className="flex gap-2">
            <button
              onClick={() => onComplete(concept, understanding)}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium"
            >
              🎉 我理解了，完成这个概念
            </button>
            <button
              onClick={onSkip}
              className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm"
            >
              跳过
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="用自己的话解释这个概念..."
                rows={2}
                disabled={sending}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-50 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 self-end"
              >
                {sending ? '...' : '发送'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={() => setShowHint(!showHint)}
                className="text-[12px] text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                {showHint ? '收起提示' : '💡 给我一个提示'}
              </button>
              <button
                onClick={onSkip}
                className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                ⏭️ 跳过这个概念
              </button>
            </div>
            {showHint && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-600 animate-[fadeIn_0.2s_ease-out]">
                💡 试试用一个生活中的例子来类比「{concept}」，比如把它比作日常生活中的某个过程。
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
