export default function WikiLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 rounded-xl border bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-36 rounded-xl border bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
