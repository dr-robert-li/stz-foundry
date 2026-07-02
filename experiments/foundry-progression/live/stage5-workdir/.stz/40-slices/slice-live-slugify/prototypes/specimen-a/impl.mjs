export function slugify(s) {
  if (typeof s !== 'string') throw new TypeError();

  let result = s.toLowerCase().trim();

  // Collapse all whitespace runs into single hyphens
  result = result.replace(/\s+/g, '-');

  // Strip every character that is not a-z, 0-9, or hyphen
  result = result.replace(/[^a-z0-9-]/g, '');

  return result;
}
