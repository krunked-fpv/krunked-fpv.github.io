export function BrandEmblem({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-[6px] bg-elevated shadow-[inset_0_1px_0_var(--inset-highlight),inset_0_0_0_1px_var(--hairline-strong)] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} viewBox="0 0 20 20" fill="none">
        {/* Precision milled K-monogram */}
        <path
          d="M4.2 3.5V16.5M4.2 10.1L11.6 3.5M7.4 7.3L12.6 16.5"
          stroke="var(--ink-primary)"
          strokeWidth="2.1"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        {/* International Orange hardware status LED */}
        <rect x="14.2" y="3.5" width="2.8" height="2.8" rx="0.6" fill="var(--led-hot)" />
        {/* Telemetry micro-ticks */}
        <path d="M14.2 12.6H17M14.2 15.6H17" stroke="var(--ink-muted)" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    </span>
  );
}
