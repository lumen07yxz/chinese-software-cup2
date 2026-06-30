import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchKnowledgeDocument,
  updateKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeFile,
  webSearchKnowledge,
  saveWebSearchResult,
  deleteKnowledgeDocument,
  askKnowledgeBaseStream,
  askKnowledgeNativeStream,
  type KnowledgeDocument,
} from '../../services/api'

// ── 格式标签 ─────────────────────────────────────────────────

const FORMAT_ICONS: Record<string, string> = {
  pdf: '📕',
  docx: '📘',
  doc: '📘',
  md: '📝',
  txt: '📄',
  html: '🌐',
  csv: '📊',
}

// ── 主页面 ───────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<'search' | 'upload' | 'documents' | 'ask'>('search')
  return (
    <div className="max-w-6xl mx-auto pb-8">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-ink">知识库管理</h1>
        <p className="text-sm text-muted mt-0.5">导入自有知识文档、查看编辑内容、AI 智能问答</p>
      </div>

      {/* Tab 栏 */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {([
          { key: 'search', label: '🔍 联网搜索' },
          { key: 'upload', label: '📁 导入知识' },
          { key: 'documents', label: '📚 我的文档' },
          { key: 'ask', label: '🤖 AI 查库' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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

      {tab === 'search' && <SearchTab />}
      {tab === 'upload' && <UploadTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'ask' && <AskTab />}
    </div>
  )
}

// ── Tab 1: 联网搜索 ─────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<{ title: string; snippet: string; url: string }[]>([])
  const [saved, setSaved] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const data = await webSearchKnowledge(query)
      setResults(data.results || [])
    } catch { /* silent */ } finally {
      setSearching(false)
    }
  }

  const handleSave = async (r: { title: string; snippet: string }) => {
    try {
      await saveWebSearchResult({ title: r.title, content: r.snippet, tags: ['web-search'] })
      setSaved(r.title)
      setTimeout(() => setSaved(null), 3000)
    } catch { /* silent */ }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="搜索你想学习的内容（如 Python 异步编程教程）..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-5 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50"
        >
          {searching ? '搜索中...' : '搜索'}
        </button>
      </div>
      {saved && (
        <div className="mb-3 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          已保存：{saved}
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
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
                <button onClick={() => handleSave(r)}
                  className="flex-shrink-0 px-3 py-1.5 text-[12px] bg-cream text-ink rounded-md hover:bg-ink hover:text-warm-white transition-colors">
                  保存
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!searching && results.length === 0 && (
        <div className="text-center py-12 text-sm text-muted">输入关键词搜索最新学习资料</div>
      )}
    </div>
  )
}

// ── Tab 2: 导入知识 ─────────────────────────────────────────

function UploadTab() {
  const [status, setStatus] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus('上传中...')
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
        await uploadKnowledgeFile(fd)
      }
      setStatus(`已上传 ${files.length} 个文件`)
      setTimeout(() => setStatus(null), 3000)
    } catch { setStatus('上传失败') }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const importFolder = async () => {
    if (!folderPath.trim()) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('folder_path', folderPath)
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const resp = await fetch('/api/knowledge/import-folder', { method: 'POST', headers, body: fd })
      const data = await resp.json()
      setStatus(`已导入 ${data.total} 个文档`)
      setTimeout(() => setStatus(null), 3000)
    } catch { setStatus('导入失败') } finally { setImporting(false) }
  }

  return (
    <div className="space-y-6">
      {status && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {status}
        </div>
      )}
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
        <p className="text-sm text-ink font-medium mb-1">拖拽文件到此处或点击上传</p>
        <p className="text-[12px] text-muted">支持 .md / .txt / .pdf / .docx / .html / .csv 格式</p>
        <input ref={fileInputRef} type="file" multiple accept=".md,.txt,.pdf,.docx,.html,.csv" className="hidden"
          onChange={e => handleUpload(e.target.files)} />
      </div>
      <div className="p-5 rounded-lg border border-border bg-surface">
        <h3 className="text-sm font-medium text-ink mb-2">📂 从服务器文件夹导入</h3>
        <p className="text-[12px] text-muted mb-3">输入服务器上的 Markdown 文件夹路径，批量导入</p>
        <div className="flex gap-2">
          <input value={folderPath} onChange={e => setFolderPath(e.target.value)} placeholder="/path/to/folder"
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 font-mono" />
          <button onClick={importFolder} disabled={importing || !folderPath.trim()}
            className="px-5 py-2.5 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50">
            {importing ? '导入中...' : '导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: 我的文档（分栏：列表 + 查看器）────────────────────

function DocumentsTab() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // 编辑状态
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // 笔记状态
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)

  // 批量选择
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 删除确认弹窗
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: number[]; labels: string[] } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 标签编辑弹窗
  const [tagEditDoc, setTagEditDoc] = useState<KnowledgeDocument | null>(null)
  const [tagEditInput, setTagEditInput] = useState('')

  const loadDocs = useCallback(async () => {
    try {
      const data = await listKnowledgeDocuments()
      setDocuments(data.documents || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const loadDoc = async (id: number) => {
    if (id === selectedId) return
    setLoading(true)
    setEditing(false)
    setSaveMsg(null)
    setNotesDirty(false)
    try {
      const doc = await fetchKnowledgeDocument(id)
      setSelectedDoc(doc)
      setSelectedId(id)
      setEditContent(doc.content)
      setEditTitle(doc.title)
      setNotes(doc.notes || '')
    } catch { /* silent */ } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!selectedDoc) return
    setSaving(true)
    try {
      await updateKnowledgeDocument(selectedDoc.id, { title: editTitle, content: editContent })
      setEditing(false)
      setSaveMsg('内容已保存')
      setTimeout(() => setSaveMsg(null), 3000)
      loadDocs()
      setSelectedDoc(prev => prev ? { ...prev, title: editTitle, content: editContent, length: editContent.length } : prev)
    } catch { setSaveMsg('保存失败') } finally { setSaving(false) }
  }

  const handleSaveNotes = async () => {
    if (!selectedDoc || !notesDirty) return
    try {
      await updateKnowledgeDocument(selectedDoc.id, { notes })
      setNotesDirty(false)
    } catch { /* silent */ }
  }

  const blurSaveNotes = () => { if (notesDirty) handleSaveNotes() }

  // ── 删除逻辑 ───────────────────────────────────────────────
  const requestDelete = (ids: number[]) => {
    if (ids.length === 0) return
    const labels = ids.map(id => documents.find(d => d.id === id)?.title || `#${id}`)
    setDeleteConfirm({ ids, labels })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      for (const id of deleteConfirm.ids) {
        await deleteKnowledgeDocument(id)
      }
      // 清理选中状态
      if (selectedId && deleteConfirm.ids.includes(selectedId)) {
        setSelectedId(null)
        setSelectedDoc(null)
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      setDeleteConfirm(null)
      loadDocs()
    } catch { /* silent */ } finally { setDeleting(false) }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const filteredIds = filtered.map(d => d.id)
    if (filteredIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredIds))
    }
  }

  // ── 标签逻辑 ───────────────────────────────────────────────
  const allTags = Array.from(new Set(documents.flatMap(d => d.tags || []))).sort()

  const handleSaveTags = async () => {
    if (!tagEditDoc) return
    const newTags = tagEditInput.split(/[,，]/).map(t => t.trim()).filter(Boolean)
    try {
      await updateKnowledgeDocument(tagEditDoc.id, { tags: newTags })
      setTagEditDoc(null)
      loadDocs()
      // 如果当前查看的就是这个文档，刷新
      if (selectedId === tagEditDoc.id) {
        setSelectedDoc(prev => prev ? { ...prev, tags: newTags } : prev)
      }
    } catch { /* silent */ }
  }

  const removeTag = async (docId: number, tag: string) => {
    const doc = documents.find(d => d.id === docId)
    if (!doc) return
    const newTags = (doc.tags || []).filter(t => t !== tag)
    try {
      await updateKnowledgeDocument(docId, { tags: newTags })
      loadDocs()
      if (selectedId === docId) {
        setSelectedDoc(prev => prev ? { ...prev, tags: newTags } : prev)
      }
    } catch { /* silent */ }
  }

  // ── 过滤 ───────────────────────────────────────────────────
  const filtered = documents.filter(d => {
    const matchSearch = !searchFilter || d.title.toLowerCase().includes(searchFilter.toLowerCase())
    const matchTag = !tagFilter || (d.tags || []).includes(tagFilter)
    return matchSearch && matchTag
  })

  const fmt = (s: string) => {
    if (!s) return ''
    try { return new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) } catch { return s }
  }

  return (
    <div className="flex gap-4" style={{ minHeight: '70vh' }}>
      {/* ── 左侧：文档列表 ── */}
      <div className="w-72 flex-shrink-0 border-r border-border pr-4 flex flex-col">
        {/* 搜索 + 操作栏 */}
        <div className="flex items-center gap-2 mb-2">
          <input
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="搜索文档..."
            className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
          <button
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
            className={`px-2 py-2 rounded-lg text-[12px] transition-colors ${
              selectMode ? 'bg-ink text-warm-white' : 'bg-cream text-muted hover:text-ink'
            }`}
            title={selectMode ? '取消选择' : '批量操作'}
          >
            ☑️
          </button>
        </div>

        {/* 批量操作栏 */}
        {selectMode && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every(d => selectedIds.has(d.id))}
                onChange={toggleSelectAll}
                className="rounded border-border w-3.5 h-3.5 accent-ink"
              />
              全选
            </label>
            <span className="text-[11px] text-muted">{selectedIds.size} 项</span>
            {selectedIds.size > 0 && (
              <button
                onClick={() => requestDelete(Array.from(selectedIds))}
                className="ml-auto px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                🗑️ 删除 ({selectedIds.size})
              </button>
            )}
          </div>
        )}

        {/* 标签过滤条 */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            <button
              onClick={() => setTagFilter(null)}
              className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                !tagFilter ? 'bg-ink text-warm-white' : 'bg-cream text-muted hover:text-ink'
              }`}
            >
              全部
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                  tagFilter === tag ? 'bg-ink text-warm-white' : 'bg-cream text-muted hover:text-ink'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* 文档列表 */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted">
              <div className="text-2xl mb-2">📚</div>
              {documents.length === 0 ? '还没有导入任何文档' : '无匹配文档'}
            </div>
          ) : filtered.map(doc => (
            <div
              key={doc.id}
              onClick={() => selectMode ? toggleSelect(doc.id) : loadDoc(doc.id)}
              className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                selectedId === doc.id && !selectMode
                  ? 'bg-ink/5 border border-ink/20'
                  : selectedIds.has(doc.id)
                  ? 'bg-ink/5 border border-ink/10'
                  : 'hover:bg-surface border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelect(doc.id)}
                    onClick={e => e.stopPropagation()}
                    className="rounded border-border w-3.5 h-3.5 accent-ink flex-shrink-0"
                  />
                )}
                <span className="text-base flex-shrink-0">{FORMAT_ICONS[doc.file_format] || '📄'}</span>
                <span className="text-[13px] font-medium text-ink truncate flex-1">{doc.title}</span>
                {doc.spark_file_status === 'vectored' && <span className="text-[10px] flex-shrink-0" title="已同步到星火知识库">☁️</span>}
                {doc.spark_file_status === 'uploaded' && <span className="text-[10px] flex-shrink-0 animate-pulse" title="星火处理中">⏳</span>}
                {doc.has_notes && <span className="text-[10px] flex-shrink-0" title="有笔记">📌</span>}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted pl-6">
                <span>{doc.file_format.toUpperCase()}</span>
                <span>{(doc.length / 1000).toFixed(1)}K</span>
                <span>{fmt(doc.created_at)}</span>
              </div>
              {/* 标签 */}
              {doc.tags && doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
                  {doc.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-cream rounded text-muted">
                      {tag}
                    </span>
                  ))}
                  {doc.tags.length > 3 && (
                    <span className="text-[10px] text-muted">+{doc.tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 右侧：文档查看器 ── */}
      <div className="flex-1 min-w-0">
        {!selectedDoc ? (
          <div className="flex items-center justify-center h-full text-sm text-muted">
            <div className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <p>选择左侧文档查看内容</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted">加载中...</div>
        ) : (
          <div className="flex flex-col h-full">
            {/* 工具栏 */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg flex-shrink-0">{FORMAT_ICONS[selectedDoc.file_format] || '📄'}</span>
                {editing ? (
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="text-sm font-medium text-ink border-b border-ink/30 focus:outline-none bg-transparent px-1 min-w-0" />
                ) : (
                  <h2 className="text-sm font-medium text-ink truncate">{selectedDoc.title}</h2>
                )}
                <span className="text-[11px] text-muted px-2 py-0.5 bg-cream rounded flex-shrink-0">
                  {selectedDoc.file_format.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {saveMsg && <span className="text-[12px] text-emerald-600">{saveMsg}</span>}
                {/* 标签管理按钮 */}
                <button
                  onClick={() => { setTagEditDoc(selectedDoc); setTagEditInput((selectedDoc.tags || []).join(', ')) }}
                  className="px-2.5 py-1.5 text-[12px] bg-cream text-muted rounded-md hover:bg-ink hover:text-warm-white transition-colors"
                  title="管理标签"
                >
                  🏷️
                </button>
                {/* 删除按钮 */}
                <button
                  onClick={() => requestDelete([selectedDoc.id])}
                  className="px-2.5 py-1.5 text-[12px] text-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="删除文档"
                >
                  🗑️
                </button>
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)}
                      className="px-3 py-1.5 text-[12px] text-muted hover:text-ink rounded-md transition-colors">
                      取消
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="px-3 py-1.5 text-[12px] bg-ink text-warm-white rounded-md hover:bg-ink-light transition-colors disabled:opacity-50">
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setEditing(true); setEditContent(selectedDoc.content) }}
                    className="px-3 py-1.5 text-[12px] bg-cream text-ink rounded-md hover:bg-ink hover:text-warm-white transition-colors">
                    ✏️ 编辑
                  </button>
                )}
              </div>
            </div>

            {/* 当前文档标签 */}
            {selectedDoc.tags && selectedDoc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selectedDoc.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-cream text-muted rounded-full">
                    {tag}
                    <button onClick={() => removeTag(selectedDoc.id, tag)}
                      className="text-muted/50 hover:text-red-500 text-[10px]">×</button>
                  </span>
                ))}
              </div>
            )}

            {/* 元信息 */}
            <div className="flex items-center gap-4 text-[11px] text-muted mb-4 flex-wrap">
              <span>📊 {(selectedDoc.length / 1000).toFixed(1)}K 字</span>
              <span>📅 {fmt(selectedDoc.created_at)}</span>
              {selectedDoc.updated_at && selectedDoc.updated_at !== selectedDoc.created_at && (
                <span>🔄 更新于 {fmt(selectedDoc.updated_at)}</span>
              )}
              {selectedDoc.spark_file_status === 'vectored' && <span className="text-emerald-600">☁️ 星火知识库已同步</span>}
              {selectedDoc.spark_file_status === 'uploaded' && <span className="text-amber-500 animate-pulse">⏳ 星火处理中</span>}
              {selectedDoc.spark_file_status === 'failed' && <span className="text-red-500">❌ 星火同步失败</span>}
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[400px] p-4 rounded-lg border border-border text-sm text-ink font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 resize-y"
                  spellCheck={false}
                />
              ) : (
                <div className="prose prose-sm max-w-none text-ink leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedDoc.content || '（空文档）'}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* 笔记面板 */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-medium text-ink">📌 我的笔记</h3>
                {notesDirty && <span className="text-[11px] text-amber-500">未保存</span>}
              </div>
              <textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); setNotesDirty(true) }}
                onBlur={blurSaveNotes}
                placeholder="在这里记录你对这篇文档的理解、疑问或补充..."
                className="w-full p-3 rounded-lg border border-border text-sm text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 resize-y bg-cream/30"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-warm-white rounded-xl shadow-lg border border-border w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-2">确认删除</h3>
            <p className="text-[13px] text-muted mb-3">
              确定要删除以下 {deleteConfirm.ids.length} 个文档吗？此操作不可撤销。
            </p>
            <div className="max-h-40 overflow-y-auto mb-4 space-y-1">
              {deleteConfirm.labels.map((label, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg text-[12px] text-red-700">
                  <span>🗑️</span>
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-[13px] text-muted hover:text-ink rounded-lg transition-colors">
                取消
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-4 py-2 text-[13px] bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50">
                {deleting ? '删除中...' : `确认删除 (${deleteConfirm.ids.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 标签编辑弹窗 ── */}
      {tagEditDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setTagEditDoc(null)}>
          <div className="bg-warm-white rounded-xl shadow-lg border border-border w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink mb-1">🏷️ 管理标签</h3>
            <p className="text-[12px] text-muted mb-3">为「{tagEditDoc.title}」设置分类标签</p>
            <input
              value={tagEditInput}
              onChange={e => setTagEditInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTags() }}
              placeholder="用逗号分隔多个标签，如：C语言, 语法, 入门"
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagEditDoc(null)}
                className="px-4 py-2 text-[13px] text-muted hover:text-ink rounded-lg transition-colors">
                取消
              </button>
              <button onClick={handleSaveTags}
                className="px-4 py-2 text-[13px] bg-ink text-warm-white rounded-lg hover:bg-ink-light transition-colors">
                保存标签
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 4: AI 查库问答 ──────────────────────────────────────

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; score: number; doc_id: number }[]
}

function AskTab() {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [answering, setAnswering] = useState(false)
  const [mode, setMode] = useState<'local' | 'spark'>('spark')  // spark=星火原生, local=本地RAG
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleAsk = async () => {
    const q = input.trim()
    if (!q || answering) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setAnswering(true)

    // 添加空的 assistant 消息
    const idx = messages.length + 1
    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }])

    let fullText = ''
    let sources: ChatMsg['sources'] = undefined
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

    if (mode === 'spark') {
      // 星火知识库原生 RAG 问答
      await askKnowledgeNativeStream(
        { question: q, history },
        (chunk) => {
          fullText += chunk
          setMessages(prev => {
            const next = [...prev]
            next[idx] = { role: 'assistant', content: fullText }
            return next
          })
        },
        () => {
          setMessages(prev => {
            const next = [...prev]
            next[idx] = { role: 'assistant', content: fullText, sources }
            return next
          })
          setAnswering(false)
        },
        (err) => {
          fullText = `⚠️ ${err}`
          setMessages(prev => {
            const next = [...prev]
            next[idx] = { role: 'assistant', content: fullText }
            return next
          })
          setAnswering(false)
        },
      )
    } else {
      // 本地 RAG 问答
      await askKnowledgeBaseStream(
        { question: q, history },
      (chunk) => {
        fullText += chunk
        setMessages(prev => {
          const next = [...prev]
          next[idx] = { role: 'assistant', content: fullText }
          return next
        })
      },
      () => {
        setMessages(prev => {
          const next = [...prev]
          next[idx] = { role: 'assistant', content: fullText, sources }
          return next
        })
        setAnswering(false)
      },
      (err) => {
        fullText = `⚠️ ${err}`
        setMessages(prev => {
          const next = [...prev]
          next[idx] = { role: 'assistant', content: fullText }
          return next
        })
        setAnswering(false)
      },
      (s) => { sources = s },
      )
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}>
      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted">
            <div className="text-center">
              <div className="text-4xl mb-3">🤖</div>
              <p className="font-medium text-ink mb-1">AI 知识库问答</p>
              <p className="text-[13px] max-w-sm">
                基于你导入的知识库文档回答问题。先在"导入知识"中添加文档，然后在这里提问。
              </p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-ink text-warm-white'
                : 'bg-surface border border-border text-ink'
            }`}>
              {m.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content || (answering && i === messages.length - 1 ? '...' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                <span>{m.content}</span>
              )}
              {/* 来源引用 */}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/50">
                  <span className="text-[11px] text-muted font-medium">📎 引用来源：</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.sources.map((s, j) => (
                      <span key={j} className="text-[11px] px-2 py-0.5 bg-cream rounded text-muted">
                        {s.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 模式切换 + 输入框 */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[11px] text-muted">问答模式：</span>
          <button onClick={() => setMode('spark')}
            className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
              mode === 'spark' ? 'bg-ink text-warm-white' : 'bg-cream text-muted hover:text-ink'
            }`}>
            ☁️ 星火知识库
          </button>
          <button onClick={() => setMode('local')}
            className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
              mode === 'local' ? 'bg-ink text-warm-white' : 'bg-cream text-muted hover:text-ink'
            }`}>
            💻 本地 RAG
          </button>
          <span className="text-[10px] text-muted/60">
            {mode === 'spark' ? '直接调用星火知识库检索+生成，更精准' : '本地向量检索 + 大模型回答'}
          </span>
        </div>
        <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
          placeholder="基于你的知识库提问（Enter 发送，Shift+Enter 换行）..."
          className="flex-1 px-4 py-3 rounded-xl border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 resize-none"
          rows={2}
          disabled={answering}
        />
        <button
          onClick={handleAsk}
          disabled={answering || !input.trim()}
          className="px-5 self-end py-3 bg-ink text-warm-white text-sm rounded-xl hover:bg-ink-light transition-colors disabled:opacity-50"
        >
          {answering ? '回答中...' : '提问'}
        </button>
        </div>
      </div>
    </div>
  )
}
