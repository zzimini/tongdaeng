'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtDate, addDays } from '@/lib/keyescape';
import {
  STEP2, BRANCH_OPEN, step2Fields, splitPhone, bookmarklet, opensOn, kstMs,
} from '@/lib/keyescape-book';
import { box, lbl, card, btn, h2, Copy, Header, useThemeView, ThemePicker, SlotGrid } from '../_ui';

const ME_KEY = 'tongdaeng_keyescape_me';

const POLL_FROM = 1_000; // 오픈 몇 ms 전부터 조회 (서버 시계 기준)
const POLL_EVERY = 300;
const POLL_UNTIL = 90_000; // 오픈 후 이만큼 안 열리면 포기

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = () => {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

function left(ms) {
  if (ms <= 0) return '0초';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h && `${h}시간`, (h || m) && `${m}분`, `${s % 60}초`].filter(Boolean).join(' ');
}

/**
 * 아직 안 열린 날짜를 골라두고, 오픈 순간 그 날짜를 조회해서 원하는 시간이 열려 있으면
 * 바로 reservation2.php 로 이동한다. 슬롯 번호는 날짜마다 달라서 미리 정하지 않고 열린 뒤 받는다.
 */
function OpenWait({ view, zizum }) {
  const doing = view.theme.doing;
  const times = [...new Set(Object.values(view.dates).flat().map((s) => s.time))].sort();

  const [date, setDate] = useState(addDays(view.today, doing)); // 다음에 열릴 날짜
  const [time, setTime] = useState(times[0] || '');
  const [at, setAt] = useState(BRANCH_OPEN[zizum] || '');
  const [armed, setArmed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [state, setState] = useState(null); // { tone, msg }
  const [go, setGo] = useState(null); // 이동할 step2 필드
  const [skew, setSkew] = useState(null); // PC 시계 - 서버 시계 (ms)
  const [manual, setManual] = useState(false); // 수동 오픈 조회 중
  const [log, setLog] = useState([]); // [{ at, tone, msg }] 지나간 메시지도 남겨둔다
  const formRef = useRef(null);

  const openDate = date ? opensOn(date, doing) : '';
  const openMs = openDate && /^\d{2}:\d{2}$/.test(at) ? kstMs(openDate, at) : NaN;
  const ready = date && time && !Number.isNaN(openMs);

  const say = (tone, msg) => {
    setState({ tone, msg });
    setLog((l) => [...l.slice(-199), { at: stamp(), tone, msg }]);
  };

  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    let stop = false;
    const end = (tone, msg) => {
      say(tone, msg);
      setArmed(false);
    };

    // 오픈 판정은 keyescape 서버 시계로 한다. PC 시계가 몇 초 틀리면 정각에 조회해도 아직 안 열려 있으므로
    // 응답의 서버 시각(초 단위)으로 오차를 잰다. 서버 시각 D 는 [요청 보냄, 응답 받음] 사이 어느 순간의
    // 값이고 실제로는 [D, D+1초) 이니, 여러 번 재서 범위를 좁힌 뒤 가운데를 쓴다.
    let lo = -Infinity;
    let hi = Infinity;
    let off = 0; // 서버 - PC
    let target = openMs;
    const clock = () => Date.now() + off;

    const ask = async () => {
      const t0 = Date.now();
      let j = null;
      try {
        j = await (await fetch(`/api/keyescape?zizum=${zizum}&theme=${view.theme.theme}&date=${date}`)).json();
      } catch {
        return null;
      }
      const t1 = Date.now();
      if (j?.serverDate) {
        const a = j.serverDate - t1;
        const b = j.serverDate + 1000 - t0;
        [lo, hi] = Math.max(lo, a) <= Math.min(hi, b) ? [Math.max(lo, a), Math.min(hi, b)] : [a, b];
        off = (lo + hi) / 2;
        setSkew(-off);
      }
      // 서버가 알려준 오픈 시각으로 맞춤
      if (j?.openAt && /^\d{2}:\d{2}$/.test(j.openAt)) {
        target = kstMs(openDate, j.openAt);
        if (j.openAt !== at) setAt(j.openAt);
      }
      return j;
    };

    const calibrate = async (n) => {
      for (let i = 0; i < n && !stop; i++) {
        await ask();
        await sleep(170); // 초 경계를 여러 위상에서 잡도록 어긋나게
      }
    };

    (async () => {
      say('wait', '서버 시계 맞추는 중');
      await calibrate(6);
      say('wait', `서버 시계 맞춤 · PC 가 ${(-off / 1000).toFixed(2)}초 ${off < 0 ? '빠름' : '느림'} · 목표 ${new Date(target).toTimeString().slice(0, 8)} (서버 시계)`);
      let recal = false;
      // 이미 열린 날짜면 target 이 과거라서, 대기 시작 시점부터 센다
      const deadline = Math.max(target, clock()) + POLL_UNTIL;

      let tries = 0;
      let last = '';
      while (!stop) {
        const rest = target - clock();
        if (rest > POLL_FROM) {
          if (!recal && rest < 15_000) {
            recal = true;
            await calibrate(4);
            continue;
          }
          if (last !== '대기') {
            last = '대기';
            say('wait', '오픈 대기 중');
          }
          await sleep(Math.min(rest - POLL_FROM, 250));
          continue;
        }
        if (clock() > deadline) {
          end('bad', `${POLL_UNTIL / 1000}초 동안 조회했지만 ${fmtDate(date)} 이 열리지 않았습니다. 오픈 시각을 확인하세요.`);
          return;
        }

        tries++;
        const j = await ask();
        if (stop) return;

        const r = pickSlot(j);
        if (r?.fields) {
          say('good', `조회 ${tries}회 · 열림! #${r.num} 로 이동합니다`);
          setGo(r.fields);
          setArmed(false);
          return;
        }
        if (r?.bad) {
          end('bad', r.bad);
          return;
        }

        // 같은 응답이 반복되면 기록엔 한 줄만
        const why = j?.msg || '응답 없음';
        if (why !== last) {
          last = why;
          say('wait', `조회 ${tries}회 · ${why}`);
        } else {
          setState({ tone: 'wait', msg: `조회 ${tries}회 · ${why}` });
        }
        await sleep(POLL_EVERY);
      }
    })();

    return () => {
      stop = true;
    };
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (go) formRef.current?.submit();
  }, [go]);

  // 조회 결과 → { fields, num } 이동 가능 / { bad } 포기 / null 아직 안 열림
  function pickSlot(j) {
    if (!j?.slots) return null;
    const s = j.slots.find((x) => x.time === time);
    if (!s) return { bad: `${fmtDate(date)} 에 ${time} 이 없습니다 (${j.slots.map((x) => x.time).join(', ')})` };
    if (!s.open) return { bad: `${fmtDate(date)} ${time} 은 이미 찼습니다` };
    return { fields: step2Fields(view.theme, date, s), num: s.num };
  }

  // 사람이 직접 오픈을 보고 누를 때. 슬롯 번호는 날짜마다 달라서 한 번 조회해서 받는다
  async function openNow() {
    setManual(true);
    say('wait', '수동 오픈 · 조회 중');
    let j = null;
    try {
      j = await (await fetch(`/api/keyescape?zizum=${zizum}&theme=${view.theme.theme}&date=${date}`)).json();
    } catch {
      /* 아래에서 응답 없음 */
    }
    setManual(false);
    const r = pickSlot(j);
    if (r?.fields) {
      say('good', `수동 오픈 · 열림! #${r.num} 로 이동합니다`);
      setGo(r.fields);
      setArmed(false);
    } else {
      say('bad', `수동 오픈 · ${r?.bad || `아직 안 열렸습니다 · ${j?.msg || '응답 없음'}`}`);
    }
  }

  const tone = { wait: 'text-brass', good: 'text-jade', bad: 'text-rust' };

  return (
    <section className={card}>
      <h2 className={h2}>4 · 오픈 대기 · 열리는 순간 바로 이동</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>날짜</label>
          <input
            className={box}
            type="date"
            min={view.today}
            value={date}
            disabled={armed}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>시간</label>
          <select className={box} value={time} disabled={armed} onChange={(e) => setTime(e.target.value)}>
            {times.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>예약 오픈 시각</label>
          <input className={box} type="time" value={at} disabled={armed} onChange={(e) => setAt(e.target.value)} />
        </div>
      </div>

      {ready && (
        <p className="mt-4 text-sm text-mute">
          <span className="text-bone">{fmtDate(date)}</span> 은{' '}
          <span className="text-bone">
            {fmtDate(openDate)} {at}
          </span>{' '}
          에 열립니다 (예약 가능 {doing}일)
          {openMs <= Date.now() && ' · 이미 열린 날짜라 누르면 바로 조회합니다'}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {armed ? (
          <button onClick={() => setArmed(false)} className={`${btn} bg-rust text-ink hover:bg-rust/90`}>
            대기 취소
          </button>
        ) : (
          <button
            onClick={() => {
              setGo(null);
              setState(null);
              setLog([]);
              setArmed(true);
            }}
            disabled={!ready}
            className={`${btn} bg-brass text-ink hover:bg-brass/90`}
          >
            대기 시작
          </button>
        )}
        <button
          onClick={openNow}
          disabled={!ready || manual}
          className={`${btn} bg-jade text-ink hover:bg-jade/90`}
        >
          {manual ? '조회 중…' : '수동 오픈'}
        </button>
        {armed && openMs > now - (skew || 0) && (
          <span className="font-mono text-2xl tabular-nums text-bone">{left(openMs - now + (skew || 0))}</span>
        )}
        {state && <span className={`font-mono text-xs ${tone[state.tone]}`}>{state.msg}</span>}
      </div>
      {skew !== null && Math.abs(skew) >= 300 && (
        <p className="mt-2 font-mono text-xs text-mute">
          이 PC 시계가 서버보다 {(Math.abs(skew) / 1000).toFixed(1)}초 {skew > 0 ? '빠릅니다' : '느립니다'} · 서버
          시계 기준으로 맞춰 셉니다
        </p>
      )}

      {log.length > 0 && (
        <ol className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-edge p-3 font-mono text-[11px] leading-relaxed">
          {log.map((x, i) => (
            <li key={i} className={tone[x.tone]}>
              <span className="mr-2 text-mute">{x.at}</span>
              {x.msg}
            </li>
          ))}
        </ol>
      )}

      {go && (
        <form ref={formRef} method="post" action={STEP2}>
          {Object.entries(go).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      )}

      <p className="mt-5 font-mono text-[11px] leading-relaxed text-edge">
        오픈 {POLL_FROM / 1000}초 전부터 {POLL_EVERY / 1000}초 간격으로 그 날짜만 조회합니다. 열리면 이 탭이 바로
        예약 화면으로 넘어가니 북마클릿 → 캡차 → 예약하기만 누르세요. 대기 중엔 이 탭을 앞에 띄워두세요 (크롬은
        뒤로 간 탭의 타이머를 늦춥니다). 직접 서버 시계를 보다가 열렸다 싶으면 수동 오픈을 누르세요 — 그 날짜를 한 번
        조회해서 같은 예약 화면으로 바로 넘어갑니다. 시각은 PC 시계가 아니라 키이스케이프 서버 시계 기준으로 셉니다.
      </p>
    </section>
  );
}

export default function KeyescapeBook() {
  const tv = useThemeView();
  const { view } = tv;

  const [pick, setPick] = useState(null); // { date, slot }
  const [me, setMe] = useState({ name: '', phone: '', person: '2' });
  const bmRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(ME_KEY) || 'null');
      if (saved) setMe((p) => ({ ...p, ...saved }));
    } catch {
      /* 저장소 막힘 */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ME_KEY, JSON.stringify(me));
    } catch {
      /* 저장소 막힘 */
    }
  }, [me]);

  // 다시 조회하면 고른 슬롯은 풀어둔다 (그 사이 닫혔을 수 있음)
  useEffect(() => setPick(null), [view]);

  const phoneOk = !!splitPhone(me.phone);
  const meReady = me.name.trim() !== '' && phoneOk;
  const bm = meReady ? bookmarklet({ name: me.name.trim(), phone: me.phone, person: me.person }) : '';

  // React 는 javascript: href 를 막아서 직접 넣는다
  useEffect(() => {
    if (bmRef.current) bmRef.current.setAttribute('href', bm || '#');
  }, [bm]);

  const setMeField = (k) => (e) => setMe((p) => ({ ...p, [k]: e.target.value }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <Header
        sub="예약 도우미 · 입력은 북마클릿이 채우고, 캡차와 예약하기만 직접 누릅니다"
        other={{ href: '/keyescape', label: '취소표 알림봇' }}
      />

      <div className="mt-10 space-y-4">
        {/* ── 북마클릿 ── */}
        <section className={card}>
          <h2 className={h2}>1 · 북마클릿 만들기 (처음 한 번)</h2>

          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto]">
            <div>
              <label className={lbl}>예약자</label>
              <input className={box} value={me.name} onChange={setMeField('name')} placeholder="이름" />
            </div>
            <div>
              <label className={lbl}>연락처 (010 뒤 8자리)</label>
              <input
                className={box}
                value={me.phone}
                onChange={setMeField('phone')}
                placeholder="1234-5678"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className={lbl}>인원</label>
              <select className={box} value={me.person} onChange={setMeField('person')}>
                {['2', '3', '4', '5', '6'].map((n) => (
                  <option key={n} value={n}>
                    {n}명
                  </option>
                ))}
              </select>
            </div>
          </div>
          {me.phone && !phoneOk && <p className="mt-2 font-mono text-xs text-rust">010 뒤 8자리를 넣으세요</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              ref={bmRef}
              onClick={(e) => e.preventDefault()}
              draggable={meReady}
              className={`${btn} ${meReady ? 'cursor-grab bg-brass text-ink' : 'pointer-events-none bg-edge text-mute'}`}
            >
              키이스케이프 채우기
            </a>
            {meReady && <Copy text={bm} label="주소 복사" />}
          </div>
          <p className="mt-3 text-xs text-mute">
            {meReady
              ? '노란 버튼을 북마크바로 끌어다 놓으세요. 안 되면 주소를 복사해 새 북마크의 URL 칸에 붙여넣으세요. 이름·연락처·인원을 바꾸면 다시 만들어야 합니다.'
              : '이름과 연락처를 넣으면 만들어집니다. 이 브라우저에만 저장됩니다.'}
          </p>
        </section>

        <ThemePicker tv={tv} title="2 · 테마 고르기" />

        <SlotGrid
          tv={tv}
          slot={{
            picked: (d, s) => pick?.date === d && pick?.slot.num === s.num,
            onClick: (d, s) => setPick({ date: d, slot: s }),
          }}
          hint="초록색(열린) 시간을 누르세요"
        />

        {/* ── 예약 화면 ── */}
        <section className={card}>
          <h2 className={h2}>3 · 예약 화면 열기</h2>
          {pick && view ? (
            <form method="post" action={STEP2} className="flex flex-wrap items-center gap-3">
              {Object.entries(step2Fields(view.theme, pick.date, pick.slot)).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <span className="font-mono text-sm text-bone">
                {view.theme.name} · {fmtDate(pick.date)} {pick.slot.time}
              </span>
              <button type="submit" className={`${btn} bg-jade text-ink hover:bg-jade/90`}>
                예약 화면으로 이동
              </button>
            </form>
          ) : (
            <p className="text-sm text-mute">위 현황에서 시간을 고르면 여기에 버튼이 생깁니다.</p>
          )}

          <ol className="mt-5 space-y-2 border-t border-edge pt-5 text-sm text-mute">
            <li>
              <span className="mr-2 font-mono text-brass">1</span>
              이동한 화면에서 북마크바의 <span className="text-bone">키이스케이프 채우기</span> 클릭
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">2</span>
              인원 · 이름 · 연락처 · 무통장 · 동의 3개가 채워지고 캡차로 스크롤됩니다
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">3</span>
              <span className="text-bone">로봇이 아닙니다 체크 → 예약하기</span>
            </li>
          </ol>
        </section>

        {view && <OpenWait key={view.theme.info} view={view} zizum={tv.zizum} />}

        <section className="rounded-xl border border-rust/40 bg-rust/5 p-5 sm:p-6">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-rust">알아둘 것</h2>
          <ul className="space-y-2.5 text-sm text-mute">
            <li>
              <span className="text-bone">캡차는 자동으로 풀지 않습니다.</span> 예약 제출에 reCAPTCHA 가
              걸려 있어 그 단계는 사람이 눌러야 합니다.
            </li>
            <li>
              <span className="text-bone">&quot;개발자 도구 사용이 금지&quot; 화면이 뜨면</span> 이 탭에서
              F12 개발자도구를 닫고 다시 시도하세요. 사이트가 브라우저 안에서 추측으로 판단하는 것이라
              개발자도구 · 콘솔을 건드리는 확장 프로그램이 켜져 있으면 잘못 잡힐 수 있습니다.
            </li>
            <li>
              <span className="text-bone">요금은 사이트가 계산합니다.</span> 인원이 바뀌면 화면의 예약금도
              서버 값으로 다시 바뀝니다. 제출 전에 한 번 확인하세요.
            </li>
            <li>
              <span className="text-bone">동의 3개에는 마케팅 수신동의(선택)도 들어갑니다.</span> 원치 않으면
              채운 뒤 직접 해제하세요.
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
