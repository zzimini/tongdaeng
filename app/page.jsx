import Link from 'next/link';
import Countdown from './_components/Countdown';
import { VENUES, STATUS, ORDER, nextUp } from '@/lib/venues';

function Chip({ status }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ring-1 ${s.ring} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.chip}
    </span>
  );
}

function VenueCard({ v }) {
  const cls =
    'group relative flex flex-col rounded-xl border border-edge bg-slab p-5 transition ' +
    (v.href
      ? 'hover:border-brass/50 hover:bg-slab/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass'
      : 'opacity-80');

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-bone">{v.name}</h3>
          {v.branch && <p className="mt-0.5 font-mono text-xs text-mute">{v.branch}</p>}
        </div>
        <Chip status={v.status} />
      </div>

      <dl className="mt-5 space-y-2 border-t border-edge pt-4 font-mono text-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-mute">오픈</dt>
          <dd className="text-right text-bone">{v.open ? v.open.label : '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mute">구조</dt>
          <dd className="text-right text-bone">{v.stack}</dd>
        </div>
      </dl>

      {v.steps?.length > 0 && (
        <ol className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px] text-mute">
          {v.steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-edge">→</span>}
              <span className={v.status === 'partial' && i === v.steps.length - 1 ? 'text-rust' : 'text-bone/70'}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-sm leading-relaxed text-mute">{v.note}</p>

      {v.href && (
        <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-xs text-brass">
          예약 도구 열기
          <span className="transition group-hover:translate-x-0.5">→</span>
        </span>
      )}
    </>
  );

  if (v.href) {
    return (
      <Link href={v.href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export default function Home() {
  const next = nextUp();
  const grouped = ORDER.map((k) => [k, VENUES.filter((v) => v.status === k)]).filter(
    ([, list]) => list.length > 0
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-[0.28em] text-bone">
            Tongdaeng
          </h1>
          <p className="mt-1.5 text-sm text-mute">방탈출 예약 자동화</p>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wider text-edge">
          KST
        </span>
      </header>

      {next && (
        <section className="relative mt-10 overflow-hidden rounded-2xl border border-edge bg-slab p-7 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brass/10 blur-3xl"
          />
          <div className="relative">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
              다음 오픈까지
            </p>

            <div className="mt-5">
              <Countdown h={next.venue.open.h} m={next.venue.open.m} />
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-6">
              <div>
                <p className="text-base font-semibold text-bone">
                  {next.venue.name}
                  {next.venue.branch && (
                    <span className="ml-2 font-mono text-xs font-normal text-mute">
                      {next.venue.branch}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs text-mute">
                  {next.venue.open.label}
                </p>
              </div>

              {next.venue.href ? (
                <Link
                  href={next.venue.href}
                  className="rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-brass/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
                >
                  예약 도구 열기
                </Link>
              ) : (
                <span className="rounded-lg border border-edge px-5 py-2.5 font-mono text-xs text-mute">
                  도구 없음 · 직접 예약
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {grouped.map(([key, list]) => (
        <section key={key} className="mt-14">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
              {STATUS[key].label}
            </h2>
            <span className="h-px flex-1 bg-edge" />
            <span className="font-mono text-xs text-edge">
              {String(list.length).padStart(2, '0')}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {list.map((v) => (
              <VenueCard key={v.slug} v={v} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-14">
        <div className="flex items-center gap-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
            추가
          </h2>
          <span className="h-px flex-1 bg-edge" />
        </div>
        <div className="mt-5 rounded-xl border border-dashed border-edge p-6">
          <p className="text-sm text-mute">
            새 방탈출을 붙이려면{' '}
            <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-xs text-bone">
              lib/venues.js
            </code>{' '}
            에 항목을 넣으세요. 여기 목록과 카운트다운에 바로 반영됩니다.
          </p>
        </div>
      </section>

      <footer className="mt-16 border-t border-edge pt-6 font-mono text-[11px] text-edge">
        개인용 · 예약 전 슬롯과 인원을 반드시 확인하세요
      </footer>
    </main>
  );
}
