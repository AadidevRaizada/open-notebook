'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { sourcesApi } from '@/lib/api/sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import { mimeForFilePath, PreviewKind } from './file-preview-utils'

interface SourceFilePreviewProps {
  sourceId: string
  filePath: string
  previewKind: PreviewKind
  title?: string
  onUnavailable?: () => void
}

/**
 * Renders the original uploaded file (PDF via the browser's native viewer,
 * images via <img>) from an authenticated blob fetch. The API requires a
 * Bearer token, so the file is fetched through axios and exposed to the
 * iframe/img through an object URL.
 */
export function SourceFilePreview({
  sourceId,
  filePath,
  previewKind,
  title,
  onUnavailable,
}: SourceFilePreviewProps) {
  const { t } = useTranslation()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let aborted = false
    let createdUrl: string | null = null

    setObjectUrl(null)
    setFailed(false)
    setLoading(true)

    const fetchFile = async () => {
      try {
        const response = await sourcesApi.downloadFile(sourceId, { inline: true })
        const blob = new Blob([response.data], {
          type: response.data.type || mimeForFilePath(filePath) || 'application/octet-stream',
        })
        createdUrl = URL.createObjectURL(blob)
        if (aborted) {
          URL.revokeObjectURL(createdUrl)
          return
        }
        setObjectUrl(createdUrl)
      } catch (err) {
        if (aborted) return
        console.error('Failed to load file preview:', err)
        if (isAxiosError(err) && err.response?.status === 404) {
          onUnavailable?.()
        } else {
          setFailed(true)
        }
      } finally {
        if (!aborted) {
          setLoading(false)
        }
      }
    }

    void fetchFile()

    return () => {
      aborted = true
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
    // onUnavailable intentionally omitted: refetching on callback identity changes
    // would reload the file on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, filePath, reloadKey])

  const handleRetry = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <LoadingSpinner />
        <p className="text-sm">{t('sources.previewLoading')}</p>
      </div>
    )
  }

  if (failed || !objectUrl) {
    if (!failed) {
      // 404 path: parent collapses the pane via onUnavailable; render nothing meanwhile.
      return null
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{t('sources.previewFailed')}</p>
        <Button size="sm" variant="outline" onClick={handleRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (previewKind === 'pdf') {
    return (
      <iframe
        src={objectUrl}
        title={title || t('sources.filePreview')}
        className="h-full w-full border-0"
      />
    )
  }

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-muted/30 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- object URL, next/image not applicable */}
      <img
        src={objectUrl}
        alt={title || t('sources.filePreview')}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  )
}
