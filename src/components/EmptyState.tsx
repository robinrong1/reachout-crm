type EmptyStateProps = {
  title: string
  body?: string
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <article className="home-card home-card-quiet" role="status">
      <h3 className="home-card-title">{title}</h3>
      {body ? <p className="home-card-body">{body}</p> : null}
    </article>
  )
}
