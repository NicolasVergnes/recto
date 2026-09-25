/**
 * Study-day arithmetic (SPEC §5.3): the day changes at `dayStartHour` (04:00) local time; dates
 * are stored in UTC ms. Wall-clock based, hence correct across daylight-saving changes.
 */
export const DAY_MS = 86_400_000

export interface LocalDate {
  year: number
  /** 0–11 */
  month: number
  /** 1–31 */
  day: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

/** Calendar date of the study day containing `now`. */
export function studyDate(now: number, dayStartHour: number): LocalDate {
  const d = new Date(now)
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1)
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay() }
}

/** Start (ms) of a local date's study day, `offset` days later. */
export function startOfDate(date: Omit<LocalDate, 'weekday'>, dayStartHour: number, offset = 0) {
  return new Date(date.year, date.month, date.day + offset, dayStartHour).getTime()
}

/** Start of the study day containing `now`. */
export function dayStart(now: number, dayStartHour: number): number {
  return startOfDate(studyDate(now, dayStartHour), dayStartHour)
}

/** Start of the next study day: cards due before it belong to today (03 §5 `dueLimit`). */
export function nextDayStart(now: number, dayStartHour: number): number {
  return startOfDate(studyDate(now, dayStartHour), dayStartHour, 1)
}

/** `YYYY-MM-DD` of the study day (random seeds, "once a day" tips). */
export function dayKey(now: number, dayStartHour: number): string {
  const { year, month, day } = studyDate(now, dayStartHour)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Whole study days between two instants (≥ 0 when `to` is later). */
export function daysBetween(from: number, to: number, dayStartHour: number): number {
  const a = studyDate(from, dayStartHour)
  const b = studyDate(to, dayStartHour)
  return Math.round((Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / DAY_MS)
}

/** Local date `offset` calendar days after `date`. */
export function addDays(date: Omit<LocalDate, 'weekday'>, offset: number): LocalDate {
  const d = new Date(date.year, date.month, date.day + offset, 12)
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay() }
}
