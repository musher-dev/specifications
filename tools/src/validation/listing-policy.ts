/** Shared listing policy, applied independently by validation and rendering. */
export const MEDIA_PATH =
  /^media\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:[Pp][Nn][Gg]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg]|[Ww][Ee][Bb][Pp])$/

const PERMITTED_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

export function schemeIsPermitted(destination: string): boolean {
  if (destination.startsWith('#')) return true
  try {
    return PERMITTED_SCHEMES.has(new URL(destination).protocol)
  } catch {
    return false
  }
}
