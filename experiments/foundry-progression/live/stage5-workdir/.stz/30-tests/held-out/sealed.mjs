---
summary: Sealed held-out test held-out/sealed.mjs (read-only; judge-loaded only).
sealed: true
---

const mod = await import(process.argv[2]);

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    const result = fn();
    if (result === true) {
      passed++;
    } else {
      console.error(`FAIL: ${name}`);
    }
  } catch (e) {
    console.error(`FAIL: ${name} threw ${e.constructor.name}: ${e.message}`);
  }
}

function expectEqual(actual, expected) {
  return actual === expected;
}

// Mechanically applies ONLY the contract's stated rules step-by-step
function applyContractRules(s) {
  if (typeof s !== 'string') throw new TypeError('Input must be a string');
  let r = s.toLowerCase();
  r = r.trim();
  r = r.replace(/\s+/g, '-');
  r = r.replace(/[^a-z0-9-]/g, '');
  return r;
}

test('example from contract', () => {
  const res = mod.slugify('Hello  World!');
  return expectEqual(res, applyContractRules('Hello  World!'));
});

test('empty string', () => {
  const res = mod.slugify('');
  return expectEqual(res, applyContractRules(''));
});

test('whitespace only', () => {
  const res = mod.slugify('   \t\n\r   ');
  return expectEqual(res, applyContractRules('   \t\n\r   '));
});

test('lowercase', () => {
  const res = mod.slugify('ABC');
  return expectEqual(res, applyContractRules('ABC'));
});

test('numbers', () => {
  const res = mod.slugify('123');
  return expectEqual(res, applyContractRules('123'));
});

test('hyphens preserved (not collapsed)', () => {
  const res = mod.slugify('a--b');
  return expectEqual(res, applyContractRules('a--b'));
});

test('consecutive hyphens from whitespace collapse', () => {
  const res = mod.slugify('a - b');
  return expectEqual(res, applyContractRules('a - b'));
});

test('symbols stripped without replacement', () => {
  const res = mod.slugify('hello@world!#123');
  return expectEqual(res, applyContractRules('hello@world!#123'));
});

test('underscores stripped', () => {
  const res = mod.slugify('hello_world');
  return expectEqual(res, applyContractRules('hello_world'));
});

test('accents stripped (not transliterated)', () => {
  const res = mod.slugify('café');
  return expectEqual(res, applyContractRules('café'));
});

test('leading/trailing spaces', () => {
  const res = mod.slugify('  hello world  ');
  return expectEqual(res, applyContractRules('  hello world  '));
});

test('tabs and newlines collapse', () => {
  const res = mod.slugify('a\n\tb');
  return expectEqual(res, applyContractRules('a\n\tb'));
});

test('single hyphen', () => {
  const res = mod.slugify('-');
  return expectEqual(res, applyContractRules('-'));
});

test('multiple hyphens input', () => {
  const res = mod.slugify('---');
  return expectEqual(res, applyContractRules('---'));
});

test('mixed case and symbols', () => {
  const res = mod.slugify('Hello_World-123!');
  return expectEqual(res, applyContractRules('Hello_World-123!'));
});

test('hyphens from spaces around hyphen', () => {
  const res = mod.slugify(' - - ');
  return expectEqual(res, applyContractRules(' - - '));
});

test('multiple words collapse', () => {
  const res = mod.slugify('a b c');
  return expectEqual(res, applyContractRules('a b c'));
});

// TypeError rejection tests
function testTypeError(name, input) {
  total++;
  try {
    mod.slugify(input);
    console.error(`FAIL: ${name} should have thrown TypeError`);
  } catch (e) {
    if (e instanceof TypeError) {
      passed++;
    } else {
      console.error(`FAIL: ${name} threw ${e.constructor.name} instead of TypeError`);
    }
  }
}

testTypeError('null input', null);
testTypeError('undefined input', undefined);
testTypeError('number input', 42);
testTypeError('boolean input', true);
testTypeError('object input', {});
testTypeError('array input', []);
testTypeError('symbol input', Symbol('x'));

const passRate = passed / total;
console.log(JSON.stringify({ passed, total, passRate }));
process.exit(passRate === 1 ? 0 : 1);
