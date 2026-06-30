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

export async function login(username: string, password: string, rememberMe = false) {
  const resp = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, remember_me: rememberMe }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '登录失败' }))
    throw new Error(err.detail || '登录失败')
  }
  const data = await resp.json()
  return data
}

export async function register(
  username: string,
  password: string,
  nickname?: string,
  securityQuestion?: string,
  securityAnswer?: string,
) {
  const body: Record<string, string> = { username, password, nickname: nickname || username }
  if (securityQuestion && securityAnswer) {
    body.security_question = securityQuestion
    body.security_answer = securityAnswer
  }
  const resp = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '注册失败' }))
    throw new Error(err.detail || '注册失败')
  }
  return resp.json()
}

export async function verifyUsername(username: string) {
  const resp = await apiFetch('/auth/verify-username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
  if (!resp.ok) return { available: false, message: '查询失败' }
  return resp.json()
}

export async function forgotPassword(
  step: 'get_question' | 'verify_and_reset',
  username: string,
  answer?: string,
  newPassword?: string,
) {
  const body: Record<string, string> = { step, username }
  if (answer) body.answer = answer
  if (newPassword) body.new_password = newPassword
  const resp = await apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '操作失败' }))
    throw new Error(err.detail || '操作失败')
  }
  return resp.json()
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const resp = await apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: '修改失败' }))
    throw new Error(err.detail || '修改失败')
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

export async function deleteResource(id: number) {
  const resp = await apiFetch(`/resources/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('删除资源失败')
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
  onUserDocsReferenced?: (titles: string[]) => void,
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
      } else if (type === 'user_docs_referenced' && onUserDocsReferenced) {
        const d = eventData as Record<string, unknown>
        onUserDocsReferenced((d.data as { titles: string[] }).titles || [])
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

/** Stage 1: SSE 流式生成 PPT 大纲 */
export interface PPTOutlinePage {
  id: number
  title: string
  type: 'cover' | 'content' | 'chart' | 'summary'
  keyPoints: string[]
}

export interface PPTOutline {
  title: string
  description: string
  pages: PPTOutlinePage[]
}

export function generatePPTOutlineSSE(
  topic: string,
  onTextChunk: (text: string) => void,
  onOutline: (outline: PPTOutline) => void,
  onError: (msg: string) => void,
  onDone: () => void,
) {
  const token = localStorage.getItem('auth_token')
  fetch(`${API_BASE}/ppt/outline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ topic }),
  }).then(async (resp) => {
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error((err as Record<string, unknown>).detail as string || '大纲生成失败')
    }
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('无法读取流')
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const dataStr = line.slice(6)
        try {
          const evt = JSON.parse(dataStr)
          if (evt.type === 'text') onTextChunk(evt.content)
          else if (evt.type === 'outline') onOutline(evt.data)
          else if (evt.type === 'error') onError(evt.content)
          else if (evt.type === 'done') onDone()
        } catch { /* skip malformed */ }
      }
    }
    onDone()
  }).catch((e: Error) => onError(e.message))
}

/** Stage 2: 基于编辑后的大纲创建 PPT */
export async function createPPTFromOutline(data: {
  outline: PPTOutline
  language?: string
  search?: number
}) {
  const resp = await apiFetch('/ppt/create-from-outline', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || 'PPT 生成失败')
  }
  return resp.json()
}

// ── PPT 历史记录 API ──────────────────────────────────────────

export interface PPTRecord {
  id: number
  title: string
  outline: PPTOutline
  source: string
  file_url: string
  has_local_file: boolean
  task_id: string
  created_at: string
}

export async function fetchPPTRecords(): Promise<{ records: PPTRecord[] }> {
  const resp = await apiFetch('/ppt/records')
  if (!resp.ok) return { records: [] }
  return resp.json()
}

export async function savePPTRecord(data: {
  title: string
  outline?: PPTOutline
  task_id?: string
  file_url?: string
  source?: string
}) {
  const resp = await apiFetch('/ppt/records', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) return null
  return resp.json()
}

export async function updatePPTRecord(recordId: number, data: {
  file_url?: string
  file_path?: string
}) {
  const resp = await apiFetch(`/ppt/records/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  return resp.ok
}

export async function deletePPTRecord(recordId: number) {
  const resp = await apiFetch(`/ppt/records/${recordId}`, { method: 'DELETE' })
  return resp.ok
}

export function getPPTFileUrl(recordId: number): string {
  const token = localStorage.getItem('auth_token')
  return `${API_BASE}/ppt/records/${recordId}/file?token=${token}`
}

// ── 掌握度 API ────────────────────────────────────────────────

export async function fetchMastery() {
  const resp = await apiFetch('/mastery/')
  return resp.json()
}

export async function fetchWeakConcepts(threshold = 0.4) {
  const resp = await apiFetch(`/mastery/weak?threshold=${threshold}`)
  return resp.json()
}

export async function updateMastery(data: { concept_id: string; outcome: string; quality?: number }) {
  const resp = await apiFetch('/mastery/update', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return resp.json()
}

// ── 每日计划 API ──────────────────────────────────────────────

export async function fetchDailyPlan(availableMinutes?: number) {
  const qs = availableMinutes ? `?available_minutes=${availableMinutes}` : ''
  const resp = await apiFetch(`/daily-plan/${qs}`)
  return resp.json()
}

// ── 闪卡 API ──────────────────────────────────────────────────

export async function fetchDueFlashcards() {
  const resp = await apiFetch('/flashcards/due')
  if (!resp.ok) return { cards: [], total: 0 }
  return resp.json()
}

export async function fetchAllFlashcards() {
  const resp = await apiFetch('/flashcards/list')
  if (!resp.ok) return { cards: [], total: 0 }
  return resp.json()
}

export async function generateFlashcards(data: { topic: string; content: string; count?: number }) {
  const resp = await apiFetch('/flashcards/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || '闪卡生成失败')
  }
  return resp.json()
}

export async function reviewFlashcard(data: { card_id: number; quality: number }) {
  const resp = await apiFetch('/flashcards/review', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('复习记录失败')
  return resp.json()
}

export async function fetchFlashcardStats() {
  const resp = await apiFetch('/flashcards/stats')
  if (!resp.ok) return { total_cards: 0, due_reviews: 0, avg_ease_factor: 2.5, total_reviews: 0, estimated_minutes: 0 }
  return resp.json()
}

// ── 学习旅程 API ──────────────────────────────────────────────

export async function fetchLearningJourney() {
  const resp = await apiFetch('/learning-journey/')
  return resp.json()
}

// ── 诊断 API ──────────────────────────────────────────────────

export async function diagnoseError(data: {
  question: string; correct_answer: string; student_answer: string; concept?: string
}) {
  const resp = await apiFetch('/diagnose', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return resp.json()
}

// ── 实时学情 API ──────────────────────────────────────────────

export async function fetchRealtimeStateHistory(limit = 10) {
  const resp = await apiFetch(`/realtime-state/history?limit=${limit}`)
  return resp.json()
}

export async function fetchCurrentRealtimeState() {
  const resp = await apiFetch('/realtime-state/current')
  return resp.json()
}

// ── 课堂 API ──────────────────────────────────────────────────

export interface CourseLesson {
  title: string
  description: string
  difficulty: string
  duration_min: number
  key_concepts: string[]
}

export async function fetchClassroomOutline(data: { topic: string; description?: string }) {
  const resp = await apiFetch('/classroom/outline', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error((err as Record<string, unknown>).detail as string || '课程大纲生成失败')
  }
  return resp.json() as Promise<{ topic: string; outline: CourseLesson[]; total: number }>
}

export interface ClassroomQuestion {
  type: string
  question: string
  options?: string[]
  answer: string
  explanation: string
  concept_id?: string
}

export async function startClassroom(
  data: { node_id?: string; chapter?: string; topic?: string; lesson_title?: string; lesson_description?: string },
  onPhase: (phase: string, topic?: string) => void,
  onChunk: (phase: string, text: string) => void,
  onPhaseEnd: (phase: string) => void,
  onQuestions: (questions: ClassroomQuestion[]) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  try {
    const resp = await apiFetch('/classroom/start', {
      method: 'POST',
      body: JSON.stringify(data),
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
            const d = JSON.parse(line.slice(6))
            if (d.type === 'phase') onPhase(d.phase, d.topic)
            else if (d.type === 'text') onChunk(d.phase, d.content)
            else if (d.type === 'phase_end') onPhaseEnd(d.phase)
            else if (d.type === 'questions') onQuestions(d.questions || [])
            else if (d.type === 'done') onDone()
            else if (d.type === 'error') onError(d.content)
          } catch { /* skip */ }
        }
      }
    }
  } catch (e: unknown) { onError(e instanceof Error ? e.message : 'Network error') }
}

export async function submitClassroomPractice(results: { concept_id?: string; correct: boolean; question: string }[]) {
  const resp = await apiFetch('/classroom/submit-practice', {
    method: 'POST',
    body: JSON.stringify({ results }),
  })
  return resp.json()
}

// ── 课程保存 API ──────────────────────────────────────────────

export interface SavedCourse {
  id: number
  topic: string
  description: string
  outline: CourseLesson[]
  completed_lessons: string[]
  total: number
  completed_count: number
  created_at: string
  updated_at: string
}

export async function saveCourse(data: { topic: string; description?: string; outline: CourseLesson[] }) {
  const resp = await apiFetch('/classroom/save', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('课程保存失败')
  return resp.json() as Promise<{ course_id: number; saved: boolean }>
}

export async function fetchSavedCourses() {
  const resp = await apiFetch('/classroom/courses')
  if (!resp.ok) return { courses: [] }
  return resp.json() as Promise<{ courses: SavedCourse[] }>
}

export async function completeCourseLesson(data: { course_id: number; lesson_title: string }) {
  const resp = await apiFetch('/classroom/complete-lesson', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) return { completed_lessons: [], completed_count: 0, total: 0 }
  return resp.json()
}

export async function deleteSavedCourse(courseId: number) {
  const resp = await apiFetch(`/classroom/courses/${courseId}`, { method: 'DELETE' })
  return resp.json()
}

// ── 费曼学习法 API ────────────────────────────────────────────

export interface FeynmanResult {
  understanding: number
  stage: 'confused' | 'partial' | 'mastery'
  feedback: string
}

export async function startFeynman(data: { concept: string; topic: string; course_id?: number }) {
  const resp = await apiFetch('/classroom/feynman/start', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('费曼学习启动失败')
  return resp.json() as Promise<{ opening: string; concept: string }>
}

export async function feynmanMessageStream(
  data: { concept: string; topic: string; user_message: string; history: { role: string; content: string }[]; course_id?: number },
  onChunk: (text: string) => void,
  onResult: (result: FeynmanResult) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  try {
    const resp = await apiFetch('/classroom/feynman/message', {
      method: 'POST',
      body: JSON.stringify(data),
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
            const d = JSON.parse(line.slice(6))
            if (d.type === 'text') onChunk(d.content)
            else if (d.type === 'result') onResult(d as FeynmanResult)
            else if (d.type === 'done') onDone()
            else if (d.type === 'error') onError(d.content)
          } catch { /* skip */ }
        }
      }
    }
  } catch (e: unknown) { onError(e instanceof Error ? e.message : 'Network error') }
}

export async function fetchFeynmanStats() {
  const resp = await apiFetch('/classroom/feynman/stats')
  if (!resp.ok) return { total_sessions: 0, avg_understanding: 0, concepts_covered: [], mastery_count: 0 }
  return resp.json()
}

// ── AI 答疑 API ────────────────────────────────────────────────

export async function askTutorStream(
  data: { question: string; images?: string[]; history?: { role: string; content: string }[]; context?: string; profile?: Record<string, unknown> },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  try {
    const resp = await apiFetch('/tutoring/ask', {
      method: 'POST',
      body: JSON.stringify(data),
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
            const d = JSON.parse(line.slice(6))
            if (d.type === 'text') onChunk(d.content)
            else if (d.type === 'done') onDone()
            else if (d.type === 'error') onError(d.content)
          } catch { /* skip */ }
        }
      }
    }
    onDone()
  } catch (e: unknown) { onError(e instanceof Error ? e.message : 'Network error') }
}

// ── 后台任务 API ──────────────────────────────────────────────

export interface TaskInfo {
  id: string
  kind: string
  label: string
  status: 'running' | 'done' | 'error'
  progress: number
  message: string
  created_at: string
  updated_at: string
}

export async function fetchActiveTasks(): Promise<{ tasks: TaskInfo[] }> {
  const resp = await apiFetch('/tasks/')
  return resp.json()
}

// ── 知识库 API ────────────────────────────────────────────────

export interface KnowledgeDocument {
  id: number
  title: string
  content: string
  notes: string
  file_format: string
  source_type: string
  tags: string[]
  has_notes?: boolean
  spark_file_status?: string
  created_at: string
  updated_at: string
  length: number
}

export interface KnowledgeSearchResult {
  id: string
  content: string
  title: string
  score: number
  doc_id: number
}

export async function fetchKnowledgeDocument(id: number): Promise<KnowledgeDocument> {
  const resp = await apiFetch(`/knowledge/documents/${id}`)
  if (!resp.ok) throw new Error('文档加载失败')
  return resp.json()
}

export async function updateKnowledgeDocument(
  id: number,
  data: { title?: string; content?: string; notes?: string; tags?: string[] },
): Promise<{ status: string; id: number }> {
  const resp = await apiFetch(`/knowledge/documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('更新失败')
  return resp.json()
}

export async function searchKnowledgeBase(
  query: string,
  top_k?: number,
): Promise<{ results: KnowledgeSearchResult[] }> {
  const resp = await apiFetch('/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query, top_k: top_k || 10 }),
  })
  if (!resp.ok) throw new Error('搜索失败')
  return resp.json()
}

export async function listKnowledgeDocuments(): Promise<{ documents: KnowledgeDocument[] }> {
  const resp = await apiFetch('/knowledge/documents')
  if (!resp.ok) throw new Error('文档列表加载失败')
  return resp.json()
}

/** FormData 上传（不设 Content-Type，由浏览器自动加 boundary） */
export async function uploadKnowledgeFile(formData: FormData) {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(`${API_BASE}/knowledge/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (resp.status === 401 && token) { handle401(); throw new Error('认证已过期') }
  if (!resp.ok) throw new Error('上传失败')
  return resp.json()
}

/** 知识库 AI 问答 SSE 流 */
export async function askKnowledgeBaseStream(
  data: { question: string; history?: { role: string; content: string }[] },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onSources?: (sources: { title: string; score: number; doc_id: number }[]) => void,
  onReferences?: (refs: Record<string, unknown>) => void,
): Promise<void> {
  const resp = await apiFetch('/knowledge/ask', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(resp, onChunk, onDone, onError, (type, eventData) => {
    if (type === 'sources' && onSources) {
      onSources((eventData as Record<string, unknown>).sources as { title: string; score: number; doc_id: number }[])
    } else if (type === 'references' && onReferences) {
      onReferences((eventData as Record<string, unknown>).data as Record<string, unknown>)
    }
  })
}

/** 星火知识库原生 RAG 对话（直接调用星火服务端检索+生成） */
export async function askKnowledgeNativeStream(
  data: { question: string; history?: { role: string; content: string }[] },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onReferences?: (refs: Record<string, unknown>) => void,
): Promise<void> {
  const resp = await apiFetch('/knowledge/ask-native', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return readSSEStream(resp, onChunk, onDone, onError, (type, eventData) => {
    if (type === 'references' && onReferences) {
      onReferences((eventData as Record<string, unknown>).data as Record<string, unknown>)
    }
  })
}

/** 联网搜索 */
export async function webSearchKnowledge(query: string, top_k = 5) {
  const resp = await apiFetch('/knowledge/web-search', {
    method: 'POST',
    body: JSON.stringify({ query, top_k }),
  })
  if (!resp.ok) throw new Error('搜索失败')
  return resp.json()
}

/** 保存搜索结果 */
export async function saveWebSearchResult(data: { title: string; content: string; tags?: string[] }) {
  const resp = await apiFetch('/knowledge/web-search/save', {
    method: 'POST',
    body: JSON.stringify({ ...data, source_type: 'web' }),
  })
  if (!resp.ok) throw new Error('保存失败')
  return resp.json()
}

/** 删除知识文档 */
export async function deleteKnowledgeDocument(id: number) {
  const resp = await apiFetch(`/knowledge/documents/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('删除失败')
  return resp.json()
}
