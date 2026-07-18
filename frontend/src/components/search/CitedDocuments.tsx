'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  File,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react'

import { insightsApi } from '@/lib/api/insights'
import { notesApi } from '@/lib/api/notes'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { sourcesApi } from '@/lib/api/sources'
import { useSource } from '@/lib/hooks/use-sources'
import { parseSourceReferences } from '@/lib/utils/source-references'
import {
  getFileExtension,
  getPreviewKind,
  mimeForFilePath,
} from '@/components/source/file-preview-utils'

const withPrefix = (prefix: string, id: string) =>
  id.includes(':') ? id : `${prefix}:${id}`

/** Direct `source:` refs in a piece of text, normalized to full record ids. */
function directSourceIds(text: string): string[] {
  return parseSourceReferences(text)
    .filter((ref) => ref.type === 'source')
    .map((ref) => withPrefix('source', ref.id))
}

/**
 * Attachment cards for the documents cited in an answer — file-backed sources
 * (PDFs, images, spreadsheets, …) render as clickable chips under the message,
 * so the user can open and read the original document in one click instead of
 * hunting for it in the sources list.
 *
 * Citations to notes and insights are resolved to the sources behind them:
 * a cited insight belongs to a source, and a cited note usually embeds
 * `source:` refs in its content — those documents surface here too.
 */
export function CitedDocuments({
  content,
  onOpenSource,
}: {
  content: string
  onOpenSource: (id: string) => void
}) {
  const refs = useMemo(() => parseSourceReferences(content), [content])

  const noteIds = useMemo(
    () =>
      [...new Set(refs.filter((r) => r.type === 'note').map((r) => withPrefix('note', r.id)))],
    [refs]
  )
  const insightIds = useMemo(
    () =>
      [
        ...new Set(
          refs.filter((r) => r.type === 'source_insight').map((r) => withPrefix('source_insight', r.id))
        ),
      ],
    [refs]
  )

  const noteQueries = useQueries({
    queries: noteIds.map((id) => ({
      queryKey: QUERY_KEYS.note(id),
      queryFn: () => notesApi.get(id),
      staleTime: 60 * 1000,
    })),
  })
  const insightQueries = useQueries({
    queries: insightIds.map((id) => ({
      queryKey: ['insights', id],
      queryFn: () => insightsApi.get(id),
      staleTime: 60 * 1000,
    })),
  })

  // Direct source refs first, then sources found behind cited notes/insights.
  const seen = new Set<string>()
  const sourceIds: string[] = []
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id)
      sourceIds.push(id)
    }
  }
  refs.filter((r) => r.type === 'source').forEach((r) => push(withPrefix('source', r.id)))
  noteQueries.forEach((q) => {
    if (q.data?.content) directSourceIds(q.data.content).forEach(push)
  })
  insightQueries.forEach((q) => {
    if (q.data?.source_id) push(withPrefix('source', q.data.source_id))
  })

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
