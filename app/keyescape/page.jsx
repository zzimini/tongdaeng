'use client';

import Link from 'next/link';
import { useState } from 'react';
import Countdown from '../_components/Countdown';

const OPEN_TIMES = [
  ['더오름 · 우주라이크 · LOG_IN 1, 2', '10:00'],
  ['메모리컴퍼니', '10:30'],
  ['후즈데어', '11:00'],
  ['STATION', '11:30'],
  ['무비무드', '13:30'],
  ['강남 · 부산 · 전주', '18:00'],
  ['홍대', '20:00'],
];

const KEYS = [
  ['F8', '활성 / 비활성', '평소엔 꺼둡니다. 켜야 우클릭을 가로챕니다'],
  ['F7', '목표 URL · 시각 설정', 'ini 파일에 저장돼 다음 실행에도 남습니다'],
  ['F9', '현재 마우스 위치 추가', '누를 때마다 순서 배열 끝에 쌓입니다'],
  ['F11', '순서 되감기', '다시 1번부터'],
  ['F12', '위치 전부 삭제', ''],
  ['우클릭', '다음 위치 클릭', '활성 상태에서만'],
  ['ESC', '종료', ''],
];

const card = 'rounded-xl border border-edge bg-slab p-5 sm:p-6';

export default function Keyescape() {
  const [copied, setCopied] = useState(false);
  const [hour, setHour] = useState(10);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/keyescape-macro.ahk`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Link href="/" className="font-mono text-xs text-mute transition hover:text-brass">
            ← Tongdaeng
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-bone">키이스케이프</h1>
          <p className="mt-1 font-mono text-xs text-mute">
            AutoHotkey 반자동 매크로 · 서버 요청은 건드리지 않습니다
          </p>
        </div>
        <div className="text-right">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
            {String(hour).padStart(2, '0')}:00 까지
          </p>
          <Countdown h={hour} m={0} compact />
        </div>
      </div>

      <div className="mt-10 space-y-4">
        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            지점별 오픈 시각
          </h2>
          <ul className="space-y-1.5">
            {OPEN_TIMES.map(([branch, time]) => (
              <li key={branch} className="flex items-baseline justify-between gap-4 border-b border-edge/50 pb-1.5">
                <span className="text-sm text-bone">{branch}</span>
                <button
                  onClick={() => setHour(parseInt(time, 10))}
                  className="font-mono text-sm text-brass transition hover:underline"
                >
                  {time}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-[11px] text-edge">
            시각을 누르면 위 카운트다운이 그 시각으로 맞춰집니다
          </p>
        </section>

        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            설치
          </h2>
          <ol className="space-y-3 text-sm text-mute">
            <li>
              <span className="mr-2 font-mono text-brass">1</span>
              <a
                href="https://www.autohotkey.com/"
                target="_blank"
                rel="noreferrer"
                className="text-bone underline decoration-edge underline-offset-2 hover:decoration-brass"
              >
                AutoHotkey v2
              </a>{' '}
              설치
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">2</span>
              <a
                href="/keyescape-macro.ahk"
                download
                className="text-bone underline decoration-edge underline-offset-2 hover:decoration-brass"
              >
                keyescape-macro.ahk 내려받기
              </a>
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">3</span>
              파일을 더블클릭하면 좌상단에 상태창이 뜹니다
            </li>
          </ol>
          <button
            onClick={copyPath}
            className="mt-5 rounded-lg bg-edge px-4 py-2.5 text-sm font-semibold text-bone transition hover:bg-edge/70"
          >
            {copied ? '주소 복사됨' : '스크립트 주소 복사'}
          </button>
        </section>

        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            단축키
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {KEYS.map(([k, what, note]) => (
                <tr key={k} className="align-baseline">
                  <td className="w-20 border-b border-edge/50 py-2 pr-3">
                    <kbd className="rounded border border-edge bg-ink px-2 py-0.5 font-mono text-xs text-brass">
                      {k}
                    </kbd>
                  </td>
                  <td className="border-b border-edge/50 py-2 pr-3 text-bone">{what}</td>
                  <td className="border-b border-edge/50 py-2 text-xs text-mute">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={card}>
          <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-mute">
            오픈 직전 순서
          </h2>
          <ol className="space-y-3 text-sm text-mute">
            <li>
              <span className="mr-2 font-mono text-brass">1</span>
              윈도우 시계를 동기화합니다. 설정 → 시간 및 언어 → 지금 동기화
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">2</span>
              <kbd className="mx-1 rounded border border-edge bg-ink px-1.5 font-mono text-xs">F7</kbd>
              로 목표 URL 과 시각을 넣습니다
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">3</span>
              브라우저에서 예약 페이지를 열고, 누를 자리에 마우스를 올린 뒤
              <kbd className="mx-1 rounded border border-edge bg-ink px-1.5 font-mono text-xs">F9</kbd>
              를 순서대로 누릅니다
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">4</span>
              <kbd className="mx-1 rounded border border-edge bg-ink px-1.5 font-mono text-xs">F11</kbd>
              로 되감고
              <kbd className="mx-1 rounded border border-edge bg-ink px-1.5 font-mono text-xs">F8</kbd>
              로 활성화
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">5</span>
              시각이 되면 자동으로 이동합니다. 그 뒤 우클릭을 하나씩 눌러 진행합니다
            </li>
            <li>
              <span className="mr-2 font-mono text-brass">6</span>
              끝나면
              <kbd className="mx-1 rounded border border-edge bg-ink px-1.5 font-mono text-xs">F8</kbd>
              로 반드시 끄세요. 켜둔 채로는 우클릭 메뉴가 안 뜹니다
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-rust/40 bg-rust/5 p-5 sm:p-6">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-rust">
            알아둘 것
          </h2>
          <ul className="space-y-2.5 text-sm text-mute">
            <li>
              <span className="text-bone">좌표는 화면 절대 위치입니다.</span> 창 크기나 스크롤이
              달라지면 엉뚱한 데를 누릅니다. 오픈 직전에 다시 기록하세요.
            </li>
            <li>
              <span className="text-bone">슬롯 개수에 따라 버튼 위치가 밀립니다.</span> 오픈 전
              화면과 오픈 후 화면의 배치가 같은지 확인이 필요합니다.
            </li>
            <li>
              <span className="text-bone">키이스케이프는 예약 대행과 거래를 금지합니다.</span> 본인
              예약 용도로만 쓰시고, 반복 새로고침처럼 서버에 부담을 주는 방식은 피하세요.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}