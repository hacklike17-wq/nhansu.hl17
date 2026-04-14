'use client'
import Topbar from './Topbar'

interface PageShellProps {
  breadcrumb?: string
  title: string
  children: React.ReactNode
}

export default function PageShell({ breadcrumb, title, children }: PageShellProps) {
  return (
    <>
      <Topbar breadcrumb={breadcrumb} title={title} />
      <main className="flex-1 overflow-y-auto p-3 md:p-7 space-y-4">
        {children}
      </main>
    </>
  )
}
