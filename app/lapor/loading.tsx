export default function LaporLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <div className="h-15 border-b bg-[var(--surface)]" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="animate-pulse rounded-xl border bg-[var(--surface)] p-5 shadow-xs sm:p-8">
          <div className="mb-6 space-y-2.5 border-b pb-5">
            <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />
            <div className="h-7 w-64 rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-4 w-full max-w-md rounded bg-[var(--surface-muted)]" />
          </div>
          <div className="space-y-4">
            <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-28 rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-24 rounded-lg bg-[var(--surface-muted)]" />
            <div className="h-10 rounded-lg bg-[var(--surface-muted)]" />
          </div>
        </div>
      </main>
    </div>
  );
}
