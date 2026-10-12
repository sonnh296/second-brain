/** Split "report.final.pdf" → { base: "report.final", ext: ".pdf" }. Dotfiles keep all as base. */
export function splitFilename(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.')
  if (i <= 0) return { base: filename, ext: '' }
  return { base: filename.slice(0, i), ext: filename.slice(i) }
}

/** Stem when extension is locked so clearing the name does not swallow the ext. */
export function filenameStem(filename: string, lockedExt: string): string {
  if (lockedExt && filename.endsWith(lockedExt)) {
    return filename.slice(0, -lockedExt.length)
  }
  return splitFilename(filename).base
}
