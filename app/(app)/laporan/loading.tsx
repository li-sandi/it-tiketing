export default function LaporanLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-5 w-64 rounded bg-[var(--surface-muted)]" />
        <div className="h-9 w-28 rounded-lg bg-[var(--surface-muted)]" />
      </div>
      <div className="h-20 rounded-xl border bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-24 rounded-xl border bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="h-72 rounded-xl border bg-[var(--surface)]" />
    </div>
  );
}
