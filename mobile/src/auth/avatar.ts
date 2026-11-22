export function normalizeAvatarUrl(url?: string | null, size = 256) {
  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/googleusercontent\.com/i.test(trimmed)) {
    if (/=s\d+(?:-c)?(?:-|$)/i.test(trimmed)) {
      return trimmed.replace(/=s\d+(?:-c)?/i, `=s${size}-c`);
    }
    return trimmed.includes('?') ? trimmed : `${trimmed}=s${size}-c`;
  }

  return trimmed;
}
