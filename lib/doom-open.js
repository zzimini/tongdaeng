/**
 * 둠이스케이프 지점 · 오픈 시각. 화면(클라이언트)도 쓰므로 cheerio 같은 서버 전용 모듈을 넣지 말 것.
 */

import { ruleOpensAt, ruleNextOpening } from './open-rule.js';

/**
 * 규칙은 lib/open-rule.js. 1호점 24:00 오픈은 다음 날 00:00 이라 lead 를 하루 줄여 00:00 으로 적는다.
 * 2026-10-02 에 실제 열린 마지막 날짜로 맞춰 봄: 1·2호점 10/16, DTH 10/8, FEAR 10/6.
 */
export const BRANCHES = [
  { zizum: '1', name: '1호점', open: '00:00', lead: 14, label: '24:00 오픈' },
  { zizum: '2', name: '2호점', open: '23:00', lead: 15, label: '23:00 오픈' },
  { zizum: '3', name: 'DTH점(부평)', open: '23:30', lead: 7, label: '23:30 오픈' },
  { zizum: '4', name: 'FEAR점(수원)', open: '23:45', lead: 5, label: '23:45 오픈' },
];

export const branch = (zizum) => BRANCHES.find((b) => b.zizum === String(zizum));

export { addDays, kstMs, kstToday } from './open-rule.js';

/** date 가 열리는 순간 (epoch ms) */
export const opensAt = (zizum, date) => ruleOpensAt(branch(zizum), date);

/** 지금 기준 다음에 열릴 날짜 */
export const nextOpening = (zizum, now = Date.now()) => ruleNextOpening(branch(zizum), now);
