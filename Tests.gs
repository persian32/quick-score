/**
 * 자체 점검 — Apps Script 편집기에서 runTests()를 실행하고 로그를 보세요.
 *
 * 임시 반(__테스트반)을 만들어 검사하고 끝나면 지웁니다.
 * 실제 반 시트는 건드리지 않습니다.
 */

const T_CLASS = '__테스트반';
const T_PW = '9999';
const T_N = 6;   // 학생 6명
const T_G = 3;   // 3명씩 → 그룹 2개
const T_CFG = { name: T_CLASS, password: T_PW, n: T_N, g: T_G };

function runTests() {
  var pass = 0, fail = 0;
  function check(name, fn) {
    try { fn(); Logger.log('  ✅ ' + name); pass++; }
    catch (e) { Logger.log('  ❌ ' + name + '  →  ' + e.message); fail++; }
  }
  function eq(actual, expected, what) {
    if (String(actual) !== String(expected)) {
      throw new Error(what + ': 기대 ' + expected + ', 실제 ' + actual);
    }
  }
  function throws(fn, what) {
    try { fn(); } catch (e) { return; }
    throw new Error(what + ': 막혔어야 하는데 통과했음');
  }

  const ss = SpreadsheetApp.getActive();
  const logSh = ss.getSheetByName(S_LOG);
  const logBefore = logSh.getLastRow();

  setupTestClass_(ss);
  try {
    Logger.log('── quick-score 자체 점검 ──');

    check('틀린 비밀번호는 거부한다', function () {
      throws(function () { verify_(T_CLASS, '0000'); }, '틀린 비밀번호');
    });

    check('맞는 비밀번호는 통과한다', function () {
      eq(verify_(T_CLASS, T_PW).name, T_CLASS, '반 이름');
    });

    check('결석(빈칸)은 인원수에서 빠진다', function () {
      // 1회차 그룹1: 1번 10점, 2번 결석, 3번 14점  →  (10+14)/2 = 12
      saveGroup(T_CLASS, T_PW, 1, 1, [10, null, 14]);
      SpreadsheetApp.flush();
      const sh = ss.getSheetByName(T_CLASS);
      eq(sh.getRange(sessionRow_(1), colAvg_(T_N, 1)).getValue(), 12, '1회차 그룹1 평균');
    });

    check('인원이 다른 그룹도 각자 인원으로 나눈다', function () {
      // 1회차 그룹2: 4번 9점, 5번 9점, 6번 9점  →  9
      saveGroup(T_CLASS, T_PW, 1, 2, [9, 9, 9]);
      SpreadsheetApp.flush();
      const sh = ss.getSheetByName(T_CLASS);
      eq(sh.getRange(sessionRow_(1), colAvg_(T_N, 2)).getValue(), 9, '1회차 그룹2 평균');
    });

    check('누적은 전 회차 총합 ÷ 전 회차 응시인원', function () {
      // 2회차 그룹1: 8, 12, 10
      // 그룹1 전체 값 = 10, 14, 8, 12, 10  →  54/5 = 10.8
      saveGroup(T_CLASS, T_PW, 2, 1, [8, 12, 10]);
      SpreadsheetApp.flush();
      const sh = ss.getSheetByName(T_CLASS);
      eq(sh.getRange(R_TOTAL, colSummary_(1)).getValue(), 10.8, '그룹1 누적');
    });

    check('첫 저장 때 오늘 날짜가 자동으로 적힌다', function () {
      const sh = ss.getSheetByName(T_CLASS);
      eq(dateText_(sh.getRange(sessionRow_(1), 1).getValue()), today_(), '1번째 시험 날짜');
      eq(dateText_(sh.getRange(sessionRow_(1), 1).getValue()), today_(), '2번째 시험 날짜');
    });

    check('이미 날짜가 있으면 덮어쓰지 않는다', function () {
      const sh = ss.getSheetByName(T_CLASS);
      const cell = sh.getRange(sessionRow_(2), 1);
      cell.setValue(new Date(2026, 0, 15));       // 선생님이 손으로 고친 상황
      SpreadsheetApp.flush();
      saveGroup(T_CLASS, T_PW, 2, 2, [5, 5, 5]);
      SpreadsheetApp.flush();
      eq(dateText_(cell.getValue()), '2026-01-15', '손으로 넣은 날짜');
    });

    check('안 쓴 줄은 회차 목록에 안 나온다', function () {
      const list = listSessions_(T_CFG);
      eq(list.length, 2, '목록에 든 시험 수');   // 1, 2번째 줄만 썼다
      eq(list[0].no, 1, '첫 항목');
    });

    check('새 시험은 아직 안 쓴 첫 줄을 준다', function () {
      eq(startSession(T_CLASS, T_PW).session, 3, '다음 빈 줄');
    });

    check('순위는 누적 평균이 높은 순', function () {
      const r = getRanking(T_CLASS, T_PW);
      eq(r[0].group, 1, '1등 그룹');   // 10.8 > 9
      eq(r[0].rank, 1, '1등 순위값');
    });

    check('잠긴 회차는 저장을 거부한다', function () {
      const sh = ss.getSheetByName(T_CLASS);
      sh.getRange(sessionRow_(1), colLock_()).setValue(true);
      SpreadsheetApp.flush();
      throws(function () { saveGroup(T_CLASS, T_PW, 1, 1, [1, 1, 1]); }, '잠긴 회차');
      sh.getRange(sessionRow_(1), colLock_()).setValue(false);
    });

    check('점수가 바뀌면 로그에 남는다', function () {
      const before = logSh.getLastRow();
      saveGroup(T_CLASS, T_PW, 2, 2, [7, 7, 7]);
      const rows = logSh.getLastRow() - before;
      eq(rows, 3, '새로 쌓인 로그 줄 수');
      const last = logSh.getRange(logSh.getLastRow(), 1, 1, 6).getValues()[0];
      eq(last[1], T_CLASS, '로그의 반');
      eq(last[3], '6번', '로그의 학생');
      eq(last[5], 7, '로그의 새값');
    });

    check('안 바뀐 칸은 로그에 남기지 않는다', function () {
      const before = logSh.getLastRow();
      saveGroup(T_CLASS, T_PW, 2, 2, [7, 7, 7]);   // 같은 값 다시 저장
      eq(logSh.getLastRow() - before, 0, '새로 쌓인 로그 줄 수');
    });

    check('그룹 인원을 바꾸면 평균이 새 구성대로 다시 계산된다', function () {
      // 6명을 3+3 → 2+4 로. 1회차 그룹1은 1,2번(10, 결석) → 10
      setGroupSizes(T_CLASS, T_PW, [2, 4]);
      SpreadsheetApp.flush();
      const sh = ss.getSheetByName(T_CLASS);
      eq(sh.getRange(sessionRow_(1), colAvg_(T_N, 1)).getValue(), 10, '새 그룹1의 1회차 평균');
      setGroupSizes(T_CLASS, T_PW, [3, 3]);   // 되돌리기
      SpreadsheetApp.flush();
      eq(sh.getRange(sessionRow_(1), colAvg_(T_N, 1)).getValue(), 12, '되돌린 뒤 평균');
    });

    check('그룹 인원 합계가 안 맞으면 거부한다', function () {
      throws(function () { setGroupSizes(T_CLASS, T_PW, [2, 2]); }, '합계 4명');
    });

    check('확정된 회차가 있으면 그룹을 못 바꾼다', function () {
      const sh = ss.getSheetByName(T_CLASS);
      sh.getRange(sessionRow_(1), colLock_()).setValue(true);
      SpreadsheetApp.flush();
      throws(function () { setGroupSizes(T_CLASS, T_PW, [2, 4]); }, '잠긴 상태에서 그룹 변경');
      sh.getRange(sessionRow_(1), colLock_()).setValue(false);
      SpreadsheetApp.flush();
    });

    check('회차를 늘려도 기존 점수와 누적이 유지된다', function () {
      const sh = ss.getSheetByName(T_CLASS);
      const before = sh.getRange(R_TOTAL, colSummary_(1)).getValue();
      addSessions(T_CLASS, T_PW, 5);
      SpreadsheetApp.flush();
      eq(sessionCount_(sh, T_CFG), INIT_SESSIONS + 5, '늘어난 회차 수');
      eq(sh.getRange(R_TOTAL, colSummary_(1)).getValue(), before, '누적 평균');
      eq(sh.getRange(sessionRow_(1), colStudent_(1)).getValue(), 10, '1회차 1번 점수');
    });

    check('늘린 회차에도 점수를 저장할 수 있다', function () {
      saveGroup(T_CLASS, T_PW, INIT_SESSIONS + 3, 1, [10, 10, 10]);
      SpreadsheetApp.flush();
      const sh = ss.getSheetByName(T_CLASS);
      eq(sh.getRange(sessionRow_(INIT_SESSIONS + 3), colAvg_(T_N, 1)).getValue(), 10, '새 회차 평균');
    });

    check('없는 회차는 거부한다', function () {
      throws(function () { saveGroup(T_CLASS, T_PW, 999, 1, [1, 1, 1]); }, '999번째 줄');
    });

  } finally {
    cleanupTestClass_(ss, logSh, logBefore);
  }

  Logger.log('── 결과: 통과 ' + pass + ' / 실패 ' + fail + ' ──');
  if (fail) throw new Error('테스트 ' + fail + '개 실패');
  return '통과 ' + pass + ', 실패 0';
}


function setupTestClass_(ss) {
  cleanupTestClass_(ss, null, null);
  ss.getSheetByName(S_CONFIG).appendRow([T_CLASS, T_PW, T_N, T_G]);
  SpreadsheetApp.flush();
  buildClassSheet_(ss, T_CFG);
  SpreadsheetApp.flush();
}

function cleanupTestClass_(ss, logSh, logBefore) {
  const sh = ss.getSheetByName(T_CLASS);
  if (sh) ss.deleteSheet(sh);

  const cfg = ss.getSheetByName(S_CONFIG);
  const names = cfg.getRange(1, 1, cfg.getLastRow(), 1).getValues();
  for (var i = names.length - 1; i >= 1; i--) {
    if (String(names[i][0]).trim() === T_CLASS) cfg.deleteRow(i + 1);
  }

  // 테스트가 남긴 로그 줄 지우기
  if (logSh && logBefore !== null && logSh.getLastRow() > logBefore) {
    logSh.deleteRows(logBefore + 1, logSh.getLastRow() - logBefore);
  }
}
