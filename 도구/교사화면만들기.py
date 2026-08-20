# -*- coding: utf-8 -*-
"""
docs/teacher.html 을 만든다. 시트 배치를 바꾸면 실행: python3 교사화면만들기.py

열 배치는 Code.gs 와 같다:
  A = 회차,  B = 잠금(고정),  C~ = 학생,  학생 뒤 = 회차별 그룹평균
  요약(2~4행) 은 C 부터 MAX_GROUPS 칸

모든 시트를 두 벌 그린다 — '설치 직후'(빈 시트)와 '몇 주 쓴 뒤'(표본).
기본은 설치 직후. 동료 선생님이 실제로 받는 상태가 그것이기 때문.
"""

import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))  # 저장소 루트 기준

import random
random.seed(7)

MAX_GROUPS = 10
SESSIONS, SHOW_ROWS = 4, 8
LOCKED = {1, 2}

# 반마다 인원이 다르다. 실제 교실이 그렇고, 그룹 분배도 그에 맞춰 달라진다
COUNT = {'1반':25, '2반':22, '3반':24, '4반':23, '5반':25, '6반':21,
         '7반':24, '8반':25, '9반':23, '10반':22, '11반':24}
CLASSES = list(COUNT.keys())
PW = {'1반':'3141','2반':'2718','3반':'1618','4반':'1414','5반':'2236','6반':'1732',
      '7반':'2645','8반':'1259','9반':'5772','10반':'6180','11반':'9159'}

def group_sizes(n, g=4):
    """Code.gs 의 groupSizes_ 와 같은 규칙"""
    k = max(1, n // g)
    base, rem = n // k, n % k
    return [base + (1 if j >= k - rem else 0) for j in range(k)]

COL_LOCK = 2
def col_student(i): return 2 + i
def col_summary(j): return col_student(1) + j - 1
def col_avg(n, j):  return 2 + n + j

def letter(n):
    s = ''
    while n > 0:
        n, m = divmod(n - 1, 26); s = chr(65 + m) + s
    return s

SPANS = {}
for cls in CLASSES:
    out, first = [], 1
    for sz in group_sizes(COUNT[cls]):
        out.append((first, first + sz - 1)); first += sz
    SPANS[cls] = out

data = {}
for cls in CLASSES:
    for s in range(1, SESSIONS + 1):
        data[(cls, s)] = [None if random.random() < 0.07 else random.randint(8, 16)
                          for _ in range(COUNT[cls])]

def sess_avg(cls, s, gi):
    a, b = SPANS[cls][gi]
    v = [x for x in data[(cls, s)][a-1:b] if x is not None]
    return round(sum(v)/len(v), 2) if v else None

def total_avg(cls, gi):
    a, b = SPANS[cls][gi]
    v = [x for s in range(1, SESSIONS+1) for x in data[(cls, s)][a-1:b] if x is not None]
    return round(sum(v)/len(v), 2) if v else None

def td(txt='', cls='', attr=''):
    return f'<td class="{cls}"{attr}>{txt}</td>'


def sheet_class(cls, used):
    N = COUNT[cls]
    SIZES = group_sizes(N)
    LAST_COL = col_avg(N, MAX_GROUPS)
    K = len(SIZES)

    tot = [total_avg(cls, g) for g in range(K)] if used else [None] * K
    if used:
        ranked = sorted([t for t in tot if t is not None], reverse=True)
        rank = ['' if t is None else ranked.index(t)+1 for t in tot]
    else:
        rank = [''] * K

    head = '<tr><th class="rn"></th>' + ''.join(
        f'<th class="{"frz1" if c==1 else "frz2" if c==COL_LOCK else ""}">{letter(c)}</th>'
        for c in range(1, LAST_COL+1)) + '</tr>'

    rows = []
    def emit(cells, rowcls=''):
        rows.append(f'<tr class="{rowcls}"><th class="rn">{len(rows)+1}</th>' + ''.join(cells) + '</tr>')
    def pad(cells):
        return cells + [td() for _ in range(LAST_COL - len(cells))]

    emit(pad([td('quick-score · ' + cls, 'title frz1'), td('', 'frz2')]))

    def summary(label, vals, mark=None):
        cs = [td(label, 'lbl frz1'), td('', 'frz2')]
        for j in range(MAX_GROUPS):
            v = vals[j] if (j < K and vals[j] not in (None, '')) else ''
            a = f' data-{mark}="{j}"' if (mark and j < K) else ''
            cs.append(td(v, 'sum', a))
        emit(pad(cs), 'sumrow')
    summary('그룹', [f'G{j+1}' for j in range(K)])          # 그룹 이름은 항상 있다 (수식이 만든다)
    summary('누적', tot, 'tot')
    summary('순위', ['🥇' if x==1 else '🥈' if x==2 else '🥉' if x==3 else x for x in rank], 'rank')

    emit(pad([td('', 'frz1'), td('', 'frz2')]))

    hdr = [td('회차', 'hdr frz1'), td('잠금', 'hdr frz2')]
    for i in range(1, N+1): hdr.append(td(f'{i}번', 'hdr'))
    for j in range(MAX_GROUPS): hdr.append(td(f'G{j+1}' if j < K else '', 'hdr avg'))
    emit(pad(hdr), 'hdrrow')

    def gi_of(num):
        for j, (a, b) in enumerate(SPANS[cls]):
            if a <= num <= b: return j
        return 0

    for s in range(1, SHOW_ROWS+1):
        locked = used and s in LOCKED
        cs = [td(f'{s}회차', 'lbl frz1'),
              td('☑' if locked else '☐', 'lock frz2', ' onclick="toggleLock(this)"')]
        for i in range(1, N+1):
            v = data[(cls, s)][i-1] if (used and s <= SESSIONS) else None
            absent = used and s <= SESSIONS and v is None
            cs.append(td('' if v is None else v, 'score' + (' absent' if absent else ''),
                         f' contenteditable="true" data-g="{gi_of(i)}"'))
        for j in range(MAX_GROUPS):
            v = sess_avg(cls, s, j) if (used and s <= SESSIONS and j < K) else None
            cs.append(td('' if v is None else v, 'avg', f' data-avg="{j}"' if j < K else ''))
        emit(pad(cs))
    return f'<table class="sheet live" data-k="{K}">{head}{"".join(rows)}</table>'


def sheet_config(used):
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 5)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['반이름', '비밀번호', '학생수', '그룹당인원']) + '</tr>']
    for i, c in enumerate(CLASSES):
        pw = PW[c] if used else ''
        n = COUNT[c] if used else ''
        g = ('4,4,4,4,4,5' if c == '1반' else 4) if used else 4
        rows.append(f'<tr><th class="rn">{i+2}</th>' + td(c, 'lbl') +
                    td(pw, 'pw') + td(n, 'pw') + td(g) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'


def sheet_log(used):
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 7)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['시각','반','회차','학생','이전값','새값']) + '</tr>']
    entries = [
        ('2026-08-24 09:14:22','1반','1회차','1번','(없음)',14),
        ('2026-08-24 09:14:22','1반','1회차','2번','(없음)',13),
        ('2026-08-24 09:14:22','1반','1회차','6번','(없음)','(결석)'),
        ('2026-08-24 09:15:03','1반','1회차','5번','(없음)',11),
        ('2026-08-31 09:11:47','1반','2회차','1번','(없음)',11),
        ('2026-08-31 09:20:12','1반','-','그룹구성','4','4,4,4,4,4,5'),
        ('2026-09-07 09:12:55','1반','3회차','7번',11,14),
        ('2026-09-07 09:31:08','1반','-','회차추가','20회차까지','30회차까지'),
    ] if used else []
    for i, e in enumerate(entries):
        cls = 'warn' if e[4] not in ('(없음)', '4', '20회차까지') else ''
        rows.append(f'<tr><th class="rn">{i+2}</th>' + ''.join(td(x, cls) for x in e) + '</tr>')
    for i in range(len(entries), 8):
        rows.append(f'<tr><th class="rn">{i+2}</th>' + ''.join(td() for _ in range(6)) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'


def sheet_all(used):
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 13)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['반'] + [f'G{j+1}' for j in range(MAX_GROUPS)] + ['1등']) + '</tr>']
    for i, cls in enumerate(CLASSES):
        k = len(group_sizes(COUNT[cls]))
        cs = [td(cls, 'lbl')]
        if used:
            tot = [total_avg(cls, g) for g in range(k)]
            best = max(range(len(tot)), key=lambda j: tot[j])
            for j in range(MAX_GROUPS):
                cs.append(td(tot[j] if j < k else '', 'avg' + (' best' if j == best else '')))
            cs.append(td(f'G{best+1}', 'lbl'))
        else:
            for j in range(MAX_GROUPS): cs.append(td('', 'avg'))
            cs.append(td())
        rows.append(f'<tr><th class="rn">{i+2}</th>' + ''.join(cs) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'


HINT_CONFIG = ('선생님이 손으로 관리하는 <b>유일한</b> 시트입니다. 설치하면 <b>비밀번호와 학생수가 비어 있고</b>'
  '(분홍색), 이 두 칸을 채워야 그 반을 쓸 수 있습니다. 숫자를 미리 넣어두지 않는 이유는, 채워져 있으면 '
  '확인 없이 넘어가서 엉뚱한 인원으로 돌아가기 때문입니다.<br>'
  '<b>그룹당인원</b>에 <code>4</code>처럼 숫자 하나를 쓰면 자동으로 나누고, '
  '<code>4,4,4,4,4,5</code>처럼 쉼표로 쓰면 그대로 씁니다. 비밀번호는 바꾸면 즉시 적용되고 재배포가 필요 없습니다.')

HINT_FIRST = ('<b>A(회차)와 B(잠금)는 고정</b>이라 오른쪽으로 아무리 스크롤해도 따라옵니다. '
  '회차가 끝나면 <b>잠금</b>에 체크만 하면 그 회차는 도우미가 못 고칩니다.<br>'
  '<b>2~4행</b>이 열자마자 보이는 요약이고, 세부 점수는 6행 아래입니다. '
  '노란 칸은 전부 수식이라 손댈 필요가 없습니다. 분홍 칸은 결석이라 평균에서 빠집니다.<br>'
  '<b>여기서 직접 해보실 수 있습니다</b> — 점수 칸을 눌러 숫자를 고치거나 지워보세요. '
  '노란 칸이 바로 다시 계산됩니다. <b>잠금</b> 칸도 눌러보세요.')

TABS = [('설정', sheet_config, HINT_CONFIG)]
for _c in CLASSES:
    _n = COUNT[_c]
    _h = HINT_FIRST if _c == '1반' else (
        f'{_c}은 {_n}명이라 그룹이 {"·".join(str(x) for x in group_sizes(_n))}명으로 나뉩니다. '
        '반마다 같은 모양의 시트가 하나씩 생깁니다.')
    TABS.append((_c, sheet_class, _h))
TABS.append(('로그', sheet_log,
  '누가 언제 어느 칸을 뭐에서 뭐로 바꿨는지 전부 남습니다. <b>주황색</b>은 이미 있던 값을 고친 기록이라 '
  '특히 눈여겨볼 줄입니다. 그룹 구성 변경과 회차 추가도 남습니다.'))
TABS.append(('전체', sheet_all,
  '반을 옮겨다니지 않고 한눈에 비교합니다. 코드가 아니라 각 반 시트의 누적 행을 그대로 비추는 수식입니다.'))


def render(fn, name, used):
    return fn(name, used) if fn is sheet_class else fn(used)

tabs_html = ''.join(f'<button class="tab{" on" if i==0 else ""}" onclick="pick({i})">{t[0]}</button>'
                    for i, t in enumerate(TABS))
panes = ''.join(
    f'<div class="pane{" on" if i==0 else ""}" id="p{i}"><p class="hint">{t[2]}</p>'
    f'<div class="scroll v fresh">{render(t[1], t[0], False)}</div>'
    f'<div class="scroll v used">{render(t[1], t[0], True)}</div></div>'
    for i, t in enumerate(TABS))

html = f'''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>quick-score · 교사 화면 미리보기</title>
<style>
 body {{ margin:0; background:#f1f3f4; color:#202124;
        font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif; }}
 header {{ background:#fff; border-bottom:1px solid #dadce0; padding:14px 18px; }}
 header h1 {{ margin:0 0 3px; font-size:18px; }}
 header p {{ margin:0 0 11px; font-size:13px; color:#5f6368; }}
 .modes {{ display:flex; gap:6px; }}
 .mode {{ border:1px solid #dadce0; background:#fff; color:#3c4043; padding:8px 14px;
          font-size:13.5px; border-radius:20px; cursor:pointer; font-family:inherit; }}
 .mode.on {{ background:#0b8043; border-color:#0b8043; color:#fff; font-weight:700; }}
 .tabs {{ display:flex; gap:2px; background:#fff; border-bottom:1px solid #dadce0; padding:0 12px; overflow-x:auto; }}
 .tab {{ border:0; background:none; padding:11px 14px; font-size:14px; color:#5f6368;
         border-bottom:3px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; }}
 .tab.on {{ color:#0b8043; border-bottom-color:#0b8043; font-weight:700; }}
 .pane {{ display:none; padding:14px; }} .pane.on {{ display:block; }}
 .hint {{ margin:0 0 12px; font-size:13.5px; line-height:1.75; color:#3c4043;
          background:#fff; border-left:3px solid #0b8043; padding:11px 13px; border-radius:0 8px 8px 0; }}
 .hint code {{ background:#f1f3f4; padding:1px 5px; border-radius:4px; font-size:12.5px; }}
 .scroll {{ overflow-x:auto; background:#fff; border:1px solid #dadce0; border-radius:6px; }}
 .v.used {{ display:none; }}
 body.used .v.fresh {{ display:none; }}
 body.used .v.used {{ display:block; }}
 table.sheet {{ border-collapse:separate; border-spacing:0; font-size:12px; font-family:"SF Mono",Menlo,monospace; }}
 table.sheet th, table.sheet td {{ border-right:1px solid #e0e2e5; border-bottom:1px solid #e0e2e5;
        padding:3px 5px; text-align:center; min-width:34px; height:22px; white-space:nowrap; background:#fff; }}
 table.sheet th {{ background:#f8f9fa; color:#5f6368; font-weight:400; font-size:11px; }}
 th.rn {{ position:sticky; left:0; z-index:4; background:#f8f9fa; min-width:26px; }}
 .frz1 {{ position:sticky; left:26px; z-index:3; }}
 .frz2 {{ position:sticky; left:96px; z-index:3; box-shadow:2px 0 0 #9aa0a6; }}
 td.frz1, th.frz1 {{ min-width:70px; }}
 td.frz2, th.frz2 {{ min-width:50px; }}
 .narrow th, .narrow td {{ min-width:78px; }}
 .title {{ text-align:left !important; font-weight:700; font-size:13px; }}
 .lbl {{ background:#f8f9fa !important; font-weight:700; text-align:left !important; }}
 .hdr {{ background:#e8eaed !important; font-weight:700; }}
 .sumrow td.sum {{ background:#fff2cc !important; font-weight:700; }}
 .sumrow td.lbl {{ background:#fce8b2 !important; }}
 td.avg {{ background:#fff9e6 !important; color:#7f6000; }}
 td.lock {{ background:#f8f9fa !important; font-size:14px; }}
 td.absent {{ background:#fce8e6 !important; }}
 td.pw {{ background:#fce8e6 !important; }}
 td.best {{ background:#d9ead3 !important; font-weight:700; color:#274e13; }}
 td.warn {{ background:#fde9d9 !important; }}
 td.score {{ cursor:text; }}
 td.score:focus {{ outline:2px solid #0b8043; outline-offset:-2px; background:#f0f8f2 !important; }}
 td.lock {{ cursor:pointer; user-select:none; }}
 td.lock:hover {{ background:#e8f0ea !important; }}
 footer {{ padding:14px 18px 40px; font-size:13px; color:#5f6368; line-height:1.8; }}
</style></head><body>
<header>
  <h1>quick-score · 교사 화면 미리보기</h1>
  <p>실제 구글 스프레드시트가 이렇게 생깁니다.</p>
  <div class="modes">
    <button class="mode on" id="m-fresh" onclick="mode(0)">설치 직후 — 받는 상태</button>
    <button class="mode" id="m-used" onclick="mode(1)">몇 주 쓴 뒤 — 표본</button>
  </div>
</header>
<div class="tabs">{tabs_html}</div>
{panes}
<footer>
  <b>선생님이 직접 하는 일은 세 가지뿐입니다.</b><br>
  ① <b>설정</b> 시트에 반별 비밀번호와 학생수 적기 &nbsp; ② 회차가 끝나면 <b>B열 잠금</b>에 체크 &nbsp;
  ③ <b>전체</b> 시트로 순위 확인<br>
  노란 칸(평균·누적·순위)은 전부 수식이라 건드릴 필요가 없습니다.
</footer>
<script>
function pick(i) {{
  var t = document.querySelectorAll('.tab'), p = document.querySelectorAll('.pane');
  for (var k = 0; k < t.length; k++) {{ t[k].classList.toggle('on', k === i); p[k].classList.toggle('on', k === i); }}
}}
/* 셀을 직접 고치면 평균·누적·순위를 다시 계산한다.
   실제 스프레드시트에서 선생님이 숫자를 고칠 때 벌어지는 일과 같다. */
function num(td) {{
  var t = (td.textContent || '').trim().replace(/[^0-9.]/g, '');
  return t === '' ? null : Number(t);
}}
function recalc(table) {{
  var k = Number(table.dataset.k), i, j;
  var sums = [], cnts = [];
  for (j = 0; j < k; j++) {{ sums.push(0); cnts.push(0); }}

  var rows = table.querySelectorAll('tr');
  for (i = 0; i < rows.length; i++) {{
    var tr = rows[i];
    if (!tr.querySelector('td.lock')) continue;          // 회차 줄만
    var any = tr.querySelectorAll('td.score');
    var rowHas = false;
    for (var q = 0; q < any.length; q++) if (num(any[q]) !== null) rowHas = true;

    for (j = 0; j < k; j++) {{
      var cells = tr.querySelectorAll('td.score[data-g="' + j + '"]');
      var sum = 0, n = 0;
      for (var c = 0; c < cells.length; c++) {{
        var v = num(cells[c]);
        cells[c].classList.toggle('absent', rowHas && v === null);
        if (v !== null) {{ sum += v; n++; }}
      }}
      var av = tr.querySelector('td[data-avg="' + j + '"]');
      if (av) av.textContent = n ? Math.round(sum / n * 100) / 100 : '';
      sums[j] += sum; cnts[j] += n;
    }}
  }}

  var tots = [];
  for (j = 0; j < k; j++) tots.push(cnts[j] ? Math.round(sums[j] / cnts[j] * 100) / 100 : null);
  var sorted = tots.filter(function (x) {{ return x !== null; }}).sort(function (a, b) {{ return b - a; }});
  var medal = ['🥇', '🥈', '🥉'];
  for (j = 0; j < k; j++) {{
    var tc = table.querySelector('td[data-tot="' + j + '"]');
    var rc = table.querySelector('td[data-rank="' + j + '"]');
    if (tc) tc.textContent = tots[j] === null ? '' : tots[j];
    if (rc) {{
      if (tots[j] === null) rc.textContent = '';
      else {{ var r = sorted.indexOf(tots[j]) + 1; rc.textContent = medal[r - 1] || r; }}
    }}
  }}
}}
document.addEventListener('input', function (e) {{
  var t = e.target.closest ? e.target.closest('table.live') : null;
  if (t) recalc(t);
}});
function toggleLock(td) {{
  td.textContent = (td.textContent.trim() === '☑') ? '☐' : '☑';
}}

function mode(i) {{
  document.body.classList.toggle('used', i === 1);
  document.getElementById('m-fresh').classList.toggle('on', i === 0);
  document.getElementById('m-used').classList.toggle('on', i === 1);
}}
</script>
</body></html>'''

open('docs/teacher.html', 'w', encoding='utf-8').write(html)
print('✅ docs/teacher.html 생성')
