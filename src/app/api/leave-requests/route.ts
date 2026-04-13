import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { CreateLeaveRequestSchema } from "@/lib/schemas/attendance"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = (session.user as any).companyId
  const employeeId = searchParams.get("employeeId")
  const status = searchParams.get("status")

  const requests = await db.leaveRequest.findMany({
    where: {
      companyId,
      ...(employeeId ? { employeeId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      employee: { select: { id: true, fullName: true, department: true } },
    },
    orderBy: { submittedAt: "desc" },
  })

  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId
  const body = await req.json()

  const parsed = CreateLeaveRequestSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { employeeId, type, startDate, endDate, totalDays, reason } = parsed.data

  const request = await db.leaveRequest.create({
    data: {
      companyId,
      employeeId,
      type,
      startDate: new Date(startDate + "T00:00:00Z"),
      endDate: new Date(endDate + "T00:00:00Z"),
      totalDays,
      reason,
      status: "PENDING",
    },
  })

  return NextResponse.json(request, { status: 201 })
}
