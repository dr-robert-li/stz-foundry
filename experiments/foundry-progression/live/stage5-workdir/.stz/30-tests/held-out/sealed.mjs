---
summary: Sealed held-out test held-out/sealed.mjs (read-only; judge-loaded only).
sealed: true
---

const mod = await import(process.argv[2]);
let passed = 0;
let total = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function test(name, fn) {
  total++;
  try { fn(); passed++; } catch {}
}

test('throws on null', () => {
  try { mod.slugify(null); throw new Error('no throw'); } catch(e) { if (!(e instanceof TypeError)) throw e; }
});
test('throws on undefined', () => {
  try { mod.slugify(undefined); throw new Error('no throw'); } catch(e) { if (!(e instanceof TypeError)) throw e; }
});
test('throws on number', () => {
  try { mod.slugify(123); throw new Error('no throw'); } catch(e) { if (!(e instanceof TypeError)) throw e; }
});
test('throws on boolean', () => {
  try { mod.slugify(true); throw new Error('no throw'); } catch(e) { if (!(e instanceof TypeError)) throw e; }
});
test('throws on object', () => {
  try { mod.slugify({}); throw new Error('no throw'); } catch(e) { if (!(e instanceof TypeError)) throw e; }
});

test('lowercases and trims whitespace', () => {
  assert(mod.slugify('  HELLO  ') === 'hello');
});
test('collapses internal whitespace runs to single hyphen', () => {
  assert(mod.slugify('a   b') === 'a-b');
});
test('strips non-alphanumeric and non-hyphen characters', () => {
  assert(mod.slugify('hello!@#world') === 'helloworld');
});
test('preserves hyphens', () => {
  assert(mod.slugify('a-b') === 'a-b');
});
test('returns empty string for empty input', () => {
  assert(mod.slugify('') === '');
});
test('returns empty string for whitespace-only input', () => {
  assert(mod.slugify('   ') === '');
});
test('returns empty string for special-char-only input', () => {
  assert(mod.slugify('!@#$%') === '');
});
test('preserves numbers', () => {
  assert(mod.slugify('test 123') === 'test-123');
});
test('collapses tabs and newlines', () => {
  assert(mod.slugify('a\t\nb') === 'a-b');
});
test('preserves already slugified string', () => {
  assert(mod.slugify('hello-world') === 'hello-world');
});
test('preserves hyphens at edges after trim', () => {
  assert(mod.slugify('  -a-  ') === '-a-');
});
test('preserves multiple hyphens', () => {
  assert(mod.slugify('a--b') === 'a--b');
});
test('single uppercase char', () => {
  assert(mod.slugify('A') === 'a');
});
test('single digit', () => {
  assert(mod.slugify('1') === '1');
});
test('single space', () => {
  assert(mod.slugify(' ') === '');
});
test('underscore stripped', () => {
  assert(mod.slugify('hello_world') === 'helloworld');
});
test('dot stripped', () => {
  assert(mod.slugify('hello.world') === 'helloworld');
});
test('comma stripped', () => {
  assert(mod.slugify('a,b') === 'ab');
});
test('slash stripped', () => {
  assert(mod.slugify('a/b') === 'ab');
});
test('ampersand stripped', () => {
  assert(mod.slugify('a&b') === 'ab');
});
test('mixed case and spaces (contract example)', () => {
  assert(mod.slugify('Hello  World!') === 'hello-world');
});

const passRate = passed / total;
console.log(JSON.stringify({ passed, total, passRate }));
process.exit(passRate === 1 ? 0 : 1);
