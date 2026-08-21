// Index.html 의 날짜 표시 로직 검사
// 실행: node 검사/날짜표시검사.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../Index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
eval(js.slice(js.indexOf('/** \'2026-09-07\''), js.indexOf('var S = {')));

const a = require('assert');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ✅ ' + m); };

t('앞자리 0을 떼고 보여준다', () => {
  a.equal(dateLabel('2026-09-07'), '9월 7일');
  a.equal(dateLabel('2026-01-05'), '1월 5일');
});
t('두 자리 달·일도 그대로', () => {
  a.equal(dateLabel('2026-12-25'), '12월 25일');
  a.equal(dateLabel('2026-10-31'), '10월 31일');
});
t('아직 날짜가 없으면 안내 문구', () => {
  a.equal(dateLabel(''), '날짜 없음');
  a.equal(dateLabel(null), '날짜 없음');
  a.equal(dateLabel(undefined), '날짜 없음');
});
t('모양이 다른 값이 와도 안 죽는다', () => {
  a.equal(dateLabel('2026/09/07'), '2026/09/07');   // 그대로 되돌려준다
  a.equal(dateLabel('아무거나'), '아무거나');
});
t('한 해 모든 날짜가 월·일과 일치한다', () => {
  for (let m = 1; m <= 12; m++) {
    const last = new Date(2026, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const iso = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      a.equal(dateLabel(iso), `${m}월 ${d}일`, iso);
    }
  }
});

console.log('\n통과 ' + n + ' / 실패 0');
