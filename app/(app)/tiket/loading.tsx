export default function TiketLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 rounded-xl border bg-[var(--surface)]" />
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
