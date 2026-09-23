const MS_PER_DAY = 86_400_000

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatIsoDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Add calendar days to a YYYY-MM-DD date (matches Postgres `date + int`). */
export function addDays(isoDate: string, days: number) {
  const date = parseIsoDate(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return formatIsoDate(date)
}

/** Whole days from `from` to `to` (matches Postgres `date - date`). */
export function diffDays(to: string, from: string) {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY)
}

export function calendarDateInTimeZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Could not format calendar date for timezone ${timeZone}`)
  }

  return `${year}-${month}-${day}`
}

export function todayInTimeZone(timeZone: string, now = new Date()) {
  return calendarDateInTimeZone(now, timeZone)
}

/** Month heading for a YYYY-MM-DD date, e.g. SEP 2026. */
export function formatMonthHeading(isoDate: string) {
  const [year, month] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toUpperCase()
}
/** Display a YYYY-MM-DD calendar date in the user's locale. */
export function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function localCalendarDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Weekday for a YYYY-MM-DD date, e.g. Thursday. */
export function formatWeekday(isoDate: string) {
  return localCalendarDate(isoDate).toLocaleDateString('en-US', { weekday: 'long' })
}

/** Month and day without year — birthdays on Home should not spotlight age. */
export function formatMonthDay(isoDate: string) {
  return localCalendarDate(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
