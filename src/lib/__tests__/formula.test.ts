import { describe, it, expect } from 'vitest'
import {
  evalFormula,
  extractVars,
  buildDependencyGraph,
  topologicalSort,
  detectCircular,
  validateFormula,
  CircularDependencyError,
} from '../formula'

describe('evalFormula', () => {
  it('evaluates basic arithmetic', () => {
    expect(evalFormula('luong_co_ban * net_cong_so / 26', {
      luong_co_ban: 10_000_000,
      net_cong_so: 26,
    })).toBe(10_000_000)
  })

  it('returns null for empty formula', () => {
    expect(evalFormula('', {})).toBeNull()
  })

  it('returns null for whitespace-only formula', () => {
    expect(evalFormula('   ', {})).toBeNull()
  })

  it('returns null for division by zero', () => {
    // Infinity is not finite → returns null
    expect(evalFormula('luong_co_ban / 0', { luong_co_ban: 5_000_000 })).toBeNull()
  })

  it('returns 0 for legitimate zero result', () => {
    expect(evalFormula('0', {})).toBe(0)
    expect(evalFormula('gio_tang_ca * 0', { gio_tang_ca: 8 })).toBe(0)
  })

  it('rounds to integer', () => {
    // 10_000_000 * 20 / 26 = 7_692_307.69... → rounds to 7_692_308
    const result = evalFormula('luong_co_ban * cong_so / 26', { luong_co_ban: 10_000_000, cong_so: 20 })
    expect(result).toBe(7_692_308)
  })

  it('does NOT execute process.exit — returns null (unknown var)', () => {
    // expr-eval has no global access, so process is unknown
    const result = evalFormula('process', {})
    expect(result).toBeNull()
  })

  it('returns null for syntax error', () => {
    expect(evalFormula('luong + +', {})).toBeNull()
  })

  it('handles nested formulas with multiple vars', () => {
    const result = evalFormula(
      'luong_co_ban * cong_so / 26 + tien_an',
      { luong_co_ban: 10_000_000, cong_so: 26, tien_an: 910_000 }
    )
    expect(result).toBe(10_910_000)
  })
})

describe('extractVars', () => {
  it('extracts variable names from formula', () => {
    const vars = extractVars('luong_co_ban * net_cong_so / 26')
    expect(vars).toContain('luong_co_ban')
    expect(vars).toContain('net_cong_so')
    expect(vars).not.toContain('26')
  })

  it('returns empty array for syntax error', () => {
    expect(extractVars('?broken??')).toEqual([])
  })
})

describe('buildDependencyGraph', () => {
  it('builds correct inter-column dependencies', () => {
    const columns = [
      { key: 'a', type: 'number', formula: null },
      { key: 'b', type: 'formula', formula: 'a * 2' },
      { key: 'c', type: 'formula', formula: 'a + b' },
    ]
    const graph = buildDependencyGraph(columns)
    expect(graph['a']).toEqual([])
    expect(graph['b']).toContain('a')
    expect(graph['c']).toContain('a')
    expect(graph['c']).toContain('b')
  })

  it('ignores system vars (not in column list)', () => {
    const columns = [
      { key: 'tong_luong', type: 'formula', formula: 'luong_co_ban * cong_so / 26' },
    ]
    // luong_co_ban, cong_so are system vars not in column list → ignored in graph
    const graph = buildDependencyGraph(columns)
    expect(graph['tong_luong']).toEqual([])
  })
})

describe('topologicalSort', () => {
  it('sorts deps before dependents', () => {
    const graph = { b: ['a'], a: [], c: ['b', 'a'] }
    const sorted = topologicalSort(graph)
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'))
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'))
  })

  it('handles no dependencies', () => {
    const graph = { a: [], b: [], c: [] }
    const sorted = topologicalSort(graph)
    expect(sorted).toHaveLength(3)
    expect(sorted).toContain('a')
    expect(sorted).toContain('b')
    expect(sorted).toContain('c')
  })

  it('throws CircularDependencyError on cycle', () => {
    const graph = { a: ['b'], b: ['a'] }
    expect(() => topologicalSort(graph)).toThrow(CircularDependencyError)
  })

  it('throws on three-node cycle', () => {
    const graph = { a: ['c'], b: ['a'], c: ['b'] }
    expect(() => topologicalSort(graph)).toThrow(CircularDependencyError)
  })
})

describe('detectCircular', () => {
  it('returns empty array for acyclic graph', () => {
    const graph = { a: [], b: ['a'], c: ['b'] }
    expect(detectCircular(graph)).toHaveLength(0)
  })

  it('detects a two-node cycle', () => {
    const graph = { a: ['b'], b: ['a'] }
    const cycles = detectCircular(graph)
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles[0]).toContain('a')
    expect(cycles[0]).toContain('b')
  })
})

describe('validateFormula', () => {
  const knownVars = ['luong_co_ban', 'net_cong_so', 'gio_tang_ca']
  const sampleVars = { luong_co_ban: 10_000_000, net_cong_so: 26, gio_tang_ca: 8 }

  it('returns ok=true and preview for valid formula', () => {
    const result = validateFormula('luong_co_ban * net_cong_so / 26', knownVars, sampleVars)
    expect(result.ok).toBe(true)
    expect(result.preview).toBe(10_000_000)
  })

  it('returns error for unknown variable', () => {
    const result = validateFormula('unknown_var + 1', knownVars, sampleVars)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('unknown_var')
  })

  it('returns error for syntax error', () => {
    const result = validateFormula('luong_co_ban ** ** 2', knownVars, sampleVars)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns error for empty formula', () => {
    const result = validateFormula('', knownVars, sampleVars)
    expect(result.ok).toBe(false)
  })

  it('accepts formula evaluating to 0', () => {
    const result = validateFormula('gio_tang_ca * 0', knownVars, sampleVars)
    expect(result.ok).toBe(true)
    expect(result.preview).toBe(0)
  })
})
