# -*- coding: utf-8 -*-
"""
Index.html 에 가짜 서버를 붙여 docs/preview.html 을 만든다.
Index.html 을 고칠 때마다 실행:  python3 미리보기만들기.py
"""

import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))  # 저장소 루트 기준


STUB = r'''
<script>
/* ───── 미리보기 전용 가짜 서버 (실제 앱은 Index.html) ───── */
var FK = { n: 25, g: 4, data: {}, dates: {}, lock: {}, sessions: 20, pwChanged: false };
function fkToday() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}
var FK_NAMES = []; for (var i = 1; i <= 11; i++) FK_NAMES.push(i + '반');

function fkSizes(n, g) {   /* Code.gs의 groupSizes_ 와 같은 규칙 */
  if (Object.prototype.toString.call(g) === '[object Array]') return g.slice();
  var k = Math.max(1, Math.floor(n / g)), base = Math.floor(n / k), rem = n % k, out = [];
  for (var j = 0; j < k; j++) out.push(base + (j >= k - rem ? 1 : 0));
  return out;
}
function fkGroups() {
  var out = [], first = 1;
  fkSizes(FK.n, FK.g).forEach(function (sz, j) {
    var nums = [];
    for (var i = first; i < first + sz; i++) nums.push(i);
    out.push({ index: j + 1, label: 'Group ' + (j + 1), range: first + '~' + (first + sz - 1) + '번', numbers: nums });
    first += sz;
  });
  return out;
}
function fkRow(cls, s) {
  var key = cls + '/' + s;
  if (!FK.data[key]) { FK.data[key] = []; for (var i = 0; i < FK.n; i++) FK.data[key].push(null); }
  return FK.data[key];
}
function fkAuth(cls, pw) {
  var real = FK.pwChanged ? '5678' : '1234';
  if (String(pw).trim() !== real) throw { message: '비밀번호가 맞지 않습니다.' };
}

/* 일주일 전 시험 하나를 미리 넣어둔다. 목록이 비면 날짜 화면을 볼 수 없다 */
(function seed() {
  var d = new Date(); d.setDate(d.getDate() - 7);
  var iso = d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
  FK_NAMES.forEach(function (c) {
    FK.dates[c + '/1'] = iso;
    var row = [];
    for (var i = 0; i < FK.n; i++) {
      row.push(Math.random() < 0.1 ? null : 8 + Math.floor(Math.random() * 8));
    }
    FK.data[c + '/1'] = row;
  });
})();

var FAKE = {
  getClassNames: function () { return FK_NAMES; },
  login: function (cls, pw) {
    fkAuth(cls, pw);
    var sessions = [];
    for (var s = 1; s <= (FK.sessions || 20); s++) {
      var row = FK.data[cls + '/' + s] || [];
      var filled = row.filter(function (v) { return v !== null; }).length;
      var date = FK.dates[cls + '/' + s] || '';
      if (!date && !filled) continue;          // 안 쓴 줄은 목록에 없다
      sessions.push({ no: s, date: date, filled: filled, locked: !!FK.lock[s] });
    }
    return {
      className: cls, studentCount: FK.n, groups: fkGroups(), sizes: fkSizes(FK.n, FK.g),
      canEditGroups: !sessions.some(function (x) { return x.locked; }),
      hasData: sessions.some(function (x) { return x.filled > 0; }),
      sessions: sessions
    };
  },
  getSession: function (cls, pw, s) {
    fkAuth(cls, pw);
    return { session: s, date: FK.dates[cls + '/' + s] || '',
             locked: !!FK.lock[s], scores: fkRow(cls, s).slice() };
  },
  startSession: function (cls, pw) {
    fkAuth(cls, pw);
    for (var s = 1; s <= (FK.sessions || 20); s++) {
      var row = FK.data[cls + '/' + s];
      var used = FK.dates[cls + '/' + s] || (row && row.some(function (v) { return v !== null; }));
      if (!used) return { session: s };
    }
    FK.sessions += 10;
    return { session: FK.sessions - 9 };
  },
  saveGroup: function (cls, pw, s, gi, vals) {
    fkAuth(cls, pw);
    if (FK.lock[s]) throw { message: '선생님이 확정한 시험이라 수정할 수 없습니다.' };
    var key = cls + '/' + s;
    if (!FK.dates[key]) FK.dates[key] = fkToday();    // 첫 저장 때 오늘 날짜
    var row = fkRow(cls, s), g = fkGroups()[gi - 1];
    g.numbers.forEach(function (n, i) { row[n - 1] = vals[i]; });
    return { ok: true, date: FK.dates[key] };
  },
  setGroupSizes: function (cls, pw, sizes) {
    fkAuth(cls, pw);
    var total = sizes.reduce(function (a, b) { return a + b; }, 0);
    if (total !== FK.n) throw { message: '그룹 인원 합계 ' + total + '명이 학생수 ' + FK.n + '명과 다릅니다.' };
    /* 미리보기에서는 3회차 잠금이 늘 켜져 있어 실제로는 여기까지 안 온다 */
    FK.g = sizes.slice();
    return FAKE.login(cls, pw);
  },
  addSessions: function (cls, pw, add) {
    fkAuth(cls, pw);
    FK.sessions = (FK.sessions || 20) + (Number(add) || 10);
    return FAKE.login(cls, pw);
  }
};

var google = { script: {} };
Object.defineProperty(google.script, 'run', {
  get: function () {
    var ok = function () {}, no = function () {}, r = {
      withSuccessHandler: function (f) { ok = f; return r; },
      withFailureHandler: function (f) { no = f; return r; }
    };
    Object.keys(FAKE).forEach(function (name) {
      r[name] = function () {
        var a = [].slice.call(arguments);
        setTimeout(function () { try { ok(FAKE[name].apply(null, a)); } catch (e) { no(e); } }, 200);
      };
    });
    return r;
  }
});

/* ───── 미리보기 조작 ─────
   실제 앱에는 없는 버튼들이다. 지금 상태를 버튼 이름에 담아 안내 줄을 없앴다. */
var LIGHT = { bg:'#f6f4fc', card:'#ffffff', line:'#e4dff1', ink:'#211b33', dim:'#6d6483', accent:'#6c4ed9', hi:'#f1ecfd' };
var DARK  = { bg:'#15131f', card:'#1e1b2b', line:'#322d45', ink:'#ece9f5', dim:'#9a93b3', accent:'#8a68ec', hi:'#2a2440' };
var pvDark = null;                 /* null 이면 폰 설정을 그대로 따른다 */

function pvTheme() {
  pvDark = (pvDark === null) ? true : (pvDark ? false : null);
  var r = document.documentElement.style;
  ['bg','card','line','ink','dim','accent','hi'].forEach(function (k) { r.removeProperty('--' + k); });
  if (pvDark !== null) {
    var v = pvDark ? DARK : LIGHT;
    for (var k in v) r.setProperty('--' + k, v[k]);
  }
  document.getElementById('pv-theme').textContent =
    pvDark === null ? '🌙 어둡게' : (pvDark ? '☀️ 밝게' : '📱 폰 설정');
}

function pvLock() {
  var on = !FK.lock[1];
  FK.lock = on ? { 1: true } : {};
  document.getElementById('pv-lock').textContent = on ? '🔓 잠금 풀기' : '🔒 잠가보기';
  /* 이미 그려진 목록은 저절로 안 바뀐다. 눌렀는데 반응이 없으면 고장으로 보인다 */
  if (typeof S !== 'undefined' && S.info) openSessions();
}

function pvPw() {
  FK.pwChanged = !FK.pwChanged;
  document.getElementById('pv-pw').textContent = FK.pwChanged ? '🔑 비번 되돌리기' : '🔑 비번 바뀜';
}

window.addEventListener('load', function () {
  /* 비밀번호를 미리 채워둔다. 미리보기에서 굳이 타이핑할 이유가 없다 */
  document.getElementById('pw').value = '1234';
});
</script>
'''

BTN = ('margin:0;padding:10px 6px;font-size:13px;width:auto;flex:1 1 0;'
       'background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:9px')

BANNER = (
  '<div id="app">\n'
  '  <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;'
  'padding:13px;font-size:13.5px;line-height:1.7;margin-bottom:14px;color:var(--dim)">'
  '<b style="color:var(--ink)">미리보기</b> — 비밀번호는 넣어뒀습니다. '
  '<b style="color:var(--ink)">들어가기</b>만 누르세요. 지난 시험 하나가 들어 있습니다.<br>'
  '<b>🔑 비번 바뀜</b> 은 로그인해서 입력하다 눌러야 안내 화면이 뜹니다.'
  '<div style="display:flex;gap:6px;margin-top:11px">'
  f'<button id="pv-theme" onclick="pvTheme()" style="{BTN}">🌙 어둡게</button>'
  f'<button id="pv-lock" onclick="pvLock()" style="{BTN}">🔒 잠가보기</button>'
  f'<button id="pv-pw" onclick="pvPw()" style="{BTN}">🔑 비번 바뀜</button>'
  '</div></div>')

src = open('Index.html', encoding='utf-8').read()
out = src.replace('<script>\n// ── 서버 호출', STUB + '\n<script>\n// ── 서버 호출', 1)
out = out.replace('<div id="app">', BANNER, 1)
open('docs/preview.html', 'w', encoding='utf-8').write(out)
print('✅ docs/preview.html 생성')
