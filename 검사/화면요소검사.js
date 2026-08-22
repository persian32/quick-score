// Index.html 이 스스로 모순되지 않는지 검사
// 실행: node 검사/화면요소검사.js
//
// 문법 검사로는 못 잡는 것들을 본다:
//   - 코드가 찾는 요소가 화면에 실제로 있는가
//   - 화면이 기대하는 CSS 규칙이 실제로 있는가
//   - onclick 이 부르는 함수가 실제로 있는가
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../Index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.slice(html.indexOf('<body>'));

const a = require('assert');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ✅ ' + m); };

const uniq = arr => [...new Set(arr)];
const grab = (src, re) => uniq([...src.matchAll(re)].map(m => m[1]));

const declaredIds = grab(body, /\bid="([^"]+)"/g);
const usedIds = uniq([
  ...grab(js, /\$\('([^']+)'\)/g),
  ...grab(js, /getElementById\('([^']+)'\)/g),
]);

t('코드가 찾는 요소가 화면에 전부 있다', () => {
  const missing = usedIds.filter(id => !declaredIds.includes(id) && !js.includes(`'` + id + `-' +`));
  a.deepEqual(missing, [], '화면에 없는 요소를 찾고 있음: ' + missing.join(', '));
});

t('화면의 요소를 코드가 이상한 이름으로 찾지 않는다', () => {
  // 문자열을 조합해 만드는 id(sw-0, ab-3 …)는 제외하고 본다
  const dynamic = grab(js, /\$\('([a-z-]+)-' \+/g);
  const orphan = declaredIds.filter(id =>
    !usedIds.includes(id) && !dynamic.some(d => id.startsWith(d)) &&
    !body.includes('for="' + id + '"'));
  // 남는 것이 있어도 오류는 아니다 (CSS 로만 쓰는 요소). 눈에만 보이게 한다
  if (orphan.length) console.log('     (코드가 안 쓰는 요소: ' + orphan.join(', ') + ')');
});

t('onclick 이 부르는 함수가 전부 정의되어 있다', () => {
  // 화면에 직접 쓴 것과, 코드가 문자열로 만들어 붙이는 것 둘 다 본다
  const called = uniq([
    ...grab(body, /on(?:click|input)="(\w+)\(/g),
    ...grab(js, /onclick="(\w+)\(/g),
  ]);
  const missing = called.filter(f => !new RegExp('function\\s+' + f + '\\s*\\(').test(js));
  a.deepEqual(missing, [], '정의 안 된 함수를 부름: ' + missing.join(', '));
});

t('화면이 기대하는 CSS 규칙이 살아 있다', () => {
  // 지우다 범위를 넘겨 스타일이 통째로 날아간 적이 있다. 그때 화면이 무너졌다
  const need = ['#app', '#zoom', '.screen', '.screen.on', '.card', '.slist',
                '.dots', '.dot.now', '.dot.done', '.row', '.sum', '.nav',
                '.grow', '.mini', '.note', '.err', '.tag', '.gavg', '.srow'];
  const missing = need.filter(sel => !css.includes(sel));
  a.deepEqual(missing, [], 'CSS 규칙이 없어짐: ' + missing.join(', '));
});

t('화면(section)이 전부 코드에서 열린다', () => {
  const screens = grab(body, /<section id="([^"]+)" class="screen/g);
  const shown = grab(js, /show\('([^']+)'\)/g);
  const dead = screens.filter(s => !shown.includes(s) && !body.includes(`show('${s}')`));
  a.deepEqual(dead, [], '아무도 안 여는 화면: ' + dead.join(', '));
});

t('CSS 중괄호 짝이 맞는다', () => {
  a.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
});

// 문서에 적힌 Apps Script 검사 개수가 실제와 맞는지 (함수 정의를 세어 틀린 적이 있다)
t('문서의 runTests 검사 개수가 실제와 맞는다', () => {
  const tests = fs.readFileSync(__dirname + '/../Tests.gs', 'utf8');
  const real = (tests.match(/\bcheck\('/g) || []).length;
  for (const doc of ['README.md', '배포안내.md']) {
    const text = fs.readFileSync(__dirname + '/../' + doc, 'utf8');
    for (const m of text.matchAll(/통과 (\d+) \/ 실패 0|runTests` 를 실행합니다 \((\d+)개\)/g)) {
      const said = Number(m[1] || m[2]);
      a.equal(said, real, doc + ' 에 ' + said + '개라고 적혀 있는데 실제는 ' + real + '개');
    }
  }
});

console.log('\n통과 ' + n + ' / 실패 0');
