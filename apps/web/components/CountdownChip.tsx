"use client";

import { useEffect, useState } from "react";

function diffParts(target: number) {
  const now = Date.now();
  const ms = Math.max(0, target - now);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s, expired: ms === 0 };
}

export function CountdownChip({
  expiresAt,
  className = "",
}: {
  expiresAt: string;
  className?: string;
}) {
  const target = new Date(expiresAt).getTime();
  const [parts, setParts] = useState(() => diffParts(target));

  useEffect(() => {
    const id = setInterval(() => setParts(diffParts(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const label = parts.expired
    ? "Ended"
    : parts.h > 0
      ? `${parts.h}h ${String(parts.m).padStart(2, "0")}m left`
      : `${parts.m}m ${String(parts.s).padStart(2, "0")}s left`;

  return (
    <span
      className={
        "inline-flex items-center rounded-full bg-ink-900/5 px-2.5 py-1 text-xs font-medium text-ink-900/80 " +
        className
      }
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
      {label}
    </span>
  );
}
