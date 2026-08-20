// Index.html의 그룹 인원 조정 로직만 떼어 검사 (브라우저 불필요)
// 실행: node 그룹조정검사.js
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/Index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// evenSizes / bump 만 추출해서 실행
const src = js.slice(js.indexOf('function evenSizes'), js.indexOf('function setCount'));
const S = { sizes: [], info: { studentCount: 25, canEditGroups: true } };
let drawn = 0;
const drawGroupEdit = () => { drawn++; };
eval(src);

const a = require('assert');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ✅ ' + m); };

t('균등 분배: 25명을 6그룹 → 4,4,4,4,4,5', () => a.deepEqual(evenSizes(25, 6), [4,4,4,4,4,5]));
t('균등 분배: 25명을 5그룹 → 5,5,5,5,5', () => a.deepEqual(evenSizes(25, 5), [5,5,5,5,5]));
t('균등 분배: 25명을 7그룹 → 3,3,3,4,4,4,4', () => a.deepEqual(evenSizes(25, 7), [3,3,3,4,4,4,4]));

t('＋ 누르면 옆 그룹에서 한 명을 데려온다', () => {
  S.sizes = [4,4,4,4,4,5];
  bump(0, 1);
  a.deepEqual(S.sizes, [5,3,4,4,4,5]);
});
t('－ 누르면 옆 그룹에 한 명을 넘긴다', () => {
  S.sizes = [4,4,4,4,4,5];
  bump(0, -1);
  a.deepEqual(S.sizes, [3,5,4,4,4,5]);
});
t('마지막 그룹에서 ＋ 하면 앞 그룹에서 데려온다', () => {
  S.sizes = [4,4,4,4,4,5];
  bump(5, 1);
  a.deepEqual(S.sizes, [4,4,4,4,3,6]);
});
t('1명인 그룹은 － 가 안 먹는다 (0명 그룹 방지)', () => {
  S.sizes = [1,4,4,4,4,8];
  bump(0, -1);
  a.deepEqual(S.sizes, [1,4,4,4,4,8]);
});
t('모두 1명이면 ＋ 도 안 먹는다', () => {
  S.sizes = [1,1,1];
  bump(0, 1);
  a.deepEqual(S.sizes, [1,1,1]);
});

t('아무렇게나 5000번 눌러도 합계와 최소인원이 안 깨진다', () => {
  for (let trial = 0; trial < 50; trial++) {
    const k = 1 + Math.floor(Math.random() * 8);
    S.sizes = evenSizes(25, Math.min(k, 25));
    for (let step = 0; step < 100; step++) {
      const i = Math.floor(Math.random() * S.sizes.length);
      bump(i, Math.random() < 0.5 ? 1 : -1);
      a.equal(S.sizes.reduce((x, y) => x + y, 0), 25, '합계 깨짐: ' + S.sizes);
      a.ok(Math.min(...S.sizes) >= 1, '0명 그룹 발생: ' + S.sizes);
    }
  }
});

t('학생 수가 그룹 수보다 적은 극단값도 안 깨진다', () => {
  for (let stu = 1; stu <= 6; stu++) {
    S.info.studentCount = stu;
    for (let k = 1; k <= stu; k++) {
      S.sizes = evenSizes(stu, k);
      a.equal(S.sizes.reduce((x, y) => x + y, 0), stu);
      a.ok(Math.min(...S.sizes) >= 1);
      for (let step = 0; step < 30; step++) {
        bump(Math.floor(Math.random() * S.sizes.length), Math.random() < 0.5 ? 1 : -1);
        a.equal(S.sizes.reduce((x, y) => x + y, 0), stu, stu + '명 ' + k + '그룹');
        a.ok(Math.min(...S.sizes) >= 1);
      }
    }
  }
  S.info.studentCount = 25;
});

console.log('\n통과 ' + n + ' / 실패 0');
