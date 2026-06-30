import { useState, useEffect, useCallback } from 'react'
import { fetchActiveTasks, type TaskInfo } from '../services/api'

export default function FloatingProgressPanel() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [hasChecked, setHasChecked] = useState(false)

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchActiveTasks()
      setTasks(data.tasks || [])
      setHasChecked(true)
    } catch {
      setHasChecked(true)
    }
  }, [])

  // 轮询活跃任务（每 8 秒）
  useEffect(() => {
    loadTasks()
    const id = setInterval(loadTasks, 8000)
    return () => clearInterval(id)
  }, [loadTasks])

  const runningTasks = tasks.filter((t) => t.status === 'running')
  const errorTasks = tasks.filter((t) => t.status === 'error')
  const hasTasks = runningTasks.length > 0 || errorTasks.length > 0

  // 无任务时不渲染（或已检查过且无任务）
  if (hasChecked && !hasTasks) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-10 h-10 rounded-full text-white flex items-center justify-center shadow-lg transition-colors ${
          errorTasks.length > 0
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
        title="后台任务进度"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10" />
          <path d="M18 20V4" />
          <path d="M6 20v-6" />
        </svg>
        {runningTasks.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-[9px] font-bold rounded-full flex items-center justify-center">
            {runningTasks.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-12 right-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              后台任务
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto p-2 space-y-2">
            {/* 运行中任务 */}
            {runningTasks.map((task) => (
              <div
                key={task.id}
                className="p-2.5 rounded-lg bg-blue-50 border border-blue-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs font-medium text-blue-800 truncate flex-1">
                    {task.label}
                  </span>
                </div>
                {task.message && (
                  <p className="text-[11px] text-blue-600 ml-4 mb-1 truncate">
                    {task.message}
                  </p>
                )}
                {task.progress > 0 && (
                  <div className="ml-4 w-40 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* 错误任务 */}
            {errorTasks.map((task) => (
              <div
                key={task.id}
                className="p-2.5 rounded-lg bg-red-50 border border-red-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-500 text-sm">⚠</span>
                  <span className="text-xs font-medium text-red-800 truncate flex-1">
                    {task.label}
                  </span>
                </div>
                {task.message && (
                  <p className="text-[11px] text-red-600 ml-5 truncate">
                    {task.message}
                  </p>
                )}
              </div>
            ))}

            {!hasTasks && hasChecked && (
              <p className="text-xs text-gray-400 text-center py-2">暂无进行中的任务</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
