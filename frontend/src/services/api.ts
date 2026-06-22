const API_BASE = '/api'

/** 处理 401 —— 清除 token 并跳转登录页（防重复跳转） */
function handle401() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    sessionStorage.setItem('auth_expired', '1')
    window.location.href = '/login'
  }
}

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
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (resp.status === 401 && token) {
    // 仅在携带 token 的请求收到 401 时才清除认证（token 过期/失效）
    // 无 token 的 401（如登录失败）由调用方自行处理
    handle401()
    throw new Error('认证已过期，请重新登录')
  }
  return resp
}

// ── 认证 API ────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const resp = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '登录失败' }))
    throw new Error(err.detail || '登录失败')
  }
  const data = await resp.json()
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
    if (conversationId != null) body.conversation_id = conversationId
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

export async function updateProfile(data: Partial<StudentProfile>) {
  const resp = await apiFetch('/profile/update', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('更新画像失败')
  return resp.json()
}

// ── 资源 API ────────────────────────────────────────────────

export async function fetchResources(type?: string) {
  const params = new URLSearchParams()
  if (type) params.set('resource_type', type)
  const qs = params.toString()
  const resp = await apiFetch(`/resources/${qs ? '?' + qs : ''}`)
  return resp.json()
}

export async function fetchResourceDetail(id: number) {
  const resp = await apiFetch(`/resources/${id}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '加载失败' }))
    throw new Error(err.detail || `HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function updateResource(id: number, data: { title?: string; content?: string; description?: string }) {
  const resp = await apiFetch(`/resources/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('更新资源失败')
  return resp.json()
}

// ── 学习路径 API ────────────────────────────────────────────

export async function fetchLearningPath() {
  const resp = await apiFetch('/learning-path/')
  return resp.json()
}

export async function toggleNodeComplete(nodeId: string) {
  const resp = await apiFetch('/learning-path/toggle-node', {
    method: 'POST',
    body: JSON.stringify({ node_id: nodeId }),
  })
  return resp.json()
}

// ── 学习评估 API ────────────────────────────────────────────

export async function fetchAssessment() {
  const resp = await apiFetch('/assessment/')
  return resp.json()
}

export interface StudyTrendPoint {
  date: string;
  minutes: number;
  interactions: number;
  sessions: number;
}

export async function fetchStudyTrends(): Promise<{
  trends: StudyTrendPoint[];
  total_minutes: number;
  avg_per_day: number;
}> {
  const resp = await apiFetch('/assessment/trends')
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
    let doneCalled = false
    const markDone = () => {
      if (!doneCalled) {
        doneCalled = true
        onDone()
      }
    }
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
            else if (data.type === 'done') { markDone(); resolve() }
            else if (data.type === 'error') onError(data.content)
            else if (onEvent) onEvent(data.type as T, data)
          } catch { /* skip */ }
        }
      }
    }
    markDone()
    resolve()
  })
}

export async function generateLearningPathStream(
  data: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onPathData?: (pathData: Record<string, unknown>) => void,
): Promise<void> {
  const resp = await apiFetch('/learning-path/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(
    resp,
    onChunk,
    onDone,
    onError,
    (type, eventData) => {
      if (type === 'path_data' && onPathData) {
        onPathData((eventData as Record<string, unknown>).data as Record<string, unknown>)
      }
    },
  )
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

// ── PPT 生成 API ────────────────────────────────────────────

export async function createPPT(data: { query: string; language?: string; search?: number }) {
  const resp = await apiFetch('/ppt/create', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || 'PPT 生成失败')
  }
  return resp.json()
}

export async function queryPPTProgress(sid: string) {
  const resp = await apiFetch(`/ppt/progress?sid=${encodeURIComponent(sid)}`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || '查询失败')
  }
  return resp.json()
}

export async function downloadLocalPPT(taskId: string, filename: string) {
  const token = localStorage.getItem('auth_token')
  const resp = await fetch(`${API_BASE}/ppt/download/${encodeURIComponent(taskId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || '下载失败')
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
