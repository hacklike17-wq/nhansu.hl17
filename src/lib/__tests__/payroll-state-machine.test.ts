/**
 * Locks in the payroll state-machine rules extracted in Phase 4.
 *
 * Every test here mirrors a rule that used to live inline in
 * src/app/api/payroll/[id]/route.ts. If any of these start failing, the
 * route handler's behaviour has drifted vs. the state-machine module and
 * one of them is wrong — production callers will see different error
 * messages or statuses.
 */
import { describe, it, expect } from "vitest"
import {
  PAYROLL_TRANSITIONS,
  canTransition,
} from "@/lib/payroll/state-machine"

describe("PAYROLL_TRANSITIONS graph", () => {
  it("DRAFT can only become PENDING", () => {
    expect(PAYROLL_TRANSITIONS.DRAFT).toEqual(["PENDING"])
  })

  it("PENDING can become LOCKED or go back to DRAFT", () => {
    expect([...PAYROLL_TRANSITIONS.PENDING].sort()).toEqual(["DRAFT", "LOCKED"])
  })

  it("APPROVED is kept only as a bridge to LOCKED for legacy rows", () => {
    expect(PAYROLL_TRANSITIONS.APPROVED).toEqual(["LOCKED"])
  })

  it("LOCKED goes to PAID and nowhere else", () => {
    expect(PAYROLL_TRANSITIONS.LOCKED).toEqual(["PAID"])
  })

  it("PAID is terminal", () => {
    expect(PAYROLL_TRANSITIONS.PAID).toEqual([])
  })
})

describe("canTransition — employee role", () => {
  it("can confirm a PENDING row (PENDING → LOCKED)", () => {
    expect(canTransition("PENDING", "LOCKED", "employee").ok).toBe(true)
  })

  it("can reject a PENDING row (PENDING → DRAFT)", () => {
    expect(canTransition("PENDING", "DRAFT", "employee").ok).toBe(true)
  })

  it("cannot touch a DRAFT row", () => {
    const r = canTransition("DRAFT", "PENDING", "employee")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.reason).toMatch(/Nhân viên chỉ được xác nhận hoặc từ chối/)
    }
  })

  it("cannot mark as paid", () => {
    const r = canTransition("LOCKED", "PAID", "employee")
    expect(r.ok).toBe(false)
  })
})

describe("canTransition — manager role", () => {
  it("can send DRAFT → PENDING", () => {
    expect(canTransition("DRAFT", "PENDING", "manager").ok).toBe(true)
  })

  it("can cancel a send (PENDING → DRAFT)", () => {
    expect(canTransition("PENDING", "DRAFT", "manager").ok).toBe(true)
  })

  it("cannot confirm on the employee's behalf (PENDING → LOCKED)", () => {
    const r = canTransition("PENDING", "LOCKED", "manager")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.reason).toMatch(/Chỉ Admin mới được đánh dấu đã trả/)
    }
  })

  it("cannot mark as paid", () => {
    expect(canTransition("LOCKED", "PAID", "manager").ok).toBe(false)
  })
})

describe("canTransition — admin role", () => {
  it("can send DRAFT → PENDING", () => {
    expect(canTransition("DRAFT", "PENDING", "admin").ok).toBe(true)
  })

  it("can confirm PENDING → LOCKED directly", () => {
    expect(canTransition("PENDING", "LOCKED", "admin").ok).toBe(true)
  })

  it("can mark LOCKED as PAID", () => {
    expect(canTransition("LOCKED", "PAID", "admin").ok).toBe(true)
  })

  it("cannot violate the structural graph (DRAFT → LOCKED)", () => {
    const r = canTransition("DRAFT", "LOCKED", "admin")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect(r.reason).toMatch(/Không thể chuyển từ DRAFT sang LOCKED/)
    }
  })

  it("cannot transition out of PAID (terminal)", () => {
    expect(canTransition("PAID", "LOCKED", "admin").ok).toBe(false)
  })

  it("can bridge legacy APPROVED → LOCKED", () => {
    expect(canTransition("APPROVED", "LOCKED", "admin").ok).toBe(true)
  })
})
