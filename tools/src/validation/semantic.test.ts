/**
 * Component §5.7's period: the shortest interval between two consecutive times
 * a schedule falls due, counted across the end of an hour, a day, a month, a
 * year and a leap day, and absent for a schedule that never falls due.
 */
import { describe, expect, test } from 'bun:test'
import type { Json } from '../lib/layout.ts'
import { componentDiagnostics, cronPeriodSeconds, GREGORIAN_CYCLE_DAYS } from './semantic.ts'

const MINUTE = 60
const DAY = 86400

describe('cronPeriodSeconds', () => {
  test('every row of §5.7’s table', () => {
    expect(cronPeriodSeconds('*/15 * * * *')).toBe(15 * MINUTE)
    expect(cronPeriodSeconds('*/7 * * * *')).toBe(4 * MINUTE)
    expect(cronPeriodSeconds('0,50 0,23 * * *')).toBe(10 * MINUTE)
    expect(cronPeriodSeconds('0 3 1,15 * *')).toBe(14 * DAY)
    expect(cronPeriodSeconds('0 0 1 * 1')).toBe(DAY)
    expect(cronPeriodSeconds('0 0 28,29 2 *')).toBe(DAY)
    expect(cronPeriodSeconds('0 0 30 2 *')).toBeUndefined()
  })

  test('the shortest interval, wherever it falls', () => {
    expect(cronPeriodSeconds('* * * * *')).toBe(MINUTE)
    // From 20:00 to the next day's 00:00, not the five hours between the others.
    expect(cronPeriodSeconds('0 */5 * * *')).toBe(4 * 60 * MINUTE)
    // `n/s` is `n-max/s`: minutes 5, 25 and 45.
    expect(cronPeriodSeconds('5/20 * * * *')).toBe(20 * MINUTE)
    expect(cronPeriodSeconds('0 9-17 * * 1-5')).toBe(60 * MINUTE)
    expect(cronPeriodSeconds('0 0 * * 0')).toBe(7 * DAY)
    // Across the end of a month (31 July to 31 August) and of a year.
    expect(cronPeriodSeconds('0 0 31 * *')).toBe(31 * DAY)
    expect(cronPeriodSeconds('0 0 1,31 1,12 *')).toBe(DAY)
    expect(cronPeriodSeconds('0 0 1 1 *')).toBe(365 * DAY)
  })

  test('leap days, and the century years that skip one', () => {
    // 29 February falls due four years apart at the shortest, eight across 2100.
    expect(cronPeriodSeconds('0 0 29 2 *')).toBe(1461 * DAY)
    // A Monday in February, or 29 February, which follows a Monday in some leap years.
    expect(cronPeriodSeconds('0 0 29 2 1')).toBe(DAY)
    expect(GREGORIAN_CYCLE_DAYS % 7).toBe(0)
  })

  test('a schedule that never falls due, or is not valid, has no period', () => {
    expect(cronPeriodSeconds('0 0 31 2,4,6,9,11 *')).toBeUndefined()
    expect(cronPeriodSeconds('99 * * * *')).toBeUndefined()
    expect(cronPeriodSeconds('@daily')).toBeUndefined()
  })
})

describe('COMP-JOB-006', () => {
  const job = (workload: { readonly [key: string]: Json }) =>
    componentDiagnostics({
      specVersion: 'v2',
      kind: 'COMPONENT',
      metadata: { revision: 1 },
      spec: { type: 'JOB', workload: { source: { image: 'example/job:1' }, ...workload } },
    }).map((d) => `${d.code}@${d.path}`)
  const late = 'ERR_TIME_LIMIT_NOT_UNDER_SCHEDULE@/spec/workload/timeLimitSeconds'

  test('a limit shorter than the period passes, and one as long or longer fails', () => {
    expect(job({ schedule: { cron: '*/15 * * * *' }, timeLimitSeconds: 899 })).not.toContain(late)
    expect(job({ schedule: { cron: '*/15 * * * *' }, timeLimitSeconds: 900 })).toContain(late)
    expect(job({ schedule: { cron: '*/15 * * * *' }, timeLimitSeconds: 901 })).toContain(late)
  })

  test('a job without a schedule, or a schedule without a period, constrains no limit', () => {
    expect(job({ timeLimitSeconds: 604800 })).toEqual([])
    expect(job({ schedule: { cron: '0 0 30 2 *' }, timeLimitSeconds: 604800 })).toEqual([])
    expect(job({ schedule: { cron: '99 * * * *' }, timeLimitSeconds: 60 })).toEqual([
      'ERR_INVALID_SCHEDULE@/spec/workload/schedule/cron',
    ])
  })

  test('a scheduled job that declares no limit is never rejected for one', () => {
    expect(job({ schedule: { cron: '* * * * *' } })).toEqual([])
  })
})
