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

/** 0 = Sunday … 6 = Saturday, matching users.digest_day_of_week. */
export function dayOfWeekInTimeZone(timeZone: string, now = new Date()) {
  const isoDate = todayInTimeZone(timeZone, now)
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function isDigestDue(digestDayOfWeek: number, timeZone: string, now = new Date()) {
  return dayOfWeekInTimeZone(timeZone, now) === digestDayOfWeek
}

export function reminderWasSentOnLocalDate(
  sentAt: string,
  timeZone: string,
  localDate: string,
) {
  return calendarDateInTimeZone(new Date(sentAt), timeZone) === localDate
}
