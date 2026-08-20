# -*- coding: utf-8 -*-
"""
Index.html 에 가짜 서버를 붙여 미리보기.html 을 만든다.
Index.html 을 고칠 때마다 실행:  python3 미리보기만들기.py
"""

STUB = r'''
<script>
/* ───── 미리보기 전용 가짜 서버 (실제 앱은 Index.html) ───── */
var FK = { n: 25, g: 4, data: {}, lock: { 3: true }, sessions: 20 };
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
function fkRanking(cls) {
  return fkGroups().map(function (g) {
    var all = [];
    for (var s = 1; s <= 20; s++) {
      var row = FK.data[cls + '/' + s];
      if (row) g.numbers.forEach(function (n) { if (row[n - 1] !== null) all.push(row[n - 1]); });
    }
    if (!all.length) return null;
    var sum = all.reduce(function (a, b) { return a + b; }, 0);
    return { group: g.index, avg: Math.round(sum / all.length * 100) / 100 };
  }).filter(Boolean).sort(function (a, b) { return b.avg - a.avg; })
    .map(function (x, i) { x.rank = i + 1; return x; });
}
function fkAuth(cls, pw) { if (String(pw).trim() !== '1234') throw { message: '비밀번호가 맞지 않습니다.' }; }

var FAKE = {
  getClassNames: function () { return FK_NAMES; },
  login: function (cls, pw) {
    fkAuth(cls, pw);
    var sessions = [];
    for (var s = 1; s <= (FK.sessions || 20); s++) {
      var row = FK.data[cls + '/' + s] || [];
      sessions.push({ no: s, filled: row.filter(function (v) { return v !== null; }).length, locked: !!FK.lock[s] });
    }
    return {
      className: cls, studentCount: FK.n, groups: fkGroups(), sizes: fkSizes(FK.n, FK.g),
      canEditGroups: !sessions.some(function (x) { return x.locked; }),
      hasData: sessions.some(function (x) { return x.filled > 0; }),
      sessions: sessions, ranking: fkRanking(cls)
    };
  },
  getSession: function (cls, pw, s) { fkAuth(cls, pw); return { session: s, locked: !!FK.lock[s], scores: fkRow(cls, s).slice() }; },
  saveGroup: function (cls, pw, s, gi, vals) {
    fkAuth(cls, pw);
    if (FK.lock[s]) throw { message: s + '회차는 선생님이 확정해서 잠갔습니다. 수정할 수 없습니다.' };
    var row = fkRow(cls, s), g = fkGroups()[gi - 1];
    g.numbers.forEach(function (n, i) { row[n - 1] = vals[i]; });
    return { ok: true, ranking: fkRanking(cls) };
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
  },
  getRanking: function (cls, pw) { fkAuth(cls, pw); return fkRanking(cls); }
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

/* 미리보기에서만: 밝게 / 어둡게 강제 전환. 실제 앱은 폰 설정을 자동으로 따른다 */
var LIGHT = { bg:'#f6f4fc', card:'#ffffff', line:'#e4dff1', ink:'#211b33', dim:'#6d6483', accent:'#6c4ed9', hi:'#f1ecfd' };
var DARK  = { bg:'#15131f', card:'#1e1b2b', line:'#322d45', ink:'#ece9f5', dim:'#9a93b3', accent:'#8a68ec', hi:'#2a2440' };
function pvTheme(mode) {
  var r = document.documentElement.style;
  ['bg','card','line','ink','dim','accent','hi'].forEach(function (k) { r.removeProperty('--' + k); });
  if (mode !== 'auto') { var v = (mode === 'dark') ? DARK : LIGHT; for (var k in v) r.setProperty('--' + k, v[k]); }
  ['auto','light','dark'].forEach(function (m) {
    var b = document.getElementById('pv-' + m);
    b.style.fontWeight = (m === mode) ? '700' : '400';
  });
}

/* 미리보기에서 3회차 잠금을 껐다 켜서 그룹 조정을 시험해볼 수 있게 */
function pvLock(on) {
  FK.lock = on ? { 3: true } : {};
  document.getElementById('pv-lockmsg').textContent = on ? '잠금 있음' : '잠금 없음';
}

window.addEventListener('load', function () {
  pvTheme('auto');
  var d = document.createElement('button');
  d.textContent = '🎲 이 그룹 랜덤 채우기';
  d.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:auto;margin:0;' +
    'padding:13px 20px;background:var(--accent);color:#fff;border-radius:26px;font-size:15px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.28);z-index:99';
  d.onclick = function () {
    var ins = document.querySelectorAll('#rows input');
    for (var i = 0; i < ins.length; i++) {
      ins[i].value = (Math.random() < 0.12) ? '' : Math.floor(8 + Math.random() * 8);
      ins[i].dispatchEvent(new Event('input'));
    }
  };
  document.body.appendChild(d);
  setInterval(function () {
    d.style.display = document.getElementById('s-input').classList.contains('on') ? 'block' : 'none';
  }, 200);
});
</script>
'''

BANNER = (
  '<div id="app">\n'
  '  <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;'
  'padding:12px 13px;font-size:14px;line-height:1.7;margin-bottom:12px;color:var(--dim)">'
  '<b style="color:var(--ink)">미리보기</b> · 아무 반 + 비밀번호 <b>1234</b><br>'
  '점수는 아래 <b>🎲</b>, 글자 크기는 오른쪽 위 <b>가</b>.'
  '<div style="display:flex;gap:6px;margin-top:10px">'
  '<button id="pv-auto" onclick="pvTheme(\'auto\')" style="margin:0;padding:8px;font-size:13px;'
  'background:var(--card);color:var(--ink);border:1px solid var(--line)">📱 폰 설정</button>'
  '<button id="pv-light" onclick="pvTheme(\'light\')" style="margin:0;padding:8px;font-size:13px;'
  'background:var(--card);color:var(--ink);border:1px solid var(--line)">☀️ 밝게</button>'
  '<button id="pv-dark" onclick="pvTheme(\'dark\')" style="margin:0;padding:8px;font-size:13px;'
  'background:var(--card);color:var(--ink);border:1px solid var(--line)">🌙 어둡게</button>'
  '</div>'
  '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">'
  '<button onclick="pvLock(true)" style="margin:0;padding:8px;font-size:13px;'
  'background:var(--card);color:var(--ink);border:1px solid var(--line)">🔒 3회차 잠금</button>'
  '<button onclick="pvLock(false)" style="margin:0;padding:8px;font-size:13px;'
  'background:var(--card);color:var(--ink);border:1px solid var(--line)">🔓 잠금 해제</button>'
  '<span id="pv-lockmsg" style="font-size:13px">잠금 있음</span>'
  '</div></div>')

src = open('Index.html', encoding='utf-8').read()
out = src.replace('<script>\n// ── 서버 호출', STUB + '\n<script>\n// ── 서버 호출', 1)
out = out.replace('<div id="app">', BANNER, 1)
open('미리보기.html', 'w', encoding='utf-8').write(out)
print('✅ 미리보기.html 생성')
