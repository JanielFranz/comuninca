/** Pure helpers to derive display data from the signed-in user. */

export function displayName(fullName: string, email: string): string {
  return fullName.trim() || email.trim()
}

export function initialsFor(name: string): string {
  const words = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}
