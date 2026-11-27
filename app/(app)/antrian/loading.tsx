export default function AntrianLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-10 w-56 rounded-lg bg-[var(--surface-muted)]" />
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
