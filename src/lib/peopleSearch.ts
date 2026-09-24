import { contactMatchesQuery, type SearchOption } from './contacts'

function rank(option: SearchOption, needle: string) {
  const name = option.name.toLowerCase()
  if (name.startsWith(needle)) return 0
  if (name.includes(needle)) return 1
  return 2
}

/** Top-bar matches: names starting with the query, then names containing it, then email or relationship. */
export function rankPeople(options: SearchOption[], query: string, limit = 6) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  return options
    .filter((option) => contactMatchesQuery(option, needle))
    .sort((a, b) => rank(a, needle) - rank(b, needle) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
