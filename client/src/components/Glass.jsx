// A glass that fills up as she drinks. The water level is a CSS transform so it animates
// smoothly everywhere (including iOS Safari, which can't animate SVG geometry via CSS).

const GLASS = 'M32 22 H168 L150 232 Q148 248 132 248 H68 Q52 248 50 232 Z';
const TOP = 22; // y of the glass rim
const INNER = 226; // height of the inside of the glass

export default function Glass({ fraction, label, sub }) {
  const f = Math.max(0, Math.min(1, fraction));
  // empty glass: park the water below the bottom edge so no sliver of wave shows
  const y = f === 0 ? 280 : TOP + INNER * (1 - f);

  return (
    <div className="glass-wrap">
      <svg viewBox="0 0 200 270" className="glass" role="img" aria-label={`${label} ${sub}`}>
        <defs>
          <clipPath id="cup">
            <path d={GLASS} />
          </clipPath>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>

        <path d={GLASS} className="glass-fill" />
        <g clipPath="url(#cup)">
          <g className="water" style={{ transform: `translateY(${y}px)` }}>
            <g className="wave">
              <path
                d="M-100 0 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V300 H-100 Z"
                fill="url(#water)"
              />
            </g>
          </g>
        </g>
        <path d={GLASS} className="glass-edge" />
      </svg>

      <div className="glass-label">
        <strong>{label}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}
