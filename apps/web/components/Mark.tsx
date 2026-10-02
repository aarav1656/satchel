/** The key rail mark from brand/mark.svg, cropped to its drawing and stroked in currentColor. */
export function Mark() {
  return (
    <svg viewBox="150 180 760 440" aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="28" strokeLinecap="round">
        <path d="M 314 400 C 450 400, 480 226, 640 226" />
        <path d="M 314 400 L 640 400" />
        <path d="M 314 400 C 450 400, 480 574, 640 574" />
      </g>
      <circle cx="250" cy="400" r="64" fill="currentColor" />
      <g fill="currentColor">
        <rect x="640" y="198" width="150" height="56" rx="14" />
        <rect x="640" y="372" width="150" height="56" rx="14" />
        <rect x="640" y="546" width="150" height="56" rx="14" />
      </g>
      <path d="M 790 400 L 898 400" stroke="var(--accent)" strokeWidth="28" strokeLinecap="round" />
      <circle cx="936" cy="400" r="30" fill="var(--canvas)" stroke="currentColor" strokeWidth="20" />
    </svg>
  );
}
