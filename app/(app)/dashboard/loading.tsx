export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-9 w-56 rounded-lg bg-[var(--surface-muted)]" />
        <div className="h-9 w-40 rounded-lg bg-[var(--surface-muted)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-28 rounded-xl border bg-[var(--surface)] p-5"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl border bg-[var(--surface)] p-5" />
        <div className="h-64 rounded-xl border bg-[var(--surface)] p-5" />
      </div>
    </div>
  );
}
