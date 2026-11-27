export default function AdminLoading() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={idx}
          className="h-32 rounded-xl border bg-[var(--surface)] p-5"
        />
      ))}
    </div>
  );
}
