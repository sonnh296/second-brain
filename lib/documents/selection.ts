/** Inclusive range of visible ids from the last clicked item to the current one. */
export function rangeSelectIds(
  orderedIds: string[],
  anchorId: string | null,
  targetId: string,
): string[] {
  if (orderedIds.length === 0) return [targetId]

  const targetIndex = orderedIds.indexOf(targetId)
  if (targetIndex === -1) return [targetId]

  const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1
  if (anchorIndex === -1) return [targetId]

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return orderedIds.slice(start, end + 1)
}
