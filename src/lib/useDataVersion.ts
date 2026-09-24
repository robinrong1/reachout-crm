import { useEffect, useState } from 'react'
import { onDataChanged } from './assistant'

/** Bumps whenever the assistant changes data, so a page can list it as an effect dependency and reload. */
export function useDataVersion() {
  const [version, setVersion] = useState(0)
  useEffect(() => onDataChanged(() => setVersion((current) => current + 1)), [])
  return version
}
