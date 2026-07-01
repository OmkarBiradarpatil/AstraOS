import { describe, expect, it } from 'vitest'
import { daysUntil, todayIso } from './date'

describe('date utilities', () => {
  it('formats the local calendar day without UTC slicing', () => {
    expect(todayIso(new Date(2026, 5, 8, 1, 30))).toBe('2026-06-08')
  })

  it('calculates day distance from an injected local date', () => {
    expect(daysUntil('2026-06-10', new Date(2026, 5, 8, 12))).toBe(2)
  })
})
