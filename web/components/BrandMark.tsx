// app/icon.svg mirrors this
export default function BrandMark() {
  return (
    <svg className="brand-mark" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15.45" fill="none" stroke="#1b1a17" strokeWidth="1.1" />
      {[0, 90, 180, 270].map((deg) => (
        <rect key={deg} x="15.5" y="1.5" width="1" height="3" fill="#1b1a17" transform={`rotate(${deg} 16 16)`} />
      ))}
      <g transform="rotate(35 16 16)">
        <polygon points="16,6.5 13,16 19,16" fill="#1b1a17" />
        <polygon points="16,25.5 13,16 19,16" fill="#9a6b3a" />
      </g>
      <circle cx="16" cy="16" r="1.2" fill="#f7f2e8" />
    </svg>
  );
}
