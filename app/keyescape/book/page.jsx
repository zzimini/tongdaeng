'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '@/lib/keyescape';
import { STEP2, step2Fields, splitPhone, bookmarklet } from '@/lib/keyescape-book';
import { box, lbl, card, btn, h2, Copy, Header, useThemeView, ThemePicker, SlotGrid } from '../_ui';

const ME_KEY = 'tongdaeng_keyescape_me';

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
