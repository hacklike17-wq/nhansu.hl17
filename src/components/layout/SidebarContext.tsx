'use client'
import { createContext, useContext, useState, useCallback } from 'react'

type SidebarContextValue = {
  mobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
  toggleMobile: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

/**
 * Shared state for the mobile sidebar drawer. ProtectedLayout wraps the
 * tree with this provider so Sidebar (consumer of `mobileOpen` for its
 * slide-in class) and Topbar (consumer of `openMobile` for its hamburger
 * button) can talk without prop drilling through PageShell.
 *
 * Desktop (md+) ignores this state entirely — Sidebar's Tailwind classes
 * force md:translate-x-0 so the drawer behavior is purely mobile.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const toggleMobile = useCallback(() => setMobileOpen(o => !o), [])

  return (
    <SidebarContext.Provider value={{ mobileOpen, openMobile, closeMobile, toggleMobile }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    // Safe fallback so components outside the provider (e.g. the login page
    // which doesn't render Sidebar at all) don't crash.
    return {
      mobileOpen: false,
      openMobile: () => {},
      closeMobile: () => {},
      toggleMobile: () => {},
    }
  }
  return ctx
}
