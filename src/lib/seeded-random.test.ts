import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Test the seeded-random module for determinism
import { seededRandom, randomInt, randomPick, randomDaysBack, resetState } from './seeded-random'

describe('seeded-random', () => {
  it('should produce deterministic sequences', () => {
    resetState()
    const seq1 = Array.from({ length: 10 }, () => seededRandom())
    resetState()
    const seq2 = Array.from({ length: 10 }, () => seededRandom())
    expect(seq1).toEqual(seq2)
  })

  it('should produce different sequences with different seeds', () => {
    resetState(42)
    const seq1 = Array.from({ length: 5 }, () => seededRandom())
    resetState(99)
    const seq2 = Array.from({ length: 5 }, () => seededRandom())
    expect(seq1).not.toEqual(seq2)
  })

  it('randomInt should return values within range', () => {
    resetState()
    for (let i = 0; i < 100; i++) {
      const val = randomInt(5, 10)
      expect(val).toBeGreaterThanOrEqual(5)
      expect(val).toBeLessThanOrEqual(10)
    }
  })

  it('randomPick should return elements from the array', () => {
    resetState()
    const arr = ['a', 'b', 'c', 'd']
    for (let i = 0; i < 20; i++) {
      const val = randomPick(arr)
      expect(arr).toContain(val)
    }
  })

  it('randomDaysBack should return dates in the past', () => {
    resetState()
    const ref = new Date('2026-04-25T12:00:00.000Z')
    for (let i = 0; i < 20; i++) {
      const date = randomDaysBack(30, ref)
      expect(date.getTime()).toBeLessThanOrEqual(ref.getTime())
    }
  })

  it('randomDaysBack should be deterministic', () => {
    resetState()
    const ref = new Date('2026-04-25T12:00:00.000Z')
    const dates1 = Array.from({ length: 10 }, () => randomDaysBack(30, ref).getTime())
    resetState()
    const dates2 = Array.from({ length: 10 }, () => randomDaysBack(30, ref).getTime())
    expect(dates1).toEqual(dates2)
  })
})
