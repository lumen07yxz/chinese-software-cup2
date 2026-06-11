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

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers })
}

export async function sendChatMessage(
  message: string,
  userId: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onEvent?: (type: string, data: unknown) => void,
  existingProfile?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const body: Record<string, unknown> = { message, user_id: userId, history }
    if (existingProfile) body.profile = existingProfile
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
            else if (data.type === 'done') onDone()
            else if (data.type === 'error') onError(data.content)
            else if (onEvent) onEvent(data.type as string, data)
          } catch { /* skip */ }
        }
      }
    }
    onDone()
  } catch (e: unknown) { onError(e instanceof Error ? e.message : 'Network error') }
}

export async function fetchProfile(userId: string): Promise<StudentProfile | null> {
  try {
    const resp = await apiFetch(`/profile/${userId}`)
    if (!resp.ok) return null
    const data = await resp.json()
    return data.profile
  } catch { return null }
}

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

/** SSE 流式通用读取函数 */
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
  const resp = await fetch('/api/learning-path/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const resp = await fetch('/api/assessment/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const resp = await fetch('/api/resources/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
