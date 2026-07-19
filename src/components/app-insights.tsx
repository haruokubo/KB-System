'use client'

import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import { useEffect } from 'react'

let appInsights: ApplicationInsights | undefined

/**
 * Initializes Azure Application Insights client-side telemetry.
 *
 * Split out from the root layout (a server component that exports
 * `metadata`) because App Router forbids `metadata` exports from files
 * marked `'use client'`.
 *
 * No-ops when `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` is unset, so local
 * dev and CI builds don't require a real connection string.
 */
export function AppInsights() {
  useEffect(() => {
    if (!appInsights && process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING) {
      appInsights = new ApplicationInsights({
        config: {
          connectionString: process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING,
        },
      })
      appInsights.loadAppInsights()
      appInsights.trackPageView()
    }
  }, [])

  return null
}
