export default function AntrianLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-[var(--surface-muted)]" />
          <div className="h-4 w-72 rounded bg-[var(--surface-muted)]" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-[var(--surface-muted)]" />
      </div>
      <div className="h-14 rounded-xl border bg-[var(--surface)]" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="h-20 rounded-xl border bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
