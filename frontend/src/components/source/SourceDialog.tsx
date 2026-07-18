'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SourceDetailContent } from './SourceDetailContent'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface SourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceId: string | null
}

/**
 * Source Dialog Component
 *
 * Displays source details in a modal dialog.
 * Includes a "Chat with source" button that navigates to the full source page in-app.
 * Expands to near-fullscreen when the original-file preview pane is active.
 */
export function SourceDialog({ open, onOpenChange, sourceId }: SourceDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [previewActive, setPreviewActive] = useState(false)
  // Ensure source ID has 'source:' prefix for API calls and routing
  const sourceIdWithPrefix = sourceId
    ? (sourceId.includes(':') ? sourceId : `source:${sourceId}`)
    : null

  useEffect(() => {
    if (!open) {
      setPreviewActive(false)
    }
  }, [open])

  const handleChatClick = () => {
    if (sourceIdWithPrefix) {
      onOpenChange(false)
      router.push(`/sources/${sourceIdWithPrefix}`)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  if (!sourceIdWithPrefix) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex flex-col p-0',
          previewActive
            ? 'max-w-5xl max-h-[90vh] md:w-[96vw] md:max-w-[96vw] md:h-[92vh] md:max-h-[92vh]'
            : 'max-w-5xl max-h-[90vh]'
        )}
      >
        {/* Accessibility title (hidden visually but read by screen readers) */}
        <DialogTitle className="sr-only">{t('sources.detailsTitle')}</DialogTitle>

        {/* Source detail content */}
        <div
          className={cn(
            'flex-1 min-h-0 pt-3',
            previewActive ? 'overflow-hidden' : 'overflow-y-auto'
          )}
        >
          <SourceDetailContent
            sourceId={sourceIdWithPrefix}
            showChatButton={true}
            showCloseButton={true}
            onChatClick={handleChatClick}
            onClose={handleClose}
            onPreviewActiveChange={setPreviewActive}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
