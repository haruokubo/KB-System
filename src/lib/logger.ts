import * as appInsights from 'applicationinsights'

let started = false

function ensureStarted(): boolean {
  if (started) return true
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  if (!connectionString) return false
  appInsights.setup(connectionString).start()
  started = true
  return true
}

export function logAuditEvent(
  name: string,
  properties: Record<string, string | number | boolean>
): void {
  if (!ensureStarted()) return
  appInsights.defaultClient.trackEvent({ name, properties })
}
