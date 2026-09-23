import { diffDays } from '../utils/dates'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Next calendar date this birthday lands on, on or after `today`.
 * Feb 29 in a non-leap year is observed on Mar 1.
 */
export function nextBirthdayOn(birthday: string, today: string) {
  const [, month = 1, day = 1] = birthday.split('-').map(Number)
  const [year = 1970] = today.split('-').map(Number)

  function occurrence(forYear: number) {
    if (month === 2 && day === 29 && !isLeapYear(forYear)) {
      return `${forYear}-03-01`
    }
    return `${forYear}-${pad(month)}-${pad(day)}`
  }

  const thisYear = occurrence(year)
  if (thisYear >= today) return thisYear
  return occurrence(year + 1)
}

export function daysUntilBirthday(birthday: string, today: string) {
  return diffDays(nextBirthdayOn(birthday, today), today)
}
