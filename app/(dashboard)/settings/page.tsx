import { Suspense } from 'react'
import { SettingsPage } from '@/components/settings/settings-page'

export default function SettingsRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <SettingsPage />
    </Suspense>
  )
}
