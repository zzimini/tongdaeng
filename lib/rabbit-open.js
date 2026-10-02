/**
 * 토끼굴 지점 · 오픈 시각. 화면(클라이언트)도 쓰므로 서버 전용 모듈을 넣지 말 것.
 * 2026-10-02 기준 10/8 까지 열려 있고 10/9 는 그날 23:00 오픈 → 23:00 에 오늘 + 7일.
 */

import { ruleOpensAt, ruleNextOpening } from './open-rule.js';

export const BRANCHES = [{ branch: '1', name: '홍대점', open: '23:00', lead: 7, label: '23:00 오픈' }];

export const branchOf = (b) => BRANCHES.find((x) => x.branch === String(b));

export { addDays, kstMs, kstToday } from './open-rule.js';

export const opensAt = (b, date) => ruleOpensAt(branchOf(b), date);
export const nextOpening = (b, now = Date.now()) => ruleNextOpening(branchOf(b), now);
