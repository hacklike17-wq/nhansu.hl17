import { z } from "zod"

export const UpsertWorkUnitSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày: YYYY-MM-DD"),
  units: z.number().min(0).max(3),
  note: z.string().optional(),
})

export const CreateDeductionSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["NGHI_NGAY", "DI_MUON", "VE_SOM", "OVERTIME"]),
  // `delta` is a per-day attendance adjustment in units (half-day granularity).
  // Bound it to [-2, 2] so no single row can blow up payroll math; OVERTIME
  // uses positive deltas, NGHI_NGAY negative.
  delta: z.number().min(-2).max(2),
  reason: z.string().min(1).max(500),
})

export const CreateLeaveRequestSchema = z
  .object({
    employeeId: z.string().min(1),
    type: z.enum(["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "UNPAID", "WEDDING", "BEREAVEMENT"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalDays: z.number().int().min(1).max(365),
    reason: z.string().max(1000).optional(),
  })
  .refine(d => d.startDate <= d.endDate, {
    message: "Ngày bắt đầu phải ≤ ngày kết thúc",
    path: ["endDate"],
  })

export type UpsertWorkUnitInput = z.infer<typeof UpsertWorkUnitSchema>
export type CreateDeductionInput = z.infer<typeof CreateDeductionSchema>
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>
