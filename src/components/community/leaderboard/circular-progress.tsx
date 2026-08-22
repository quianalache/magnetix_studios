"use client";

/** A simple SVG circular progress ring — used behind the Leaderboard's own
 *  avatar to show level progress, matching the approved mockup. Pure/
 *  presentational, no dependency beyond React. */
export function CircularProgress({
  size,
  strokeWidth,
  progress,
  color,
  trackColor = "#E4E4E4",
  children,
}: {
  size: number;
  strokeWidth: number;
  /** 0–1. */
  progress: number;
  color: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
