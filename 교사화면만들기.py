# -*- coding: utf-8 -*-
"""
docs/teacher.html 을 만든다. 시트 배치를 바꾸면 실행: python3 교사화면만들기.py

열 배치는 Code.gs 와 같다:
  A = 회차,  B = 잠금(고정),  C~ = 학생,  학생 뒤 = 회차별 그룹평균
  요약(2~4행) 은 C 부터 MAX_GROUPS 칸
"""
import random
random.seed(7)

N, SIZES = 25, [4, 4, 4, 4, 4, 5]
MAX_GROUPS = 10
CLASSES = ['1반', '2반', '3반']
SESSIONS, SHOW_ROWS = 4, 8
LOCKED = {1, 2}

COL_LOCK = 2
def col_student(i): return 2 + i
def col_summary(j): return col_student(1) + j - 1
def col_avg(j):     return 2 + N + j
LAST_COL = col_avg(MAX_GROUPS)

def letter(n):
    s = ''
    while n > 0:
        n, m = divmod(n - 1, 26); s = chr(65 + m) + s
    return s

def spans():
    out, first = [], 1
    for sz in SIZES:
        out.append((first, first + sz - 1)); first += sz
    return out
SPANS = spans()

data = {}
for cls in CLASSES:
    for s in range(1, SESSIONS + 1):
        data[(cls, s)] = [None if random.random() < 0.07 else random.randint(8, 16) for _ in range(N)]

def sess_avg(cls, s, gi):
    a, b = SPANS[gi]
    v = [x for x in data[(cls, s)][a-1:b] if x is not None]
    return round(sum(v)/len(v), 2) if v else None

def total_avg(cls, gi):
    a, b = SPANS[gi]
    v = [x for s in range(1, SESSIONS+1) for x in data[(cls, s)][a-1:b] if x is not None]
    return round(sum(v)/len(v), 2) if v else None

def td(txt='', cls=''):
    return f'<td class="{cls}">{txt}</td>'

def sheet_class(cls):
    tot = [total_avg(cls, g) for g in range(len(SIZES))]
    ranked = sorted([t for t in tot if t is not None], reverse=True)
    rank = ['' if t is None else ranked.index(t)+1 for t in tot]

    head = '<tr><th class="rn"></th>' + ''.join(
        f'<th class="{"frz1" if c==1 else "frz2" if c==COL_LOCK else ""}">{letter(c)}</th>'
        for c in range(1, LAST_COL+1)) + '</tr>'

    rows = []
    def emit(cells, rowcls=''):
        rows.append(f'<tr class="{rowcls}"><th class="rn">{len(rows)+1}</th>' + ''.join(cells) + '</tr>')

    def pad(cells):
        return cells + [td() for _ in range(LAST_COL - len(cells))]

    # 1행 제목
    emit(pad([td('quick-score · ' + cls, 'title frz1'), td('', 'frz2')]))
    # 2~4행 요약 (C부터)
    def summary(label, vals):
        cs = [td(label, 'lbl frz1'), td('', 'frz2')]
        for j in range(MAX_GROUPS):
            v = vals[j] if (j < len(SIZES) and vals[j] not in (None, '')) else ''
            cs.append(td(v, 'sum'))
        emit(pad(cs), 'sumrow')
    summary('그룹', [f'G{j+1}' for j in range(len(SIZES))])
    summary('누적', tot)
    summary('순위', ['🥇' if x==1 else '🥈' if x==2 else '🥉' if x==3 else x for x in rank])
    # 5행 빈 줄
    emit(pad([td('', 'frz1'), td('', 'frz2')]))
    # 6행 머리글
    hdr = [td('회차', 'hdr frz1'), td('잠금', 'hdr frz2')]
    for i in range(1, N+1): hdr.append(td(f'{i}번', 'hdr'))
    for j in range(MAX_GROUPS): hdr.append(td(f'G{j+1}' if j < len(SIZES) else '', 'hdr avg'))
    emit(pad(hdr), 'hdrrow')
    # 7행~ 회차
    for s in range(1, SHOW_ROWS+1):
        cs = [td(f'{s}회차', 'lbl frz1'),
              td('☑' if s in LOCKED else '☐', 'lock frz2')]
        for i in range(1, N+1):
            v = data[(cls, s)][i-1] if s <= SESSIONS else None
            cs.append(td('' if v is None else v, 'score' + (' absent' if (s <= SESSIONS and v is None) else '')))
        for j in range(MAX_GROUPS):
            v = sess_avg(cls, s, j) if (s <= SESSIONS and j < len(SIZES)) else None
            cs.append(td('' if v is None else v, 'avg'))
        emit(pad(cs))
    return f'<table class="sheet">{head}{"".join(rows)}</table>'

def sheet_config():
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 5)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['반이름', '비밀번호', '학생수', '그룹당인원']) + '</tr>']
    pw = ['3141','2718','1618','1414','2236','1732','2645','1259','5772','6180','9159']
    for i in range(1, 12):
        g = '4,4,4,4,4,5' if i == 1 else '4'
        rows.append(f'<tr><th class="rn">{i+1}</th>' +
                    td(f'{i}반', 'lbl') + td(pw[i-1], 'pw') + td(25 if i % 2 else 24) + td(g) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'

def sheet_log():
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 7)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['시각','반','회차','학생','이전값','새값']) + '</tr>']
    entries = [
        ('2026-08-24 09:14:22','1반','1회차','1번','(없음)',14),
        ('2026-08-24 09:14:22','1반','1회차','2번','(없음)',13),
        ('2026-08-24 09:14:22','1반','1회차','3번','(없음)','(결석)'),
        ('2026-08-24 09:15:03','1반','1회차','5번','(없음)',12),
        ('2026-08-31 09:11:47','1반','2회차','1번','(없음)',15),
        ('2026-08-31 09:20:12','1반','-','그룹구성','4','4,4,4,4,4,5'),
        ('2026-09-07 09:12:55','1반','3회차','7번',11,15),
        ('2026-09-07 09:31:08','1반','-','회차추가','20회차까지','30회차까지'),
    ]
    for i, e in enumerate(entries):
        cls = 'warn' if e[4] not in ('(없음)', '4', '20회차까지') else ''
        rows.append(f'<tr><th class="rn">{i+2}</th>' + ''.join(td(x, cls) for x in e) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'

def sheet_all():
    head = '<tr><th class="rn"></th>' + ''.join(f'<th>{letter(c)}</th>' for c in range(1, 13)) + '</tr>'
    rows = ['<tr class="hdrrow"><th class="rn">1</th>' +
            ''.join(td(x, 'hdr') for x in ['반'] + [f'G{j+1}' for j in range(MAX_GROUPS)] + ['1등']) + '</tr>']
    for i, cls in enumerate(CLASSES):
        tot = [total_avg(cls, g) for g in range(len(SIZES))]
        best = max(range(len(tot)), key=lambda j: tot[j])
        cs = [td(cls, 'lbl')]
        for j in range(MAX_GROUPS):
            cs.append(td(tot[j] if j < len(SIZES) else '', 'avg' + (' best' if j == best else '')))
        cs.append(td(f'G{best+1}', 'lbl'))
        rows.append(f'<tr><th class="rn">{i+2}</th>' + ''.join(cs) + '</tr>')
    for i in range(len(CLASSES), 11):
        rows.append(f'<tr><th class="rn">{i+2}</th>' + td(f'{i+1}반', 'lbl') +
                    ''.join(td() for _ in range(11)) + '</tr>')
    return f'<table class="sheet narrow">{head}{"".join(rows)}</table>'

TABS = [
 ('설정', sheet_config(), '선생님이 손으로 관리하는 유일한 시트입니다. 비밀번호를 바꾸면 즉시 적용되고 재배포가 필요 없습니다. <b>그룹당인원</b>에 <code>4</code>처럼 숫자 하나를 쓰면 자동으로 나누고, <code>4,4,4,4,4,5</code>처럼 쉼표로 쓰면 그대로 씁니다.'),
 ('1반', sheet_class('1반'), '<b>A(회차)와 B(잠금)는 고정</b>이라 오른쪽으로 아무리 스크롤해도 따라옵니다. 회차가 끝나면 <b>잠금</b>에 체크만 하면 그 회차는 도우미가 못 고칩니다.<br><b>2~4행</b>이 열자마자 보이는 요약이고, 세부 점수는 6행 아래입니다. 노란 칸은 전부 수식이라 손댈 필요가 없습니다. 분홍 칸은 결석이라 평균에서 빠집니다.'),
 ('2반', sheet_class('2반'), '반마다 같은 모양의 시트가 하나씩 생깁니다.'),
 ('로그', sheet_log(), '누가 언제 어느 칸을 뭐에서 뭐로 바꿨는지 전부 남습니다. <b>주황색</b>은 이미 있던 값을 고친 기록이라 특히 눈여겨볼 줄입니다. 그룹 구성 변경과 회차 추가도 남습니다.'),
 ('전체', sheet_all(), '반을 옮겨다니지 않고 한눈에 비교합니다. 코드가 아니라 각 반 시트의 누적 행을 그대로 비추는 수식입니다.'),
]

tabs_html = ''.join(f'<button class="tab{" on" if i==1 else ""}" onclick="pick({i})">{t[0]}</button>'
                    for i, t in enumerate(TABS))
panes = ''.join(f'<div class="pane{" on" if i==1 else ""}" id="p{i}">'
                f'<p class="hint">{t[2]}</p><div class="scroll">{t[1]}</div></div>'
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
 header p {{ margin:0; font-size:13px; color:#5f6368; }}
 .tabs {{ display:flex; gap:2px; background:#fff; border-bottom:1px solid #dadce0; padding:0 12px; overflow-x:auto; }}
 .tab {{ border:0; background:none; padding:11px 16px; font-size:14px; color:#5f6368;
         border-bottom:3px solid transparent; cursor:pointer; white-space:nowrap; font-family:inherit; }}
 .tab.on {{ color:#0b8043; border-bottom-color:#0b8043; font-weight:700; }}
 .pane {{ display:none; padding:14px; }} .pane.on {{ display:block; }}
 .hint {{ margin:0 0 12px; font-size:13.5px; line-height:1.75; color:#3c4043;
          background:#fff; border-left:3px solid #0b8043; padding:11px 13px; border-radius:0 8px 8px 0; }}
 .hint code {{ background:#f1f3f4; padding:1px 5px; border-radius:4px; font-size:12.5px; }}
 .scroll {{ overflow-x:auto; background:#fff; border:1px solid #dadce0; border-radius:6px; }}
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
 footer {{ padding:14px 18px 40px; font-size:13px; color:#5f6368; line-height:1.8; }}
</style></head><body>
<header>
  <h1>quick-score · 교사 화면 미리보기</h1>
  <p>실제 구글 스프레드시트가 이렇게 생깁니다. <b>표에 든 숫자는 전부 표본</b>이고, 설치하면 빈 시트로 만들어집니다.</p>
</header>
<div class="tabs">{tabs_html}</div>
{panes}
<footer>
  <b>선생님이 직접 하는 일은 세 가지뿐입니다.</b><br>
  ① <b>설정</b> 시트에 반별 비밀번호 적기 &nbsp; ② 회차가 끝나면 <b>B열 잠금</b>에 체크 &nbsp; ③ <b>전체</b> 시트로 순위 확인<br>
  노란 칸(평균·누적·순위)은 전부 수식이라 건드릴 필요가 없습니다.
</footer>
<script>
function pick(i) {{
  var t = document.querySelectorAll('.tab'), p = document.querySelectorAll('.pane');
  for (var k = 0; k < t.length; k++) {{ t[k].classList.toggle('on', k === i); p[k].classList.toggle('on', k === i); }}
}}
</script>
</body></html>'''

open('docs/teacher.html', 'w', encoding='utf-8').write(html)
print('✅ docs/teacher.html 생성')
