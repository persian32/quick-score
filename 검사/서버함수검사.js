// Code.gs / Tests.gs 가 서로 모순되지 않는지 검사
// 실행: node 검사/서버함수검사.js
//
// 문법 검사로는 못 잡는 것을 본다:
//   - 메뉴가 부르는 함수가 실제로 있는가
//   - 문서에 적힌 검사 개수가 실제와 맞는가
const fs = require('fs');
const dir = __dirname + '/..';
const code = fs.readFileSync(dir + '/Code.gs', 'utf8');
const tests = fs.readFileSync(dir + '/Tests.gs', 'utf8');
const all = code + '\n' + tests;

const a = require('assert');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ✅ ' + m); };
const defined = f => new RegExp('function\\s+' + f + '\\s*\\(').test(all);

t('메뉴가 부르는 함수가 전부 정의되어 있다', () => {
  const called = [...code.matchAll(/addItem\('[^']+',\s*'(\w+)'\)/g)].map(m => m[1]);
  a.ok(called.length > 0, '메뉴 항목이 하나도 없다');
  const missing = called.filter(f => !defined(f));
  a.deepEqual(missing, [], '정의 안 된 함수를 메뉴가 부름: ' + missing.join(', '));
});

t('메뉴 함수가 부르는 실제 작업 함수도 있다', () => {
  for (const f of ['setup', 'runTests']) a.ok(defined(f), f + ' 가 없다');
});

t('앱(Index.html)이 부르는 서버 함수가 전부 있다', () => {
  const html = fs.readFileSync(dir + '/Index.html', 'utf8');
  const called = [...html.matchAll(/call\('(\w+)'/g)].map(m => m[1]);
  const missing = [...new Set(called)].filter(f => !defined(f));
  a.deepEqual(missing, [], '서버에 없는 함수를 앱이 부름: ' + missing.join(', '));
});

t('sessionCount_ 를 부르는 곳은 전부 반 설정을 넘긴다', () => {
  // 인자를 빠뜨리면 c.n 을 못 읽어 엉뚱한 열을 센다
  const bad = [...code.matchAll(/sessionCount_\(([^)]*)\)/g)]
    .map(m => m[1].trim())
    .filter(args => args.split(',').length < 2);
  a.deepEqual(bad, [], 'sessionCount_ 에 설정을 안 넘긴 곳이 있음');
});

console.log('\n통과 ' + n + ' / 실패 0');
