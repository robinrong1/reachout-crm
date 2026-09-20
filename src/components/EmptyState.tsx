type EmptyStateProps = {
  title: string
  body?: string
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-[var(--border)] px-4 py-8 text-center">
      <p className="m-0 text-lg font-medium text-[var(--text-h)]">{title}</p>
      {body ? <p className="mt-2 text-[var(--text)]">{body}</p> : null}
    </div>
  )
}
