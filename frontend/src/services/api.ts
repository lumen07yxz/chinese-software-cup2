const API_BASE = '/api'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StudentProfile {
  knowledge_base: Record<string, number>
  cognitive_style: string
  weak_points: string[]
  learning_goal: string
  available_time: string
  interests: string[]
  conversation_summary: string
}

export interface ConversationItem {
  id: number
  title: string
  created_at: string
  updated_at: string
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers })
}

// ── 认证 API ────────────────────────────────────────────────

export async function login(username: string, password: string) {
  console.log('[api login] calling /api/auth/login with', { username })
  const resp = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '登录失败' }))
    console.error('[login failed]', resp.status, err)
    throw new Error(err.detail || '登录失败')
  }
  const data = await resp.json()
  console.log('[login success]', data)
  return data
}

export async function register(username: string, password: string, nickname?: string) {
  const resp = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, nickname: nickname || username }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '注册失败' }))
    throw new Error(err.detail || '注册失败')
  }
  return resp.json()
}

// ── 对话 API ────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  conversationId: number | null,
  onChunk: (text: string) => void,
  onDone: (conversationId: number) => void,
  onError: (err: string) => void,
  onEvent?: (type: string, data: unknown) => void,
): Promise<void> {
  try {
    const body: Record<string, unknown> = { message }
    if (conversationId) body.conversation_id = conversationId
    const resp = await apiFetch('/chat/stream', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!resp.ok) { onError(`HTTP ${resp.status}`); return }
    const reader = resp.body?.getReader()
    if (!reader) { onError('No reader'); return }
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') onChunk(data.content)
            else if (data.type === 'done') {
              onDone(data.conversation_id || 0)
            }
            else if (data.type === 'error') onError(data.content)
            else if (onEvent) onEvent(data.type as string, data)
          } catch { /* skip */ }
        }
      }
    }
  } catch (e: unknown) { onError(e instanceof Error ? e.message : 'Network error') }
}

export async function fetchConversations(): Promise<{ conversations: ConversationItem[] }> {
  const resp = await apiFetch('/conversations/')
  return resp.json()
}

export async function createConversation() {
  const resp = await apiFetch('/conversations/', {
    method: 'POST',
    body: JSON.stringify({ title: '新对话' }),
  })
  return resp.json()
}

export async function fetchConversationMessages(conversationId: number) {
  const resp = await apiFetch(`/conversations/${conversationId}/messages`)
  return resp.json()
}

export async function deleteConversation(conversationId: number) {
  const resp = await apiFetch(`/conversations/${conversationId}`, { method: 'DELETE' })
  return resp.json()
}

// ── 画像 API ────────────────────────────────────────────────

export async function fetchProfile(): Promise<StudentProfile | null> {
  try {
    const resp = await apiFetch('/profile/')
    if (!resp.ok) return null
    const data = await resp.json()
    return data.profile
  } catch { return null }
}

// ── 资源 API ────────────────────────────────────────────────

export async function fetchResources(type?: string) {
  const params = new URLSearchParams()
  if (type) params.set('resource_type', type)
  const qs = params.toString()
  const resp = await apiFetch(`/resources/${qs ? '?' + qs : ''}`)
  return resp.json()
}

export async function generateResources(data: Record<string, unknown>) {
  const resp = await apiFetch('/resources/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return resp
}

export async function fetchResourceDetail(id: number) {
  const resp = await apiFetch(`/resources/${id}`)
  return resp.json()
}

// ── 学习路径 API ────────────────────────────────────────────

export async function fetchLearningPath() {
  const resp = await apiFetch('/learning-path/')
  return resp.json()
}

export async function generateLearningPath(data: Record<string, unknown>) {
  const resp = await apiFetch('/learning-path/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return resp
}

// ── 学习评估 API ────────────────────────────────────────────

export async function fetchAssessment() {
  const resp = await apiFetch('/assessment/')
  return resp.json()
}

export async function recordBehavior(data: Record<string, unknown>) {
  const resp = await apiFetch('/assessment/record', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return resp.json()
}

// ── SSE 流式通用读取函数 ────────────────────────────────────

function readSSEStream<T extends string>(
  resp: Response,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onEvent?: (type: T, data: unknown) => void,
): Promise<void> {
  return new Promise(async (resolve) => {
    if (!resp.ok) { onError(`HTTP ${resp.status}`); resolve(); return }
    const reader = resp.body?.getReader()
    if (!reader) { onError('No reader'); resolve(); return }
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') onChunk(data.content)
            else if (data.type === 'done') { onDone(); resolve() }
            else if (data.type === 'error') onError(data.content)
            else if (onEvent) onEvent(data.type as T, data)
          } catch { /* skip */ }
        }
      }
    }
    onDone()
    resolve()
  })
}

export async function generateLearningPathStream(
  data: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const resp = await apiFetch('/learning-path/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(resp, onChunk, onDone, onError)
}

export async function generateAssessmentStream(
  data: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const resp = await apiFetch('/assessment/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(resp, onChunk, onDone, onError)
}

/** Agent 状态事件类型 */
export interface AgentStatusEvent {
  agent: string
  label: string
  icon: string
  status: 'working' | 'done' | 'error'
  message: string
}

/**
 * 流式资源生成 —— 支持 agent_status 事件展示多智能体协作过程
 */
export async function generateResourcesStream(
  data: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onAgentStatus?: (status: AgentStatusEvent) => void,
): Promise<void> {
  const resp = await apiFetch('/resources/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(
    resp,
    onChunk,
    onDone,
    onError,
    (type, eventData) => {
      if (type === 'agent_status' && onAgentStatus) {
        onAgentStatus((eventData as Record<string, unknown>).data as AgentStatusEvent)
      }
    },
  )
}
