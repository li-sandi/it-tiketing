export default function AsetLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--surface)] p-4">
        <div className="h-9 w-64 rounded-lg bg-[var(--surface-muted)]" />
        <div className="h-9 w-36 rounded-lg bg-[var(--surface-muted)]" />
      </div>
      <div className="space-y-2 rounded-xl border bg-[var(--surface)] p-4">
        <div className="h-10 rounded bg-[var(--surface-muted)]" />
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="h-12 rounded bg-[var(--surface-muted)]"
          />
        ))}
      </div>
    </div>
  );
}
