export function slugify(s) {
  if (typeof s !== 'string') throw new TypeError();

  let result = s.toLowerCase();
  result = result.trim();
  result = result.replace(/\s+/g, '-');
  result = result.replace(/[^a-z0-9-]/g, '');

  return result;
}
