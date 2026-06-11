import Sidebar from './Sidebar'
import KnowledgeDecorBg from './KnowledgeDecorBg'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-warm-white relative">
      <KnowledgeDecorBg />
      <Sidebar />
      <main className="flex-1 min-w-0 relative" style={{ zIndex: 1 }}>
        {children}
      </main>
    </div>
  )
}
