export default function TiketLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-lg bg-[var(--surface-muted)]" />
          <div className="h-4 w-64 rounded bg-[var(--surface-muted)]" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-[var(--surface-muted)]" />
      </div>
      <div className="h-14 rounded-xl border bg-[var(--surface)]" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-24 rounded-xl border bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
