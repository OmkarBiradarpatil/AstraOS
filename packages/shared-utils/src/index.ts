export function createRequestId() {
  return crypto.randomUUID()
}

export function normalizeTags(input: string | string[]) {
  const values = Array.isArray(input) ? input : input.split(',')
  return values
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 20)
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
