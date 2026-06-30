import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { askTutorStream, fetchProfile, type StudentProfile } from '../../services/api'
import ImageUploader, { type ImageItem } from '../../components/ImageUploader'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import CodeBlock from '../../components/CodeBlock'

interface ChatMsg {
  role: 'user' | 'ai'
  content: string
  images?: string[]  // base64 data URLs
}

const DEFAULT_HINTS = [
  '什么是过拟合？怎么防止？',
  '解释反向传播算法',
  'SVM 和逻辑回归的区别',
  'Transformer 的注意力机制是什么？',
]

export default function TutoringPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as { prefill?: string })?.prefill || ''

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 加载画像（用于生成快捷问题）
  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => {})
  }, [])

  // 自动滚到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // 从错题本跳转时自动填充
  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [prefill])

  // 生成快捷问题
  const getHints = (): string[] => {
    const hints: string[] = []
    if (profile?.weak_points) {
      profile.weak_points.slice(0, 2).forEach((wp) => hints.push(`帮我解释${wp}`))
    }
    if (profile?.knowledge_base) {
      const weakest = Object.entries(profile.knowledge_base)
        .sort(([, a], [, b]) => a - b)[0]
      if (weakest && weakest[1] < 0.4) {
        hints.push(`${weakest[0]} 我不太理解，能讲讲吗？`)
      }
    }
    DEFAULT_HINTS.forEach((h) => { if (hints.length < 4) hints.push(h) })
    return hints.slice(0, 4)
  }

  const handleSend = async (text?: string) => {
    const question = (text || input).trim()
    if (!question && images.length === 0) return
    if (loading) return

    const imageUrls = images.map((img) => img.base64)
    const userMsg: ChatMsg = { role: 'user', content: question, images: imageUrls.length > 0 ? imageUrls : undefined }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setImages([])
    setLoading(true)

    // 添加 AI 占位
    setMessages((prev) => [...prev, { role: 'ai', content: '' }])

    const history = messages.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }))

    await askTutorStream(
      { question, images: imageUrls, history },
      // onChunk
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
      // onDone
      () => { setLoading(false) },
      // onError
      (err) => {
        setLoading(false)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last.role === 'ai' && !last.content) {
            updated[updated.length - 1] = { ...last, content: `抱歉，出了点问题：${err}` }
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

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 bg-white/80 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-gray-800 text-sm">AI 答疑</span>
        </div>
        <button
          onClick={() => setMessages([])}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          🗑 清空对话
        </button>
      </div>

      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          /* 欢迎页 */
          <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center text-4xl shadow-lg shadow-indigo-200">
                🤖
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white text-xs border-2 border-white shadow-sm">✓</div>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">AI 答疑助手</h2>
            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
              有不懂的问题？随时问我！<br />
              支持文字提问、📸 拍照搜题、📋 粘贴截图
            </p>
            <div className="grid grid-cols-1 gap-2.5 w-full">
              {getHints().map((hint, i) => (
                <button
                  key={hint}
                  onClick={() => handleSend(hint)}
                  className="text-left px-5 py-3.5 bg-white rounded-xl border border-gray-100 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-sm text-gray-700 group"
                >
                  <span className="text-indigo-400 group-hover:text-indigo-600 transition-colors">💡</span>{' '}
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 消息列表 */
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeUp_0.3s_ease-out]`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] text-white">AI</div>
                      <span className="text-[11px] text-gray-400 font-medium">AI 导师</span>
                    </div>
                  )}
                  {/* 用户消息：图片 + 文字 */}
                  {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 justify-end">
                      {msg.images.map((img, j) => (
                        <img key={j} src={img} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                      ))}
                    </div>
                  )}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-md shadow-sm shadow-indigo-200'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm'
                  }`}>
                    {msg.role === 'ai' ? (
                      msg.content ? (
                        <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ code: CodeBlock as never }}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* 图片预览 */}
          {images.length > 0 && (
            <div className="mb-2">
              <ImageUploader images={images} onChange={setImages} />
            </div>
          )}

          {/* 输入框 */}
          <div className="flex items-end gap-2">
            {/* 上传按钮（无图片时显示） */}
            {images.length === 0 && (
              <ImageUploader images={images} onChange={setImages} />
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题...（支持拍照、上传图片、粘贴截图）"
              rows={1}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none disabled:opacity-50 transition-all max-h-[150px]"
              style={{ minHeight: '44px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || (!input.trim() && images.length === 0)}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 min-h-[44px]"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : '发送'}
            </button>
          </div>

          {/* 移动端拍照快捷入口 */}
          {images.length === 0 && (
            <div className="mt-2 sm:hidden">
              <ImageUploader images={images} onChange={setImages} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
