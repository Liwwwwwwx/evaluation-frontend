export function Logo({ className = "" }: { className?: string }) {
  return <svg className={`science-logo ${className}`} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="12" fill="#212624" />
    <path d="M10.5 23.5 16 13l5 10 3.3-6.5 5.2 10" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="29.5" cy="11" r="2" fill="#A7D7BF" />
  </svg>;
}
