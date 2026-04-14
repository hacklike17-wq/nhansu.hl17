'use client'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import ChatWidget from '@/components/ai/ChatWidget'

// Middleware handles auth redirect — this component only handles layout
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
      {/* Phase 2.1: floating chat widget. Gated to admin inside the component. */}
      <ChatWidget />
    </div>
  )
}
