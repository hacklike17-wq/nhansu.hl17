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

export type GeneratePayrollInput = z.infer<typeof GeneratePayrollSchema>
export type UpdatePayrollStatusInput = z.infer<typeof UpdatePayrollStatusSchema>
