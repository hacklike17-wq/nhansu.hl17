import { z } from "zod"

export const LoginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu ít nhất 6 ký tự"),
})

export type LoginInput = z.infer<typeof LoginSchema>
