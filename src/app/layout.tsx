import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import AuthProvider from '@/components/auth/AuthProvider'
import ProtectedLayout from '@/components/auth/ProtectedLayout'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ADMIN_HL17 — Quản trị doanh nghiệp',
  description: 'Hệ thống quản lý nhân sự và tài chính doanh nghiệp',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.className} bg-[#F5F6FA] antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <AuthProvider>
            <ProtectedLayout>
              {children}
            </ProtectedLayout>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
