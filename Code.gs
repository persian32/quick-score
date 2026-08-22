/**
 * quick-score — 서버 (Google Apps Script)
 * 그룹별 단어시험 채점
 *
 * 역할: 스프레드시트가 창고, 이 파일이 문 앞의 관리인.
 * 도우미 폰(Index.html)은 창고에 직접 못 들어오고, 반드시 여기를 거친다.
 *
 * 합계·평균·순위는 여기서 계산하지 않는다. 시트에 박아둔 AVERAGE 수식이 한다.
 */

// ── 시트 이름 ──
const S_CONFIG = '설정';
const S_LOG = '로그';
const S_ALL = '전체';

// ── 레이아웃 상수 ──
const MAX_GROUPS = 10;    // 요약 블록의 고정 폭. 반마다 학생수가 달라도 위치가 같아야 '전체' 시트가 참조 가능
const MAX_STUDENTS = 40;  // 학생 자리도 고정 폭. 안 쓰는 열은 숨긴다.
                          // 학생수를 바꿔도 열이 안 움직이므로 점수를 지키면서 갱신할 수 있다
const INIT_SESSIONS = 20; // 시트를 처음 만들 때의 회차 수. 앱에서 얼마든지 늘릴 수 있다
const ROWS_PER_SESSION = 1;

const R_TITLE = 1;   // 1행: 제목
const R_GHDR  = 2;   // 2행: G1 G2 ... (요약 머리글)
const R_TOTAL = 3;   // 3행: 누적 평균  ← '전체' 시트가 참조하는 줄
const R_RANK  = 4;   // 4행: 순위
const R_HDR   = 6;   // 6행: 원본 표 머리글
const R_FIRST = 7;   // 7행: 1회차


// ══════════════════════════════════════════
//  열 위치 계산 (A=1, B=2 ...)
// ══════════════════════════════════════════

/**
 * 잠금 열. A(회차) 바로 옆 B열에 고정.
 *
 * 선생님이 시트에서 매주 하는 유일한 작업이 회차 잠그기인데,
 * 맨 오른쪽에 두면 학생 25명 + 그룹 10칸을 지나 37칸을 스크롤해야 한다.
 * A:B를 고정해두면 어디를 보고 있든 항상 왼쪽에 붙어 있다.
 */
function colLock_() { return 2; }

/** 학생 i번의 열. 회차·잠금 다음이므로 1번 → C(3) */
function colStudent_(i) { return 2 + i; }

/**
 * 요약 블록(누적·순위)의 그룹 j 열. 학생 1번 열과 같은 자리에서 시작한다.
 * 잠금 열(B) 위에 숫자가 얹히면 고정 영역에 엉뚱한 값이 보이기 때문.
 * 반마다 학생수가 달라도 위치가 같아야 '전체' 시트가 참조할 수 있다.
 */
function colSummary_(j) { return colStudent_(1) + j - 1; }

/**
 * 회차별 그룹평균 열. 학생 자리(40칸) 뒤에 고정.
 *
 * 예전에는 실제 학생수 뒤에 붙였는데, 그러면 학생수를 바꿀 때 위치가 밀려
 * 시트와 설정이 어긋나고 그 반이 통째로 안 열렸다. 고치려면 시트를 지워야 했고
 * 그때 점수가 함께 사라졌다. 고정 폭으로 두면 그런 일이 없다.
 */
function colAvg_(j) { return 2 + MAX_STUDENTS + j; }

/**
 * 학생 n명을 g명씩 나눈 결과의 그룹별 인원.
 *
 * 딱 안 떨어지면 나머지를 뒤쪽 그룹에 한 명씩 얹는다.
 * 25명을 4명씩 → [4,4,4,4,4,5]. 1명짜리 그룹이 생기면
 * 그 학생 점수가 곧 그룹 평균이 되어 순위가 불공평해지기 때문.
 */
function groupSizes_(n, g) {
  // 설정 시트에 "4,4,4,5,4,4" 처럼 적었으면 그대로 쓴다
  if (Array.isArray(g)) {
    const total = g.reduce(function (a, b) { return a + b; }, 0);
    if (total !== n) {
      throw new Error('설정 시트를 확인하세요: 그룹 인원 합계 ' + total + '명이 학생수 ' + n + '명과 다릅니다.');
    }
    return g;
  }
  if (!n || n < 1) throw new Error('학생수가 비어 있습니다. 설정 시트를 확인하세요.');
  const k = Math.max(1, Math.floor(n / g));   // 목표 인원을 채우는 그룹 수
  const base = Math.floor(n / k);
  const rem = n % k;
  const sizes = [];
  for (var j = 0; j < k; j++) sizes.push(base + (j >= k - rem ? 1 : 0));
  return sizes;
}

/** 그룹 개수 */
function groupCount_(n, g) { return groupSizes_(n, g).length; }

/** 그룹 j가 차지하는 학생 번호 범위와 열 범위 */
function groupSpan_(n, g, j) {
  const sizes = groupSizes_(n, g);
  var first = 1;
  for (var i = 0; i < j - 1; i++) first += sizes[i];
  const last = first + sizes[j - 1] - 1;
  return { first: first, last: last, from: colStudent_(first), to: colStudent_(last) };
}

/** 오늘 날짜 (시트 시간대 기준, yyyy-MM-dd) */
function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** 시트에서 읽은 값을 yyyy-MM-dd 문자열로. 빈칸이면 '' */
function dateText_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}

/**
 * 이 시트에 회차 행이 몇 개 있는지.
 *
 * A열은 이제 날짜이고 안 쓴 회차는 비어 있으므로 라벨로는 셀 수 없다.
 * 대신 그룹평균 수식이 회차 행에만 심겨 있다는 점을 이용한다.
 */
function sessionCount_(sh, c) {
  const rows = sh.getMaxRows() - R_FIRST + 1;
  const f = sh.getRange(R_FIRST, colAvg_(1), rows, 1).getFormulas();
  var n = f.length;
  for (var i = 0; i < f.length; i++) {
    if (!f[i][0]) { n = i; break; }
  }
  if (n < 1) {
    throw new Error(
      (c ? c.name : '이 반') + ' 시트에 회차 줄이 없습니다. 선생님께 말씀드리세요 — ' +
      '스프레드시트 메뉴의 quick-score → 설치 / 갱신 을 눌러야 합니다.');
  }
  return n;
}

/** 이 시트가 quick-score 가 만든 반 시트인지 (머리글로 판별) */
function looksLikeClassSheet_(sh) {
  if (sh.getLastRow() < R_HDR) return false;
  const h = sh.getRange(R_HDR, 1, 1, 2).getValues()[0];
  return String(h[0]).trim() === '날짜' && String(h[1]).trim() === '잠금';
}

/** 회차 번호 → 행 번호 */
function sessionRow_(session) { return R_FIRST + (session - 1) * ROWS_PER_SESSION; }


// ══════════════════════════════════════════
//  설정 읽기 / 인증
// ══════════════════════════════════════════

/** 설정 시트를 읽어 반 목록으로 돌려준다 */
function getConfig_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(S_CONFIG);
  if (!sh) throw new Error('설정 시트가 없습니다. 메뉴에서 quick-score → 설치 / 갱신 을 눌러주세요.');
  if (sh.getLastRow() < 1) return [];   // 통째로 비워진 경우
  const rows = sh.getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const raw = String(r[3]).trim();
      return {
        name: String(r[0]).trim(),
        password: String(r[1]).trim(),
        n: Number(r[2]),
        // 숫자 하나면 자동 분배, 쉼표 목록이면 그룹별 인원을 그대로
        g: raw.indexOf(',') >= 0
             ? raw.split(',').map(function (x) { return Number(x.trim()); })
             : Number(raw)
      };
    });
}

/**
 * 반 시트를 가져온다. 없으면 무엇을 해야 하는지 알려준다.
 *
 * 선생님이 시트를 지우거나 아직 안 만든 상태에서 도우미가 들어오면
 * 예전에는 "null 의 속성을 읽을 수 없습니다" 같은 말로 죽었다.
 */
function classSheet_(c) {
  const sh = SpreadsheetApp.getActive().getSheetByName(c.name);
  if (!sh) {
    throw new Error(c.name + ' 시트가 아직 없습니다. 선생님께 말씀드리세요 — ' +
                    '스프레드시트 메뉴의 quick-score → 설치 / 갱신 을 눌러야 합니다.');
  }
  return sh;
}

/** 로그 시트. 지워졌으면 다시 만든다 — 기록 때문에 저장이 막히면 안 된다 */
function logSheet_() {
  const ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(S_LOG);
  if (!sh) { ensureLogSheet_(ss); sh = ss.getSheetByName(S_LOG); }
  return sh;
}

/**
 * 비밀번호 확인. 틀리면 여기서 끝.
 * 세션·토큰을 따로 두지 않고 호출마다 다시 확인한다 —
 * 만료 버그가 생길 여지가 없고 코드가 세 줄이면 끝나기 때문.
 */
function verify_(className, password) {
  const c = getConfig_().filter(function (x) { return x.name === className; })[0];
  if (!c || c.password === '' || c.password !== String(password).trim()) {
    throw new Error('비밀번호가 맞지 않습니다.');
  }
  if (!c.n || c.n < 1) {
    throw new Error('설정 시트에 ' + c.name + '의 학생수가 비어 있습니다. 선생님께 말씀드리세요.');
  }
  if (c.n > MAX_STUDENTS) {
    throw new Error(c.name + '의 학생수가 ' + c.n + '명입니다. 최대 ' + MAX_STUDENTS + '명까지 가능합니다.');
  }
  return c;
}


// ══════════════════════════════════════════
//  웹앱 진입점
// ══════════════════════════════════════════

/**
 * 웹앱 진입점.
 *
 * 주의: Apps Script 는 Index.html 안에 쓴 <meta> 를 전부 무시한다.
 * 여기 addMetaTag 로 넣은 것만 실제 페이지에 붙는다.
 * 게다가 허용되는 이름이 viewport / apple-mobile-web-app-capable /
 * mobile-web-app-capable / google-site-verification 넷뿐이라
 * 홈 화면 아이콘(<link rel="apple-touch-icon">)은 여기에 달 수 없다.
 * 그래서 아이콘은 껍데기 페이지(docs/app.html)가 대신 달아준다.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('quick-score')
    // maximum-scale 을 걸면 손으로 확대하는 것을 막게 된다. 접근성상 걸면 안 된다
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 로그인 화면의 반 드롭다운 채우기 (비밀번호 없이 반 이름만) */
function getClassNames() {
  return getConfig_().map(function (c) { return c.name; });
}

/** 로그인. 성공하면 그 반을 그리는 데 필요한 정보 전부를 돌려준다 */
function login(className, password) {
  const c = verify_(className, password);
  const k = groupCount_(c.n, c.g);

  const groups = [];
  for (var j = 1; j <= k; j++) {
    const s = groupSpan_(c.n, c.g, j);
    const numbers = [];
    for (var i = s.first; i <= s.last; i++) numbers.push(i);
    groups.push({ index: j, label: 'Group ' + j, range: s.first + '~' + s.last + '번', numbers: numbers });
  }

  const sessions = listSessions_(c);
  return {
    className: c.name,
    studentCount: c.n,
    groups: groups,
    sizes: groupSizes_(c.n, c.g),
    // 확정된 회차가 하나라도 있으면 그룹 구성을 못 바꾼다
    canEditGroups: !sessions.some(function (x) { return x.locked; }),
    hasData: sessions.some(function (x) { return x.filled > 0; }),
    sessions: sessions
  };
  // 순위는 일부러 보내지 않는다.
  // 그룹이 4~5명이라 회차마다 순위가 결석 한 명으로 뒤집힌다.
  // 최종 순위는 선생님이 시트에서 보고 발표 시점을 정한다.
}


/**
 * 그룹별 인원을 바꾼다. 도우미도 앱에서 직접 할 수 있다.
 *
 * 주의: 그룹 구성은 지난 회차에도 소급 적용된다.
 * 점수는 학생 번호별로 저장되고 그룹 평균은 번호 범위로 계산하기 때문.
 * 그래서 확정(잠금)된 회차가 있으면 아예 막는다.
 */
function setGroupSizes(className, password, sizes) {
  const c = verify_(className, password);
  const ss = SpreadsheetApp.getActive();
  const sh = classSheet_(c);

  const total = sizes.reduce(function (a, b) { return a + b; }, 0);
  if (total !== c.n) throw new Error('그룹 인원 합계 ' + total + '명이 학생수 ' + c.n + '명과 다릅니다.');
  if (sizes.length > MAX_GROUPS) throw new Error('그룹은 최대 ' + MAX_GROUPS + '개까지입니다.');
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i] < 1) throw new Error('그룹 인원은 1명 이상이어야 합니다.');
  }

  const locks = sh.getRange(R_FIRST, colLock_(), sessionCount_(sh, c), 1).getValues();
  if (locks.some(function (r) { return r[0] === true; })) {
    throw new Error('선생님이 확정한 회차가 있어 그룹을 바꿀 수 없습니다.');
  }

  const before = Array.isArray(c.g) ? c.g.join(',') : String(c.g);
  const after = sizes.join(',');
  if (before === after) return login(className, password);

  writeConfigGroups_(c.name, after);
  const updated = getConfig_().filter(function (x) { return x.name === c.name; })[0];
  refreshGroupFormulas_(sh, updated, sessionCount_(sh, c));
  logRow_([new Date(), c.name, '-', '그룹구성', before, after]);

  return login(className, password);
}

/**
 * 새 시험을 시작한다 — 아직 안 쓴 첫 줄의 번호를 돌려준다.
 * 줄이 다 찼으면 알아서 더 만든다. 도우미가 '회차 늘리기'를 신경 쓸 일이 없다.
 */
function startSession(className, password) {
  const c = verify_(className, password);
  const sh = classSheet_(c);
  const sc = sessionCount_(sh, c);

  const dates = sh.getRange(R_FIRST, 1, sc, 1).getValues();
  const scores = sh.getRange(R_FIRST, colStudent_(1), sc, c.n).getValues();
  for (var i = 0; i < sc; i++) {
    const used = dateText_(dates[i][0]) !== '' ||
                 scores[i].some(function (v) { return v !== '' && v !== null; });
    if (!used) return { session: i + 1 };
  }

  addSessions(className, password, 10);
  return { session: sc + 1 };
}

/**
 * 회차 줄을 뒤에 더 만든다.
 * 빈 줄을 붙이는 것뿐이라 기존 점수에는 영향이 없다.
 */
function addSessions(className, password, add) {
  const c = verify_(className, password);
  const sh = classSheet_(c);
  const cur = sessionCount_(sh, c);
  add = Math.max(1, Math.min(50, Number(add) || 10));

  const need = R_FIRST + cur + add - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());

  sh.getRange(R_FIRST + cur, 1, add, 1)
    .setNumberFormat('yyyy-mm-dd').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(R_FIRST + cur, colAvg_(1), add, MAX_GROUPS).setBackground('#fff2cc');
  sh.getRange(R_FIRST + cur, colLock_(), add, 1).insertCheckboxes();
  sh.getRange(R_FIRST + cur, colStudent_(1), add, MAX_STUDENTS).setHorizontalAlignment('center');

  refreshGroupFormulas_(sh, c, cur + add);   // 누적 범위를 새 회차까지 넓힌다
  logRow_([new Date(), c.name, '-', '회차추가', cur + '줄', (cur + add) + '줄']);
  return login(className, password);
}

/** 설정 시트의 그룹당인원 칸을 고쳐 쓴다 */
function writeConfigGroups_(className, text) {
  const sh = SpreadsheetApp.getActive().getSheetByName(S_CONFIG);
  const names = sh.getLastRow() < 1 ? [] : sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 1; i < names.length; i++) {
    if (String(names[i][0]).trim() === className) {
      sh.getRange(i + 1, 4).setValue(text);
      SpreadsheetApp.flush();
      return;
    }
  }
  throw new Error('설정 시트에서 ' + className + '을 찾지 못했습니다.');
}

/** 로그 한 줄 */
function logRow_(row) {
  const sh = logSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

/** 각 회차의 상태(입력 있음 / 잠김) */
function listSessions_(c) {
  const sh = classSheet_(c);
  const sc = sessionCount_(sh, c);
  const dates = sh.getRange(R_FIRST, 1, sc, 1).getValues();
  const values = sh.getRange(R_FIRST, colStudent_(1), sc, c.n).getValues();
  const locks = sh.getRange(R_FIRST, colLock_(), sc, 1).getValues();

  const out = [];
  values.forEach(function (row, idx) {
    const filled = row.filter(function (v) { return v !== '' && v !== null; }).length;
    const date = dateText_(dates[idx][0]);
    // 아직 안 쓴 줄은 목록에 넣지 않는다. 똑같이 생긴 빈 줄이 수십 개 보이면 못 고른다
    if (!date && !filled) return;
    out.push({ no: idx + 1, date: date, filled: filled, locked: locks[idx][0] === true });
  });
  return out;
}

/** 특정 회차에 이미 들어있는 점수 (이어서 입력할 때 씀) */
function getSession(className, password, session) {
  const c = verify_(className, password);
  const sh = classSheet_(c);
  const k = groupCount_(c.n, c.g);
  const row = sessionRow_(session);

  const scores = sh.getRange(row, colStudent_(1), 1, c.n).getValues()[0];
  return {
    session: session,
    date: dateText_(sh.getRange(row, 1).getValue()),   // 아직 안 쓴 줄이면 ''
    locked: sh.getRange(row, colLock_()).getValue() === true,
    scores: scores.map(function (v) { return (v === '' || v === null) ? null : Number(v); })
  };
}


// ══════════════════════════════════════════
//  저장 (핵심)
// ══════════════════════════════════════════

/**
 * 한 그룹의 점수를 저장한다.
 * scores: 그룹원 순서대로. 결석은 null.
 */
function saveGroup(className, password, session, groupIndex, scores) {
  const c = verify_(className, password);
  const sh = classSheet_(c);
  const k = groupCount_(c.n, c.g);
  const row = sessionRow_(session);

  if (session < 1 || session > sessionCount_(sh, c)) throw new Error('없는 회차입니다.');
  if (sh.getRange(row, colLock_()).getValue() === true) {
    throw new Error('선생님이 확정한 시험이라 수정할 수 없습니다.');
  }

  // 이 회차에 처음 점수가 들어오는 순간 오늘 날짜를 적는다.
  // 도우미가 누를 것이 하나도 없고, 시험 당일 입력하니 날짜도 맞다
  const dateCell = sh.getRange(row, 1);
  var dateStr = dateText_(dateCell.getValue());
  if (!dateStr) {
    const n = new Date();
    dateCell.setValue(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
    dateStr = today_();
  }

  const s = groupSpan_(c.n, c.g, groupIndex);
  const width = s.to - s.from + 1;
  if (scores.length !== width) throw new Error('점수 개수가 그룹 인원과 다릅니다.');

  const rng = sh.getRange(row, s.from, 1, width);
  const before = rng.getValues()[0];
  const after = scores.map(function (v) {
    return (v === null || v === '' || isNaN(Number(v))) ? '' : Number(v);
  });

  rng.setValues([after]);
  logChanges_(c.name, dateStr, s.first, before, after);

  return { ok: true, date: dateStr };
}

/** 바뀐 칸만 로그 시트에 한 줄씩 남긴다 */
function logChanges_(className, sessionLabel, firstStudentNo, before, after) {
  const sh = logSheet_();
  const now = new Date();
  const rows = [];

  after.forEach(function (v, i) {
    if (String(before[i]) === String(v)) return;   // 안 바뀐 칸은 기록하지 않는다
    rows.push([
      now,
      className,
      sessionLabel,
      (firstStudentNo + i) + '번',
      before[i] === '' ? '(없음)' : before[i],
      v === '' ? '(결석)' : v
    ]);
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  }
}


// ══════════════════════════════════════════
//  순위 읽기 (계산은 시트 수식이 이미 해둠)
//
//  앱 화면에서는 쓰지 않는다 — 도우미에게 순위를 보여주지 않기로 했다.
//  선생님이 편집기에서 값을 확인하고 싶을 때를 위해 남겨둔다.
// ══════════════════════════════════════════

function getRanking(className, password) {
  const c = verify_(className, password);
  const sh = classSheet_(c);
  const k = groupCount_(c.n, c.g);

  const totals = sh.getRange(R_TOTAL, colSummary_(1), 1, k).getValues()[0];

  const list = totals
    .map(function (v, i) { return { group: i + 1, avg: (v === '' || v === null) ? null : Number(v) }; })
    .filter(function (x) { return x.avg !== null; });

  list.sort(function (a, b) { return b.avg - a.avg; });
  list.forEach(function (x, i) { x.rank = i + 1; });
  return list;
}


// ══════════════════════════════════════════
//  스프레드시트 메뉴
//
//  쓰실 분이 setup 때문에 Apps Script 를 열지 않아도 되게 한다.
//  스프레드시트를 열 때 자동으로 붙는다.
// ══════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('quick-score')
    .addItem('설치 / 갱신', 'menuSetup')
    .addItem('자체 점검', 'menuTests')
    .addToUi();
}

function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('quick-score', setup(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('quick-score — 문제가 있습니다', e.message, ui.ButtonSet.OK);
  }
}

function menuTests() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('quick-score 자체 점검', runTests() + '\n\n자세한 내용은 Apps Script 실행 로그에 있습니다.',
             ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('quick-score 자체 점검 — 실패', e.message + '\n\nApps Script 실행 로그를 확인하세요.',
             ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════
//  최초 설치 — 시트와 수식을 통째로 만들어준다
// ══════════════════════════════════════════

/**
 * 선생님이 딱 한 번 실행하는 함수.
 * 설정 시트의 반 목록을 읽어 반별 시트를 만들고 수식을 심는다.
 * 이미 있는 반 시트는 건드리지 않는다(점수가 날아가지 않도록).
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureConfigSheet_(ss);
  ensureLogSheet_(ss);

  const config = getConfig_();
  const made = [], skipped = [], updated = [], strange = [];
  const ready = [];

  config.forEach(function (c) {
    // 학생수를 아직 안 채운 반은 시트를 만들 수 없다
    if (!c.n || c.n < 1) { skipped.push(c.name); return; }
    if (c.n > MAX_STUDENTS) { strange.push(c.name + '(학생수 ' + c.n + '명, 최대 ' + MAX_STUDENTS + ')'); return; }
    ready.push(c);

    const existing = ss.getSheetByName(c.name);
    if (!existing) {
      buildClassSheet_(ss, c);
      made.push(c.name);
      return;
    }

    if (!looksLikeClassSheet_(existing)) {
      // 손으로 만든 빈 시트가 같은 이름을 차지한 경우엔 제대로 다시 세운다.
      // 내용이 들어 있으면 손대지 않고 알리기만 한다
      if (existing.getLastRow() <= 1) {
        ss.deleteSheet(existing);
        buildClassSheet_(ss, c);
        made.push(c.name);
      } else {
        strange.push(c.name + '(quick-score 시트가 아님)');
      }
      return;
    }

    // 학생수가 바뀌었어도 열이 안 움직이므로, 수식과 열 표시만 새 설정에 맞춘다.
    // 점수 칸은 건드리지 않는다
    refreshGroupFormulas_(existing, c);
    updated.push(c.name);
  });

  buildAllSheet_(ss, ready);

  var msg = made.length
    ? '새로 만든 반 시트: ' + made.join(', ')
    : '새로 만든 반 시트 없음';
  if (updated.length) msg += '\n설정에 맞춰 갱신: ' + updated.join(', ') + ' (점수는 그대로)';
  if (skipped.length) {
    msg += '\n설정 시트에 학생수를 채우고 다시 실행하세요 — 건너뛴 반: ' + skipped.join(', ');
  }
  if (strange.length) {
    msg += '\n⚠️ 손댈 수 없는 반: ' + strange.join(', ');
  }
  Logger.log('setup 완료. ' + msg);
  return msg;
}

function ensureConfigSheet_(ss) {
  var sh = ss.getSheetByName(S_CONFIG);
  // 시트가 남아 있어도 머리글까지 지워졌으면 다시 세운다.
  // 통째로 비면 getLastRow()가 0이라 어디서든 범위를 못 만들고 죽는다
  if (sh && sh.getLastRow() >= 1) return;
  if (!sh) sh = ss.insertSheet(S_CONFIG, 0);
  sh.getRange(1, 1, 1, 4).setValues([['반이름', '비밀번호', '학생수', '그룹당인원']])
    .setFontWeight('bold').setBackground('#e8eaed');
  // 반 이름과 그룹당인원 기본값만 채운다.
  // 비밀번호와 학생수는 반마다 다르므로 일부러 비워둔다 —
  // 숫자가 들어차 있으면 확인 없이 그냥 넘어가서 엉뚱한 인원으로 돌아간다
  const rows = [];
  for (var i = 1; i <= 11; i++) rows.push([i + '반', '', '', 4]);
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(2, 2, rows.length, 2).setBackground('#fce8e6');
  sh.getRange(1, 2).setNote('반마다 다른 비밀번호를 정해 적으세요. 비어 있으면 그 반은 로그인할 수 없습니다.');
  sh.getRange(1, 3).setNote('그 반의 마지막 번호를 적으세요. 결석은 신경 쓰지 않아도 됩니다 — 앱이 알아서 뺍니다.\n비어 있으면 그 반은 로그인할 수 없습니다.');
  sh.getRange(1, 4).setNote(
    '숫자 하나(예: 4) → 4명씩 자동으로 나누고 남는 학생은 뒤쪽 그룹에 한 명씩 얹습니다.\n' +
    '25명을 4로 두면 4,4,4,4,4,5 (6그룹)이 됩니다.\n\n' +
    '그룹마다 인원을 직접 정하려면 쉼표로 적으세요. 예: 3,4,4,5,4,5\n' +
    '이때 합계가 학생수와 같아야 합니다.');
}

function ensureLogSheet_(ss) {
  var sh = ss.getSheetByName(S_LOG);
  if (sh && sh.getLastRow() >= 1) return;
  if (!sh) sh = ss.insertSheet(S_LOG);
  sh.getRange(1, 1, 1, 6).setValues([['시각', '반', '시험날짜', '학생', '이전값', '새값']])
    .setFontWeight('bold').setBackground('#e8eaed');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 150);
}

/**
 * 그룹 관련 수식·머리글을 현재 설정대로 다시 심는다.
 * 학생 점수 칸은 건드리지 않으므로 그룹 구성만 바뀌고 데이터는 그대로 남는다.
 */
function refreshGroupFormulas_(sh, c, sessions) {
  const k = groupCount_(c.n, c.g);
  // 회차 수는 이 수식들의 존재로 세므로, 새로 심는 중일 때는 인자로 받아야 한다
  const sc = sessions || sessionCount_(sh, c);
  const firstSummary = columnLetter_(colSummary_(1));
  const lastSummary = columnLetter_(colSummary_(MAX_GROUPS));

  const ghdr = [], totals = [], ranks = [], gnames = [];
  for (var j = 1; j <= MAX_GROUPS; j++) {
    if (j > k) { ghdr.push(''); totals.push(''); ranks.push(''); gnames.push(''); continue; }
    const sp = groupSpan_(c.n, c.g, j);
    const block = sh.getRange(R_FIRST, sp.from, sc, sp.to - sp.from + 1).getA1Notation();
    const me = columnLetter_(colSummary_(j)) + R_TOTAL;
    ghdr.push('G' + j);
    gnames.push('G' + j);
    // 총합 ÷ 응시 인원. AVERAGE가 빈칸(결석)을 알아서 빼준다
    totals.push('=IF(COUNT(' + block + ')=0,"",ROUND(AVERAGE(' + block + '),2))');
    ranks.push('=IF(' + me + '="","",RANK(' + me +
               ',$' + firstSummary + '$' + R_TOTAL + ':$' + lastSummary + '$' + R_TOTAL + ',0))');
  }
  sh.getRange(R_GHDR, colSummary_(1), 1, MAX_GROUPS).setValues([ghdr]);
  sh.getRange(R_TOTAL, colSummary_(1), 1, MAX_GROUPS).setFormulas([totals]);
  sh.getRange(R_RANK, colSummary_(1), 1, MAX_GROUPS).setFormulas([ranks]);
  sh.getRange(R_HDR, colAvg_(1), 1, MAX_GROUPS).setValues([gnames]);

  // 안 쓰는 학생 열은 숨긴다. 열 자체는 늘 40칸이라 위치가 안 움직인다
  sh.showColumns(colStudent_(1), MAX_STUDENTS);
  if (c.n < MAX_STUDENTS) {
    sh.hideColumns(colStudent_(c.n + 1), MAX_STUDENTS - c.n);
  }

  const perSession = [];
  for (var r = 0; r < sc; r++) {
    const row = R_FIRST + r, fs = [];
    for (var j2 = 1; j2 <= MAX_GROUPS; j2++) {
      if (j2 > k) { fs.push(''); continue; }
      const sp2 = groupSpan_(c.n, c.g, j2);
      const a = sh.getRange(row, sp2.from, 1, sp2.to - sp2.from + 1).getA1Notation();
      fs.push('=IF(COUNT(' + a + ')=0,"",ROUND(AVERAGE(' + a + '),2))');
    }
    perSession.push(fs);
  }
  sh.getRange(R_FIRST, colAvg_(1), sc, MAX_GROUPS).setFormulas(perSession);
}

function buildClassSheet_(ss, c) {
  const sh = ss.insertSheet(c.name);
  const lastCol = colAvg_(MAX_GROUPS);

  // 새 시트는 기본 26열뿐이다. 학생이 많으면 열이 모자라 죽는다
  if (sh.getMaxColumns() < lastCol) {
    sh.insertColumnsAfter(sh.getMaxColumns(), lastCol - sh.getMaxColumns());
  }

  sh.getRange(R_TITLE, 1).setValue('quick-score · ' + c.name).setFontSize(14).setFontWeight('bold');
  sh.getRange(R_HDR, 1).setNote('시험 날짜입니다. 도우미가 처음 점수를 저장할 때 자동으로 적히고, '
    + '틀리면 여기서 바로 고치면 됩니다.');
  sh.getRange(R_GHDR, 1).setValue('그룹');
  sh.getRange(R_TOTAL, 1).setValue('누적');
  sh.getRange(R_RANK, 1).setValue('순위');
  sh.getRange(R_GHDR, 1, 3, 1).setFontWeight('bold');
  sh.getRange(R_RANK, 1, 1, 1).setFontWeight('bold');
  sh.getRange(R_GHDR, colSummary_(1), 3, MAX_GROUPS)
    .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#fff2cc');

  // 원본 표 머리글 (G열 이름은 refreshGroupFormulas_ 가 채운다)
  const hdr = ['날짜', '잠금'];
  for (var i = 1; i <= MAX_STUDENTS; i++) hdr.push(i + '번');
  for (var m = 1; m <= MAX_GROUPS; m++) hdr.push('');   // G열 이름은 refreshGroupFormulas_ 가 채운다
  sh.getRange(R_HDR, 1, 1, hdr.length).setValues([hdr])
    .setFontWeight('bold').setBackground('#e8eaed').setHorizontalAlignment('center');

  // A열은 시험 날짜. 도우미가 그 회차에 처음 점수를 저장할 때 자동으로 적힌다
  sh.getRange(R_FIRST, 1, INIT_SESSIONS, 1)
    .setNumberFormat('yyyy-mm-dd').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(R_FIRST, colAvg_(1), INIT_SESSIONS, MAX_GROUPS).setBackground('#fff2cc');
  sh.getRange(R_FIRST, colLock_(), INIT_SESSIONS, 1).insertCheckboxes();

  refreshGroupFormulas_(sh, c, INIT_SESSIONS);

  sh.setColumnWidth(1, 96);   // 날짜가 들어간다
  sh.setColumnWidth(colLock_(), 50);
  for (var w = colStudent_(1); w <= lastCol; w++) sh.setColumnWidth(w, 38);
  sh.setFrozenRows(R_HDR);
  sh.setFrozenColumns(2);   // 회차 + 잠금은 스크롤해도 항상 보인다
  sh.getRange(R_FIRST, colStudent_(1), INIT_SESSIONS, MAX_STUDENTS).setHorizontalAlignment('center');
}

function buildAllSheet_(ss, config) {
  const sh = ss.getSheetByName(S_ALL) || ss.insertSheet(S_ALL);
  sh.clear();

  const hdr = ['반'];
  for (var j = 1; j <= MAX_GROUPS; j++) hdr.push('G' + j);
  hdr.push('1등');
  hdr.push('회차');   // 반마다 시험 횟수가 다를 수 있다. 없으면 반끼리 잘못 비교하게 된다
  sh.getRange(1, 1, 1, hdr.length).setValues([hdr])
    .setFontWeight('bold').setBackground('#e8eaed').setHorizontalAlignment('center');

  config.forEach(function (c, i) {
    const row = i + 2;
    sh.getRange(row, 1).setValue(c.name).setFontWeight('bold');
    for (var j2 = 1; j2 <= MAX_GROUPS; j2++) {
      // 반 시트의 누적 행(3행)을 그대로 참조 — 계산이 아니라 거울일 뿐
      sh.getRange(row, 1 + j2).setFormula("='" + c.name + "'!" + columnLetter_(colSummary_(j2)) + R_TOTAL);
    }
    const from = 'B' + row, to = columnLetter_(1 + MAX_GROUPS) + row;
    sh.getRange(row, 2 + MAX_GROUPS).setFormula(
      '=IFERROR(INDEX($B$1:$' + columnLetter_(1 + MAX_GROUPS) + '$1,MATCH(MAX(' +
      from + ':' + to + '),' + from + ':' + to + ',0)),"")'
    );
    // 그 반 시트에서 날짜가 적힌 줄 수 = 실제로 친 시험 횟수
    sh.getRange(row, 3 + MAX_GROUPS).setFormula(
      "=COUNT('" + c.name + "'!A" + R_FIRST + ":A)"
    );
  });

  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 70);
}

/** 1 → A, 2 → B ... (26열까지면 충분) */
function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
