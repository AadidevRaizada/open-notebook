'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useIsAdmin } from '@/lib/hooks/use-is-admin'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

/**
 * Client-side guard for admin-only pages (models, transformations, advanced).
 * Redirects non-admin users back to /home. This is a UX convenience only;
 * real enforcement lives in the API's require_admin dependency (403).
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoaded } = useIsAdmin()
  const { t } = useTranslation()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isAdmin) {
      toast.error(t('common.adminOnly'))
      router.replace('/home')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isAdmin])

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return <>{children}</>
}
