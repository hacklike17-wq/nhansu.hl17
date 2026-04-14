import { z } from "zod"

export const GeneratePayrollSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
  employeeIds: z.array(z.string()).optional(),
  missingOnly: z.boolean().optional(), // Phase 04: only create for employees without a payroll row
})

export const UpdatePayrollStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "LOCKED", "PAID"]),
  note: z.string().optional(),
})

// Columns that support structured line-item entries (Phase: breakdown
// panel). Keep this list tight — only columns where a manager would
// naturally list multiple items (phụ cấp ăn + xăng + điện thoại, or
// đi muộn + ứng lương) should appear here.
export const ENTRY_ALLOWED_COLUMNS = ["tien_phu_cap", "tien_tru_khac"] as const
export type EntryAllowedColumn = (typeof ENTRY_ALLOWED_COLUMNS)[number]

export const CreateSalaryValueEntrySchema = z
  .object({
    payrollId: z.string().min(1),
    columnKey: z.enum(ENTRY_ALLOWED_COLUMNS),
    amount: z.number().min(-1_000_000_000).max(1_000_000_000),
    reason: z.string().min(1).max(500),
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày: YYYY-MM-DD")
      .optional(),
  })
  .strict()

export type CreateSalaryValueEntryInput = z.infer<typeof CreateSalaryValueEntrySchema>

export type GeneratePayrollInput = z.infer<typeof GeneratePayrollSchema>
export type UpdatePayrollStatusInput = z.infer<typeof UpdatePayrollStatusSchema>
