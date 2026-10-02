'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BRANCHES, fmtDate } from '@/lib/keyescape';

/* 알림봇(/keyescape)과 예약 도우미(/keyescape/book)가 같이 쓰는 조각 */

export const box =
  'w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm text-bone placeholder:text-edge ' +
  'focus:border-brass/60 focus:outline-none';
export const lbl = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute';
export const card = 'rounded-xl border border-edge bg-slab p-5 sm:p-6';
export const btn =
  'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
export const h2 = 'mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute';

export function Copy({ text, label = '복사' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
      className={`${btn} bg-edge text-bone hover:bg-edge/70`}
    >
      {done ? '복사됨' : label}
    </button>
  );
}

export function Code({ children }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-edge bg-ink p-4 font-mono text-xs leading-relaxed text-bone">
      {children}
    </pre>
  );
}

export function Header({ sub, other }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/" className="font-mono text-xs text-mute transition hover:text-brass">
          ← Tongdaeng
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-bone">키이스케이프</h1>
        <p className="mt-1 font-mono text-xs text-mute">{sub}</p>
      </div>
      <Link href={other.href} className="font-mono text-xs text-brass transition hover:underline">
        {other.label} →
      </Link>
    </div>
  );
}

/** 지점 → 테마 → 현황(view) 조회 */
export function useThemeView() {
  const [zizum, setZizum] = useState('18');
  const [list, setList] = useState([]);
  const [info, setInfo] = useState('');
  const [view, setView] = useState(null); // { theme, url, today, dates }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const seq = useRef(0); // 지점·테마를 빨리 바꾸면 늦게 온 예전 응답이 덮어쓰지 않도록

  useEffect(() => {
    if (!zizum) return;
    const my = ++seq.current;
    setList([]);
    setInfo('');
    setView(null);
    setErr('');
    setBusy(false);
    fetch(`/api/keyescape?zizum=${zizum}`)
      .then((r) => r.json())
      .then((j) => my === seq.current && (j.ok ? setList(j.themes) : setErr(j.msg || '테마 목록 조회 실패')))
      .catch((e) => my === seq.current && setErr(String(e)));
  }, [zizum]);

  async function load(i = info) {
    if (!i) return;
    const my = ++seq.current;
    setBusy(true);
    setErr('');
    try {
      const j = await (await fetch(`/api/keyescape?zizum=${zizum}&info=${i}`)).json();
      if (my !== seq.current) return;
      if (j.ok) setView(j);
      else setErr(j.msg || '현황 조회 실패');
    } catch (e) {
      if (my === seq.current) setErr(String(e));
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  function choose(i) {
    setInfo(i);
    setView(null);
    load(i);
  }

  return { zizum, setZizum, list, info, choose, view, busy, err, reload: () => load() };
}

export function ThemePicker({ tv, title }) {
  return (
    <section className={card}>
      <h2 className={h2}>{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={lbl}>지점</label>
          <select className={box} value={tv.zizum} onChange={(e) => tv.setZizum(e.target.value)}>
            {BRANCHES.map(([n, name]) => (
              <option key={n} value={n}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>테마</label>
          <select className={box} value={tv.info} onChange={(e) => tv.choose(e.target.value)}>
            <option value="">{tv.list.length ? '테마 선택' : '불러오는 중…'}</option>
            {tv.list.map((t) => (
              <option key={t.info} value={t.info}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tv.err && <p className="mt-4 font-mono text-xs text-rust">{tv.err}</p>}
    </section>
  );
}

/**
 * 날짜별 슬롯 표.
 *   date   { active(d), onClick(d), title }   날짜 라벨 동작 (없으면 그냥 글자)
 *   slot   { picked(d, s), onClick(d, s) }    열린 슬롯 동작 (없으면 표시만)
 */
export function SlotGrid({ tv, actions, date, slot, hint }) {
  const { view } = tv;
  if (!view) return null;
  const openCount = Object.values(view.dates).flat().filter((s) => s.open).length;

  return (
    <section className={card}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
          지금 현황 · 열린 자리 <span className={openCount ? 'text-jade' : 'text-bone'}>{openCount}</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={tv.reload} disabled={tv.busy} className={`${btn} bg-edge text-bone hover:bg-edge/70`}>
            {tv.busy ? '조회 중…' : '새로고침'}
          </button>
          {actions}
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(view.dates).map(([d, slots]) => (
          <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge/50 pb-2">
            {date ? (
              <button
                onClick={() => date.onClick(d)}
                title={date.title}
                className={`w-24 shrink-0 text-left font-mono text-xs transition ${
                  date.active(d) ? 'text-brass' : 'text-mute hover:text-bone'
                }`}
              >
                {date.active(d) ? '● ' : ''}
                {fmtDate(d)}
              </button>
            ) : (
              <span className="w-24 shrink-0 font-mono text-xs text-mute">{fmtDate(d)}</span>
            )}
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) =>
                !s.open ? (
                  <span key={s.num} className="rounded px-1.5 py-0.5 font-mono text-[11px] text-edge line-through">
                    {s.time}
                  </span>
                ) : slot ? (
                  <button
                    key={s.num}
                    onClick={() => slot.onClick(d, s)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 transition ${
                      slot.picked(d, s)
                        ? 'bg-brass text-ink ring-brass'
                        : 'bg-jade/20 text-jade ring-jade/40 hover:bg-jade/30'
                    }`}
                  >
                    {s.time}
                  </button>
                ) : (
                  <span
                    key={s.num}
                    className="rounded bg-jade/20 px-1.5 py-0.5 font-mono text-[11px] text-jade ring-1 ring-jade/40"
                  >
                    {s.time}
                  </span>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      {hint && <p className="mt-4 font-mono text-[11px] text-edge">{hint}</p>}
    </section>
  );
}
