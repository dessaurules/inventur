#!/usr/bin/env node
/**
 * Einmalig oder in CI: gleiche Logik wie Server-Start-Bootstrap.
 * Nutzung: TENANT_BOOTSTRAP_ON_START=1 node scripts/bootstrap-tenant.mjs
 * (oder alle Variablen in .env)
 */
import 'dotenv/config'
import { runTenantBootstrap } from '../lib/tenantBootstrap.mjs'

process.env.TENANT_BOOTSTRAP_ON_START = process.env.TENANT_BOOTSTRAP_ON_START || '1'

const r = await runTenantBootstrap(process.env)
for (const line of r.steps || []) {
  console.log(`[bootstrap] ${line}`)
}
if (r.skipped) {
  console.log('[bootstrap] übersprungen:', r.reason)
  process.exit(0)
}
if (!r.ok) {
  console.error('[bootstrap] Fehler:', r.error)
  process.exit(1)
}
console.log('[bootstrap] fertig.')
process.exit(0)
