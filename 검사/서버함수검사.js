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

t('스스로를 무한히 부르는 함수가 없다', () => {
  // 이름을 일괄 치환하다 함수 본문 안까지 바꿔 무한 재귀를 만든 적이 있다
  for (const m of all.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*{/g)) {
    const name = m[1];
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < all.length && depth > 0) {
      if (all[i] === '{') depth++;
      else if (all[i] === '}') depth--;
      i++;
    }
    const body = all.slice(start, i);
    const self = (body.match(new RegExp('\\b' + name + '\\s*\\(', 'g')) || []).length;
    // 재귀가 필요한 함수는 지금 없다. 생기면 여기에 예외로 적는다
    a.equal(self, 0, name + ' 이 자기 자신을 ' + self + '번 부른다');
  }
});

t('빈 시트에서 범위를 만들려는 곳이 없다', () => {
  // getLastRow() 가 0이면 getRange(1,1,0,1) 이 되어
  // "범위에 속한 행의 개수는 1개 이상이어야 합니다" 로 죽는다
  const bad = [...all.matchAll(/getRange\(\s*1\s*,\s*1\s*,\s*(\w+)\.getLastRow\(\)/g)]
    .filter(m => {
      const before = all.slice(Math.max(0, m.index - 120), m.index);
      return !before.includes('getLastRow() < 1');
    })
    .map(m => m[0]);
  a.deepEqual(bad, [], '0행일 때를 안 막은 곳: ' + bad.join(', '));
});

t('매니페스트에 start_url 이 없다', () => {
  // start_url 을 적으면 홈 화면 아이콘이 그 주소로 열려 ?u= 가 잘린다.
  // 그러면 앱이 어느 스프레드시트로 갈지 몰라 주소 입력 화면이 뜬다
  const m = JSON.parse(fs.readFileSync(dir + '/docs/manifest.webmanifest', 'utf8'));
  a.equal(m.start_url, undefined, 'start_url 이 들어가면 ?u= 가 잘린다');
});

console.log('\n통과 ' + n + ' / 실패 0');
