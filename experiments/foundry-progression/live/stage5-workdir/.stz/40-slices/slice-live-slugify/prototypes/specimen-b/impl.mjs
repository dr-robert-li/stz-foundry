export function slugify(s) {
  if (typeof s !== 'string') throw new TypeError();

  let lower = s.toLowerCase();
  let result = '';
  let prevWasWhitespace = true;

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];

    if (/\s/.test(ch)) {
      if (!prevWasWhitespace) {
        result += '-';
      }
      prevWasWhitespace = true;
    } else if (/[a-z0-9]/.test(ch)) {
      result += ch;
      prevWasWhitespace = false;
    } else {
      prevWasWhitespace = false;
    }
  }

  return result;
}
