type ErrorBannerProps = {
  message: string
  onRetry?: () => void
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3"
      role="alert"
    >
      <p className="m-0 text-sm text-[var(--danger)]">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary mt-2" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
