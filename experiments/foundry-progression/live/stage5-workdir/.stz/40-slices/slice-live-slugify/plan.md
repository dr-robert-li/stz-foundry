---
summary: "Intent spec for slice-live-slugify: 10 claims."
---

# Intent spec — slice-live-slugify

- slugify returns a string for any valid string input
- slugify throws TypeError when called with non-string arguments (e.g., number, null, undefined)
- slugify lowercases all alphabetic characters in the output
- slugify trims leading whitespace from the input before processing
- slugify trims trailing whitespace from the input before processing
- Consecutive whitespace characters are collapsed into a single hyphen `-`
- Characters outside [a-z], [0-9], and `-` are removed from the output
- The `!` character is stripped (not preserved) in the output
- Internal runs of non-alphanumeric, non-hyphen characters produce a single hyphen separator
- slugify('Hello  World!') === 'hello-world'
