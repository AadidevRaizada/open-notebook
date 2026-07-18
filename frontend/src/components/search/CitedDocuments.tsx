'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  File,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react'

import { sourcesApi } from '@/lib/api/sources'
import { useSource } from '@/lib/hooks/use-sources'
import { parseSourceReferences } from '@/lib/utils/source-references'
import {
  getFileExtension,
  getPreviewKind,
  mimeForFilePath,
} from '@/components/source/file-preview-utils'

/**
 * Attachment cards for the documents cited in an answer — file-backed sources
 * (PDFs, images, spreadsheets, …) render as clickable chips under the message,
 * so the user can open and read the original document in one click instead of
 * hunting for it in the sources list.
 */
export function CitedDocuments({
  content,
  onOpenSource,
}: {
  content: string
  onOpenSource: (id: string) => void
}) {
  const sourceIds = useMemo(() => {
    const seen = new Set<string>()
    const ids: string[] = []
    for (const ref of parseSourceReferences(content)) {
      if (ref.type !== 'source') continue
      const id = ref.id.includes(':') ? ref.id : `source:${ref.id}`
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
    return ids
  }, [content])

  if (sourceIds.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {sourceIds.map((id) => (
        <CitedDocumentCard key={id} sourceId={id} onOpen={() => onOpenSource(id)} />
      ))}
    </div>
  )
}

function iconForExtension(ext: string | null) {
  switch (ext) {
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500" />
    case 'doc':
    case 'docx':
    case 'txt':
    case 'md':
      return <FileText className="h-4 w-4 text-blue-500" />
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileSpreadsheet className="h-4 w-4 text-green-600" />
    case 'ppt':
    case 'pptx':
      return <Presentation className="h-4 w-4 text-orange-500" />
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'avif':
    case 'svg':
      return <ImageIcon className="h-4 w-4 text-purple-500" />
    case 'mp3':
    case 'wav':
    case 'm4a':
      return <FileAudio className="h-4 w-4 text-teal-500" />
    case 'mp4':
    case 'mov':
    case 'webm':
      return <FileVideo className="h-4 w-4 text-pink-500" />
    default:
      return <File className="h-4 w-4 text-muted-foreground" />
  }
}

/** Authenticated blob fetch for image thumbnails; returns an object URL. */
function useImageThumbnail(sourceId: string, enabled: boolean, filePath?: string | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let aborted = false
    let createdUrl: string | null = null

    sourcesApi
      .downloadFile(sourceId, { inline: true })
      .then((response) => {
        const blob = new Blob([response.data], {
          type: response.data.type || mimeForFilePath(filePath) || 'application/octet-stream',
        })
        createdUrl = URL.createObjectURL(blob)
        if (aborted) {
          URL.revokeObjectURL(createdUrl)
          return
        }
        setUrl(createdUrl)
      })
      .catch(() => {
        /* thumbnail is decorative — the type icon fallback covers failures */
      })

    return () => {
      aborted = true
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
      setUrl(null)
    }
  }, [sourceId, enabled, filePath])

  return url
}

function CitedDocumentCard({ sourceId, onOpen }: { sourceId: string; onOpen: () => void }) {
  const { data: source } = useSource(sourceId)

  const filePath = source?.asset?.file_path
  const ext = getFileExtension(filePath)
  const isImage = getPreviewKind(filePath) === 'image'
  const thumbnailUrl = useImageThumbnail(
    sourceId,
    !!source && isImage && source.file_available !== false,
    filePath
  )

  // Only file-backed sources become attachment cards; text/URL sources are
  // already reachable through their citation badges.
  if (!source || !filePath) {
    return null
  }

  const filename = filePath.split(/[/\\]/).pop() || filePath
  const title = source.title || filename

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className="flex min-w-0 max-w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-ring/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[280px]"
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL, next/image not applicable
        <img
          src={thumbnailUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          {iconForExtension(ext)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {ext && (
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {ext}
          </span>
        )}
      </span>
    </button>
  )
}
