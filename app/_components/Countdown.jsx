'use client';

import { useEffect, useState } from 'react';

function msUntilKST(h, m) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());

  const now = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])
  );

  const cur = (now.hour % 24) * 3600 + now.minute * 60 + now.second;
  let diff = h * 3600 + m * 60 - cur;
  if (diff <= 0) diff += 86400;
  return diff * 1000;
}

function split(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [
    String(Math.floor(t / 3600)).padStart(2, '0'),
    String(Math.floor((t % 3600) / 60)).padStart(2, '0'),
    String(t % 60).padStart(2, '0'),
  ];
}

export default function Countdown({ h = 0, m = 0, compact = false }) {
  const [ms, setMs] = useState(null);

  useEffect(() => {
    const tick = () => setMs(msUntilKST(h, m));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [h, m]);

  const groups = ms === null ? ['--', '--', '--'] : split(ms);
  const size = compact ? 'text-2xl sm:text-3xl' : 'text-5xl sm:text-7xl';

  return (
    <div
      className={`font-display ${size} font-bold tabular-nums leading-none tracking-tight`}
      role="timer"
      aria-label="다음 오픈까지 남은 시간"
    >
      {groups.map((group, gi) => (
        <span key={gi}>
          {gi > 0 && <span className="mx-[0.06em] text-edge">:</span>}
          {group.split('').map((d, i) => (
            <span key={i} className="relative inline-block px-[0.14em]">
              <span aria-hidden className="select-none text-edge/70">8</span>
              <span className="absolute inset-0 flex items-center justify-center text-brass">
                {d}
              </span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}