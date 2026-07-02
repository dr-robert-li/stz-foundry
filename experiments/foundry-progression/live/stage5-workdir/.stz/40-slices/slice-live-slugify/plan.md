---
summary: "Intent spec for slice-live-slugify: 16 claims."
---

# Intent spec — slice-live-slugify

- `slugify` returns a string for any valid string input.
- `slugify('Hello World!') === 'hello-world'`.
- `slugify('  Hello   World  ') === 'hello-world'`.
- `slugify('HELLO WORLD') === 'hello-world'`.
- `slugify('a-b-c') === 'a-b-c'`.
- `slugify('12345') === '12345'`.
- `slugify('Hello World 123!@#') === 'hello-world-123'`.
- `slugify('---') === '-'`.
- `slugify('a--b') === 'a-b'`.
- `slugify('') === ''`.
- `slugify` throws a `TypeError` when called with `null`.
- `slugify` throws a `TypeError` when called with `undefined`.
- `slugify` throws a `TypeError` when called with a number.
- `slugify` throws a `TypeError` when called with an object.
- `slugify('a b c') === 'a-b-c'`.
- `slugify('  ') === ''`.
