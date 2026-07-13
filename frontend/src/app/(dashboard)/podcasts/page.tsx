'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Podcasts feature is currently hidden from the UI. The route is guarded
// here (rather than deleted) so the feature can be re-enabled later by
// restoring the previous implementation from version control, without
// having to rebuild nav entries, components, or API calls.
export default function PodcastsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/sources')
  }, [router])

  return null
}
