export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1d4ed8] text-white shadow-xs"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
        >
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path strokeLinecap="round" d="M8 21h8M12 17v4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10.5l2 2 5-4.5" />
        </svg>
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">
          IT Service Desk
        </p>
        {!compact && (
          <p className="truncate text-[11px] font-medium text-[var(--muted)]">
            Debito Jogja
          </p>
        )}
      </div>
    </div>
  );
}
