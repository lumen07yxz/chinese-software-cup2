import Sidebar from './Sidebar'
import StarsCanvas from './StarsCanvas'
import FloatingProgressPanel from './FloatingProgressPanel'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-warm-white relative">
      <Sidebar />
      <main className="flex-1 min-w-0 relative z-10">
        {children}
      </main>
      <FloatingProgressPanel />
    </div>
  )
}
