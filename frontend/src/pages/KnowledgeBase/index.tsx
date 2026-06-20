import { useState, useRef, useEffect } from 'react'

interface SearchResult {
  title: string
  snippet: string
  url: string
}

interface Document {
  id: number
  title: string
  source_type: string
  tags: string[]
  created_at: string
  length: number
}

const API_BASE = '/api'

async function apiFetchRaw(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (resp.status === 401 && token) {
    localStorage.removeItem('auth_token')
    window.location.href = '/login'
    throw new Error('认证已过期')
  }
  return resp
}

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<'search' | 'upload' | 'documents'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const resp = await apiFetchRaw('/knowledge/web-search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, top_k: 5 }),
      })
      const data = await resp.json()
      setSearchResults(data.results || [])
    } catch { /* silent */ } finally {
      setSearching(false)
    }
  }

  const saveSearchResult = async (result: SearchResult) => {
    try {
      await apiFetchRaw('/knowledge/web-search/save', {
        method: 'POST',
        body: JSON.stringify({
          title: result.title,
          content: result.snippet,
          tags: ['web-search'],
          source_type: 'web',
        }),
      })
      setUploadStatus(`已保存：${result.title}`)
      setTimeout(() => setUploadStatus(null), 3000)
    } catch { setUploadStatus('保存失败') }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadStatus('上传中...')
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('title', file.name.replace(/\.[^/.]+$/, ''))
        await apiFetchRaw('/knowledge/upload', {
          method: 'POST',
          body: formData,
        })
      }
      setUploadStatus(`已上传 ${files.length} 个文件`)
      setTimeout(() => setUploadStatus(null), 3000)
    } catch { setUploadStatus('上传失败') }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileUpload(e.dataTransfer.files)
  }

  const importFolder = async () => {
    if (!folderPath.trim()) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('folder_path', folderPath)
      const resp = await apiFetchRaw('/knowledge/import-folder', {
        method: 'POST',
        body: formData,
      })
      const data = await resp.json()
      setUploadStatus(`已导入 ${data.total} 个文档`)
      setTimeout(() => setUploadStatus(null), 3000)
    } catch { setUploadStatus('导入失败') } finally {
      setImporting(false)
    }
  }

  const loadDocuments = async () => {
    try {
      const resp = await apiFetchRaw('/knowledge/documents')
      const data = await resp.json()
      setDocuments(data.documents || [])
    } catch { /* silent */ }
  }

  const deleteDocument = async (id: number) => {
    try {
      await apiFetchRaw(`/knowledge/documents/${id}`, { method: 'DELETE' })
      loadDocuments()
    } catch { /* silent */ }
  }

  // Load documents on tab switch
  useEffect(() => {
    if (tab === 'documents') loadDocuments()
  }, [tab])

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink">知识库管理</h1>
        <p className="text-sm text-muted mt-0.5">导入自有知识文档、联网搜索补充学习内容</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'search', label: '🔍 联网搜索' },
          { key: 'upload', label: '📁 导入知识' },
          { key: 'documents', label: '📚 我的文档' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key)
              if (t.key === 'documents') loadDocuments()
            }}
            className={`px-4 py-2.5 text-[13px] border-b-2 transition-colors ${
              tab === t.key
                ? 'border-ink text-ink font-medium'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {uploadStatus && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {uploadStatus}
        </div>
      )}

      {/* ── Tab: Web Search ── */}
      {tab === 'search' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索你想学习的内容（如 Python 异步编程教程）..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-5 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
            >
              {searching ? '搜索中...' : '搜索'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((r, i) => (
                <div key={i} className="p-4 rounded-lg border border-border bg-surface hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-ink mb-1">{r.title}</h3>
                      <p className="text-[13px] text-muted leading-relaxed">{r.snippet}</p>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="text-[12px] text-blue-600 hover:underline mt-1 inline-block">
                          {r.url}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => saveSearchResult(r)}
                      className="flex-shrink-0 px-3 py-1.5 text-[12px] bg-cream text-ink rounded-md hover:bg-ink hover:text-warm-white transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searching && searchResults.length === 0 && (
            <div className="text-center py-12 text-sm text-muted">
              输入关键词搜索最新学习资料
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Upload / Import ── */}
      {tab === 'upload' && (
        <div className="space-y-6">
          {/* Drag & Drop */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-ink bg-ink/5' : 'border-border hover:border-muted'
            }`}
          >
            <div className="text-3xl mb-3">📄</div>
            <p className="text-sm text-ink font-medium mb-1">
              拖拽文件到此处或点击上传
            </p>
            <p className="text-[12px] text-muted">
              支持 .md / .txt / .pdf / .docx / .html / .csv 格式
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt,.pdf,.docx,.html,.csv"
              className="hidden"
              onChange={e => handleFileUpload(e.target.files)}
            />
          </div>

          {/* Folder import */}
          <div className="p-5 rounded-lg border border-border bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">📂 从服务器文件夹导入</h3>
            <p className="text-[12px] text-muted mb-3">
              输入服务器上的 Markdown 文件夹路径，批量导入知识点（如 /data/knowledge/python/）
            </p>
            <div className="flex gap-2">
              <input
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="/path/to/knowledge/folder"
                className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 font-mono"
              />
              <button
                onClick={importFolder}
                disabled={importing || !folderPath.trim()}
                className="px-5 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                {importing ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: My Documents ── */}
      {tab === 'documents' && (
        <div>
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">📚</div>
              <p className="text-sm text-muted">还没有导入任何知识文档</p>
              <p className="text-[12px] text-muted mt-1">切换到"联网搜索"或"导入知识"选项卡添加内容</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-surface hover:shadow-sm transition-shadow">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{doc.source_type === 'web' ? '🌐' : '📄'}</span>
                      <h3 className="text-sm font-medium text-ink truncate">{doc.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                      <span>{doc.source_type === 'web' ? '联网搜索' : '本地导入'}</span>
                      <span>{(doc.length / 1000).toFixed(1)}K 字</span>
                      {doc.tags && doc.tags.length > 0 && (
                        <span>{doc.tags.slice(0, 3).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteDocument(doc.id)}
                    className="ml-3 px-3 py-1.5 text-[12px] text-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Web search integration in tutoring */}
      <div className="mt-8 p-5 rounded-lg border border-border bg-surface">
        <h3 className="text-sm font-medium text-ink mb-2">🔗 智能辅导已集成联网搜索</h3>
        <p className="text-[13px] text-muted leading-relaxed">
          当在智能辅导中提问时，系统会自动检索三大来源：课程知识库 → 你导入的自有文档 → 联网搜索结果，
          确保回答既准确又新鲜。联网搜索作为补充，不会覆盖课程知识库的核心内容。
        </p>
      </div>
    </div>
  )
}
