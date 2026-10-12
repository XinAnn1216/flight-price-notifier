import { useId } from "react";

// Fan of fine veins radiating from the leaf base, clipped to the blade.
const VEINS = Array.from({ length: 34 }, (_, i) => -68 + (i * 136) / 33);

export function GinkgoLeaf({
  className = "",
  veins = true,
}: {
  className?: string;
  veins?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const blade =
    "M100 118 C 82 108, 46 88, 20 60 C 18 52, 22 46, 26 44 C 30 34, 40 28, 48 26 C 56 18, 70 14, 80 16 C 86 14, 92 18, 94 22 L 100 40 L 106 22 C 108 18, 114 14, 120 16 C 130 14, 144 18, 152 26 C 160 28, 170 34, 174 44 C 178 46, 182 52, 180 60 C 154 88, 118 108, 100 118 Z";
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--leaf-light)" />
          <stop offset="55%" stopColor="var(--leaf)" />
          <stop offset="100%" stopColor="var(--leaf-deep)" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <path d={blade} />
        </clipPath>
      </defs>
      <path
        d="M100 116 C 101 140, 98 164, 90 188"
        fill="none"
        stroke="var(--leaf-deep)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d={blade} fill={`url(#g${id})`} />
      {veins && (
        <g
          clipPath={`url(#c${id})`}
          stroke="var(--leaf-deep)"
          strokeOpacity="0.35"
          strokeWidth="0.6"
        >
          {VEINS.map((deg) => {
            const r = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1="100"
                y1="118"
                x2={100 + Math.sin(r) * 140}
                y2={118 - Math.cos(r) * 140}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}
