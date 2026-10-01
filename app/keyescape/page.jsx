'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BRANCHES, fmtDate } from '@/lib/keyescape';

const box =
  'w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm text-bone placeholder:text-edge ' +
  'focus:border-brass/60 focus:outline-none';
const lbl = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-mute';
const card = 'rounded-xl border border-edge bg-slab p-5 sm:p-6';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const h2 = 'mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute';

const ENV = `# .env.local (git 에 안 올라감) — 쓰는 것만 채우면 됩니다
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=`;

function Copy({ text, label = '복사' }) {
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

function Code({ children }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-edge bg-ink p-4 font-mono text-xs leading-relaxed text-bone">
      {children}
    </pre>
  );
}

export default function Keyescape() {
  const [zizum, setZizum] = useState('18');
  const [list, setList] = useState([]);
  const [info, setInfo] = useState('');
  const [view, setView] = useState(null); // { theme, url, today, dates }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [watch, setWatch] = useState([]); // [{ url, label }]
  const [every, setEvery] = useState('60');
  const [after, setAfter] = useState('');
  const [before, setBefore] = useState('');
  const [dates, setDates] = useState([]);

  useEffect(() => {
    if (!zizum) return;
    setList([]);
    setInfo('');
    setView(null);
    setErr('');
    fetch(`/api/keyescape?zizum=${zizum}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setList(j.themes) : setErr(j.msg)))
      .catch((e) => setErr(String(e)));
  }, [zizum]);

  async function load(i = info) {
    if (!i) return;
    setBusy(true);
    setErr('');
    try {
      const j = await (await fetch(`/api/keyescape?zizum=${zizum}&info=${i}`)).json();
      if (j.ok) setView(j);
      else setErr(j.msg);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!view || watch.some((w) => w.url === view.url)) return;
    setWatch((p) => [...p, { url: view.url, label: `${view.theme.branch} · ${view.theme.name}` }]);
  }

  const toggleDate = (d) => setDates((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  const cmd = [
    'npm run keyescape --',
    ...watch.map((w) => `"${w.url}"`),
    every && every !== '60' && `--every ${every}`,
    ...dates.map((d) => `--date ${d}`),
    after && `--after ${after}`,
    before && `--before ${before}`,
  ]
    .filter(Boolean)
    .join(' ');

  const openCount = view
    ? Object.values(view.dates).flat().filter((s) => s.open).length
    : 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div>
        <Link href="/" className="font-mono text-xs text-mute transition hover:text-brass">
          ← Tongdaeng
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-bone">키이스케이프</h1>
        <p className="mt-1 font-mono text-xs text-mute">
          취소표 알림봇 · 닫혀 있던 슬롯이 열리면 텔레그램 / 디스코드로 알려줍니다
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {/* ── 테마 선택 ── */}
        <section className={card}>
          <h2 className={h2}>1 · 테마 고르기</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={lbl}>지점</label>
              <select className={box} value={zizum} onChange={(e) => setZizum(e.target.value)}>
                {BRANCHES.map(([n, name]) => (
                  <option key={n} value={n}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>테마</label>
              <select
                className={box}
                value={info}
                onChange={(e) => {
                  setInfo(e.target.value);
                  setDates([]);
                  load(e.target.value);
                }}
              >
                <option value="">{list.length ? '테마 선택' : '불러오는 중…'}</option>
                {list.map((t) => (
                  <option key={t.info} value={t.info}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {err && <p className="mt-4 font-mono text-xs text-rust">{err}</p>}
        </section>

        {/* ── 현황 ── */}
        {view && (
          <section className={card}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                지금 현황 · 열린 자리 <span className={openCount ? 'text-jade' : 'text-bone'}>{openCount}</span>
              </h2>
              <div className="flex gap-2">
                <button onClick={() => load()} disabled={busy} className={`${btn} bg-edge text-bone hover:bg-edge/70`}>
                  {busy ? '조회 중…' : '새로고침'}
                </button>
                <button
                  onClick={add}
                  disabled={watch.some((w) => w.url === view.url)}
                  className={`${btn} bg-brass text-ink hover:bg-brass/90`}
                >
                  감시 목록에 추가
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {Object.entries(view.dates).map(([d, slots]) => (
                <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge/50 pb-2">
                  <button
                    onClick={() => toggleDate(d)}
                    title="이 날짜만 알림받기"
                    className={`w-24 shrink-0 text-left font-mono text-xs transition ${
                      dates.includes(d) ? 'text-brass' : 'text-mute hover:text-bone'
                    }`}
                  >
                    {dates.includes(d) ? '● ' : ''}
                    {fmtDate(d)}
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => (
                      <span
                        key={s.num}
                        className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                          s.open ? 'bg-jade/20 text-jade ring-1 ring-jade/40' : 'text-edge line-through'
                        }`}
                      >
                        {s.time}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-[11px] text-edge">
              날짜를 누르면 그 날짜만 알림받도록 명령에 넣습니다 (아무것도 안 고르면 전체)
            </p>
          </section>
        )}

        {/* ── 명령 ── */}
        <section className={card}>
          <h2 className={h2}>2 · 실행 명령</h2>

          {watch.length > 0 ? (
            <ul className="mb-5 space-y-1.5">
              {watch.map((w) => (
                <li key={w.url} className="flex items-center justify-between gap-4 border-b border-edge/50 pb-1.5">
                  <span className="text-sm text-bone">{w.label}</span>
                  <button
                    onClick={() => setWatch((p) => p.filter((x) => x.url !== w.url))}
                    className="font-mono text-xs text-mute transition hover:text-rust"
                  >
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-mute">위에서 테마를 고르고 감시 목록에 추가하세요.</p>
          )}

          <div className="mb-5 grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>간격(초)</label>
              <input className={box} value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className={lbl}>이후</label>
              <input className={box} type="time" value={after} onChange={(e) => setAfter(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>이전</label>
              <input className={box} type="time" value={before} onChange={(e) => setBefore(e.target.value)} />
            </div>
          </div>

          {watch.length > 0 && (
            <>
              <Code>{cmd}</Code>
              <div className="mt-4">
                <Copy text={cmd} label="명령 복사" />
              </div>
            </>
          )}
          <p className="mt-4 font-mono text-[11px] text-edge">
            프로젝트 폴더 터미널에서 실행. 켜둔 동안만 감시합니다 · Ctrl+C 로 종료
          </p>
        </section>

        {/* ── 알림 채널 ── */}
        <section className={card}>
          <h2 className={h2}>3 · 알림 채널 연결 (처음 한 번)</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-bone">텔레그램 (추천)</p>
              <ol className="space-y-1.5 text-sm text-mute">
                <li>1. 텔레그램에서 @BotFather → /newbot → 토큰 받기</li>
                <li>2. 만든 봇에게 아무 말이나 보내기</li>
                <li>
                  3. 브라우저로{' '}
                  <code className="break-all rounded bg-ink px-1 font-mono text-xs text-bone">
                    api.telegram.org/bot&lt;토큰&gt;/getUpdates
                  </code>{' '}
                  열어서 <code className="font-mono text-xs text-bone">chat.id</code> 확인
                </li>
              </ol>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-bone">디스코드</p>
              <ol className="space-y-1.5 text-sm text-mute">
                <li>1. 내 서버 채널 → 채널 편집 → 연동 → 웹후크</li>
                <li>2. 새 웹후크 → 웹후크 URL 복사</li>
              </ol>
            </div>
          </div>

          <div className="mt-6">
            <Code>{ENV}</Code>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Copy text={ENV} label=".env.local 양식 복사" />
              <code className="font-mono text-xs text-mute">npm run keyescape -- --test</code>
              <span className="text-xs text-edge">로 알림 확인</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-rust/40 bg-rust/5 p-5 sm:p-6">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-rust">알아둘 것</h2>
          <ul className="space-y-2.5 text-sm text-mute">
            <li>
              <span className="text-bone">취소표만 알립니다.</span> 시작할 때 이미 열린 자리는 첫 메시지에
              한 번만 보여주고, 매일 새로 열리는 날짜도 조용히 넘깁니다.
            </li>
            <li>
              <span className="text-bone">PC 가 켜져 있어야 합니다.</span> 절전 모드에 들어가면 감시도
              멈춥니다.
            </li>
            <li>
              <span className="text-bone">간격은 최소 20초입니다.</span> 테마 하나당 한 번에 날짜 수만큼
              요청이 나갑니다. 서버에 부담 주지 않게 60초 정도를 권장합니다.
            </li>
            <li>
              <span className="text-bone">키이스케이프는 예약 대행과 거래를 금지합니다.</span> 본인 예약
              용도로만 쓰세요.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
