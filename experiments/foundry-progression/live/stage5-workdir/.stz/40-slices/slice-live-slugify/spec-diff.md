---
summary: "Spec diff slice-live-slugify: 16 missing, 6 added, 0 kept."
---

# Spec diff — slice-live-slugify

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (0)
_none_

## ⚠️ Planned but missing (16)
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

## ➕ Built beyond plan (6)
- Throws `TypeError` if input is not a string
- Converts the entire input to lowercase before further processing
- Trims leading and trailing whitespace from the input
- Replaces every sequence of one or more whitespace characters with a single hyphen (`-`)
- Removes all characters that are not letters (a–z), digits (0–9), or hyphens
- Returns the resulting string, which contains only lowercase letters, digits, and hyphens
