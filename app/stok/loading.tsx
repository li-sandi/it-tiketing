export default function StokLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-lg bg-[var(--surface-muted)]" />
        <div className="h-4 w-72 rounded bg-[var(--surface-muted)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-32 rounded-xl border bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
