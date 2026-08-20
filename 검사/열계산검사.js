// Code.gs의 순수 계산 함수만 떼어 실행 (SpreadsheetApp 불필요)
// 실행: node 검사/열계산검사.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');

// Code.gs가 쓰는 상수를 원본에서 그대로 읽어온다 (검사가 실제 값과 어긋나지 않도록)
const num = k => Number(src.match(new RegExp('const ' + k + ' = (\\d+)'))[1]);
const MAX_GROUPS = num('MAX_GROUPS'), INIT_SESSIONS = num('INIT_SESSIONS');
const ROWS_PER_SESSION = num('ROWS_PER_SESSION'), R_FIRST = num('R_FIRST');

// 순수 계산 함수만 떼어 실행 (SpreadsheetApp 불필요)
eval(src.slice(src.indexOf('function colLock_'), src.indexOf('//  설정 읽기'))
   + src.slice(src.indexOf('function columnLetter_')));

const a = require('assert');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ✅ ' + m); };

// ── 그룹 분배 ──
t('25명 4명씩 → 4,4,4,4,4,5 (1명짜리 그룹 없음)',
  () => a.deepEqual(groupSizes_(25, 4), [4, 4, 4, 4, 4, 5]));
t('28명 4명씩 → 딱 떨어져 4명 × 7',
  () => a.deepEqual(groupSizes_(28, 4), [4, 4, 4, 4, 4, 4, 4]));
t('26명 4명씩 → 4,4,4,4,5,5',
  () => a.deepEqual(groupSizes_(26, 4), [4, 4, 4, 4, 5, 5]));
t('25명 5명씩 → 5명 × 5', () => a.deepEqual(groupSizes_(25, 5), [5, 5, 5, 5, 5]));
t('학생이 그룹 인원보다 적어도 안 죽는다', () => a.deepEqual(groupSizes_(3, 4), [3]));
t('어떤 인원이든 합이 전체 학생수와 같다', () => {
  for (let s = 1; s <= 40; s++) for (let g = 2; g <= 6; g++) {
    a.equal(groupSizes_(s, g).reduce((x, y) => x + y, 0), s, s + '명 ' + g + '씩');
  }
});
t('1명짜리 그룹은 어떤 경우에도 안 생긴다 (학생 4명 이상)', () => {
  for (let s = 4; s <= 40; s++) for (let g = 2; g <= 6; g++) {
    a.ok(Math.min(...groupSizes_(s, g)) >= 2, s + '명 ' + g + '씩');
  }
});
t('학생이 빠짐없이 정확히 한 그룹에 속한다', () => {
  const seen = new Set();
  for (let j = 1; j <= groupCount_(25, 4); j++) {
    const sp = groupSpan_(25, 4, j);
    for (let i = sp.first; i <= sp.last; i++) { a.ok(!seen.has(i), i + '번 중복'); seen.add(i); }
  }
  a.equal(seen.size, 25);
});

// ── 열 위치 ──
t('잠금은 B열(2) 고정 — 회차 바로 옆', () => a.equal(colLock_(), 2));
t('1번 학생은 C열(3)', () => a.equal(colStudent_(1), 3));
t('25번 학생은 27열', () => a.equal(colStudent_(25), 27));
t('그룹1 = 1~4번, 그룹6 = 21~25번', () => {
  a.deepEqual([groupSpan_(25, 4, 1).first, groupSpan_(25, 4, 1).last], [1, 4]);
  a.deepEqual([groupSpan_(25, 4, 6).first, groupSpan_(25, 4, 6).last], [21, 25]);
});
t('그룹평균 열은 학생 열 바로 뒤', () => a.equal(colAvg_(25, 1), 28));
t('요약 블록은 잠금 열을 덮지 않는다', () => {
  // 잠금 열이 고정 영역이라, 그 위에 숫자가 얹히면 스크롤할 때 오해를 부른다
  for (let j = 1; j <= MAX_GROUPS; j++) a.ok(colSummary_(j) > colLock_(), 'G' + j);
});
t('요약 블록 위치가 학생수와 무관하다', () => {
  // 반마다 학생수가 달라도 같은 자리여야 전체 시트가 참조할 수 있다
  a.equal(colSummary_(1), 3);
  a.equal(colSummary_(MAX_GROUPS), 12);
});
t('학생수·그룹수가 어떻든 잠금 열은 안 움직인다', () => {
  // 이게 안 지켜지면 그룹이나 인원을 바꿀 때 체크박스와 점수가 어긋난다
  for (let n = 4; n <= 40; n++) a.equal(colLock_(), 2, n + '명일 때');
});
t('잠금 열이 학생 열보다 앞에 있다 (스크롤 없이 보이려면)', () => {
  a.ok(colLock_() < colStudent_(1));
});
t('열이 겹치지 않는다', () => {
  const used = new Set([1, colLock_()]);
  const k = groupCount_(25, 4);
  for (let i = 1; i <= 25; i++) { const c = colStudent_(i); a.ok(!used.has(c)); used.add(c); }
  for (let j = 1; j <= k; j++) { const c = colAvg_(25, j); a.ok(!used.has(c)); used.add(c); }
  for (let j = k + 1; j <= MAX_GROUPS; j++) { const c = colAvg_(25, j); a.ok(!used.has(c)); used.add(c); }
  a.ok(used.has(colLock_()));
});
t('그룹 수가 요약 블록 폭(10)을 넘지 않는다', () => {
  for (let s = 4; s <= 40; s++) a.ok(groupCount_(s, 4) <= MAX_GROUPS, s + '명');
});
t('1회차는 7행, 20회차는 26행', () => {
  a.equal(sessionRow_(1), 7); a.equal(sessionRow_(20), 26);
});
t('columnLetter_ 경계값', () => {
  a.equal(columnLetter_(1), 'A'); a.equal(columnLetter_(26), 'Z');
  a.equal(columnLetter_(27), 'AA'); a.equal(columnLetter_(38), 'AL');
});

console.log('\n통과 ' + n + ' / 실패 0');
