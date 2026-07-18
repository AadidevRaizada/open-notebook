export type PreviewKind = 'pdf' | 'image'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'])

const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

export function getFileExtension(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  const segments = filePath.split(/[/\\]/)
  const filename = segments[segments.length - 1]
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null
  return filename.slice(dotIndex + 1).toLowerCase()
}

export function getPreviewKind(filePath: string | null | undefined): PreviewKind | null {
  const ext = getFileExtension(filePath)
  if (!ext) return null
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return null
}

export function mimeForFilePath(filePath: string | null | undefined): string | null {
  const ext = getFileExtension(filePath)
  if (!ext) return null
  return EXTENSION_MIME_TYPES[ext] ?? null
}
