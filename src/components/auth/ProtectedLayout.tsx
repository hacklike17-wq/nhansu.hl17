'use client'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import ChatWidget from '@/components/ai/ChatWidget'
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext'

// Middleware handles auth redirect — this component only handles layout
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) return <>{children}</>

  return (
    <SidebarProvider>
      <ProtectedShell>{children}</ProtectedShell>
    </SidebarProvider>
  )
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { mobileOpen, closeMobile } = useSidebar()

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Mobile backdrop — clicking it closes the drawer */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          aria-hidden="true"
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>

      {/* Phase 2.1: floating chat widget. Gated to admin inside the component. */}
      <ChatWidget />
    </div>
  )
}
