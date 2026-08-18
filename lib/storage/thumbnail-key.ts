export function documentThumbnailKey(userId: string, documentId: string): string {
  return `${userId}/${documentId}/thumb.jpg`
}
