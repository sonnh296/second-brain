/** Lazy read — env may not be loaded at module import time (worker scripts, hot reload). */
export function getCollectionName(): string {
  return process.env.QDRANT_COLLECTION_NAME ?? 'second-brain-v2'
}
