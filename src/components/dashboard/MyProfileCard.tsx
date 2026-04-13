import { Phone, Mail, Building2, Briefcase, CalendarRange, Landmark } from "lucide-react"
import type { EmployeePersonalProfile } from "@/app/_lib/dashboard-queries"

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-green-600",
  "bg-purple-600",
  "bg-amber-600",
  "bg-pink-600",
  "bg-cyan-600",
  "bg-red-500",
  "bg-indigo-600",
]

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name || "").slice(0, 2).toUpperCase()
}

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function MyProfileCard({ profile }: { profile: EmployeePersonalProfile | null }) {
  if (!profile) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 text-xs text-gray-400 text-center h-full flex items-center justify-center">
        Chưa có hồ sơ nhân viên
      </div>
    )
  }

  const seed = profile.code ?? profile.email ?? profile.fullName
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-base font-bold text-white shrink-0 ${avatarColor(seed)}`}
        >
          {initials(profile.fullName)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{profile.fullName}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {profile.code ? `${profile.code} · ` : ""}
            {profile.position}
          </div>
        </div>
      </div>

      <div className="space-y-2 text-[11px] text-gray-600">
        <div className="flex items-center gap-2">
          <Building2 size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">{profile.department}</span>
        </div>
        <div className="flex items-center gap-2">
          <Briefcase size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">{profile.contractType}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarRange size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">Đã làm {profile.tenureLabel}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 text-[11px] text-gray-600">
        {profile.phone && (
          <div className="flex items-center gap-2">
            <Phone size={12} className="text-gray-400 shrink-0" />
            <span className="truncate">{profile.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Mail size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">{profile.email}</span>
        </div>
        {(profile.bankName || profile.bankAccount) && (
          <div className="flex items-center gap-2">
            <Landmark size={12} className="text-gray-400 shrink-0" />
            <span className="truncate">
              {profile.bankName ?? "—"}
              {profile.bankAccount ? ` · ${profile.bankAccount}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
