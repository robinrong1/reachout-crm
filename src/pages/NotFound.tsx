import { BrandHeading } from '../components/BrandMark'

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12">
      <BrandHeading />
      <h1 className="font-[family-name:var(--heading)] text-3xl text-[var(--text-h)]">Page not found</h1>
      <p className="page-kicker mt-2">There is nothing at this address.</p>
      <div className="mt-8 flex">
        <a className="btn btn-primary min-h-11" href="/">
          Go to Reach
        </a>
      </div>
    </main>
  )
}
