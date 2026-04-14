import { z } from "zod"
import { ENTRY_ALLOWED_COLUMNS, type EntryAllowedColumn } from "@/constants/salary-columns"

export const GeneratePayrollSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Định dạng: YYYY-MM"),
  employeeIds: z.array(z.string()).optional(),
  missingOnly: z.boolean().optional(), // Phase 04: only create for employees without a payroll row
})

export const UpdatePayrollStatusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "LOCKED", "PAID"]),
  note: z.string().optional(),
})

// Re-export so existing `@/lib/schemas/payroll` import sites keep working.
// Canonical home is src/constants/salary-columns.ts (Phase 2 refactor).
export { ENTRY_ALLOWED_COLUMNS }
export type { EntryAllowedColumn }

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
