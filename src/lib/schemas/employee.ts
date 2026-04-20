import { z } from "zod"

export const CreateEmployeeSchema = z.object({
  companyId: z.string().min(1),
  fullName: z.string().min(1, "Tên không được trống"),
  email: z.string().email("Email không hợp lệ"),
  phone: z.string().optional(),
  department: z.string().min(1),
  position: z.string().min(1),
  contractType: z.enum(["FULL_TIME", "PART_TIME", "INTERN", "FREELANCE"]),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  baseSalary: z.number().int().min(0),
  responsibilitySalary: z.number().int().min(0).default(0),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  taxCode: z.string().optional(),
  bhxhCode: z.string().optional(),
  code: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  idCard: z.string().optional(),
  address: z.string().optional(),
  workStartTime: z.string().regex(/^$|^\d{2}:\d{2}$/, "Định dạng HH:MM").optional(),
  workEndTime: z.string().regex(/^$|^\d{2}:\d{2}$/, "Định dạng HH:MM").optional(),
  accountStatus: z.enum(["ACTIVE", "LOCKED", "NO_ACCOUNT"]).default("ACTIVE"),
  // Optional. If provided, must be ≥8 chars. If omitted and account is
  // ACTIVE/LOCKED, a secure random password is generated server-side and
  // returned in the response for the admin to share out-of-band.
  accountPassword: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").optional().or(z.literal("")),
})

export const UpdateEmployeeSchema = CreateEmployeeSchema
  .extend({
    endDate: z.string().optional(),
    status: z.enum(["WORKING", "HALF", "LEAVE", "REMOTE", "RESIGNED"]).optional(),
  })
  .partial()
  .omit({ companyId: true })

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>
