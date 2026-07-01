import { Database, KeyRound, ShieldCheck, Wand2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { StatCard } from '../../components/ui/StatCard'
import { getLegacyStorageSize, readLegacyStorage } from '../../lib/storage/legacyImport'
import { useCloudReadiness } from '../auth/cloudReadiness'
import { useAuth } from '../auth/useAuth'

const readinessItems = [
  { label: 'Workspace shell', value: 100 },
  { label: 'Daily modules', value: 80 },
  { label: 'Cloud sync', value: 35 },
  { label: 'Release hardening', value: 20 },
]

export function SettingsPage() {
  const { user } = useAuth()
  const cloud = useCloudReadiness()
  const clerkReady = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  const legacySnapshot = readLegacyStorage()
  const legacySize = getLegacyStorageSize(legacySnapshot)

  return (
    <div className="page-grid">
      <section className="hero-band">
        <p className="eyebrow">Settings</p>
        <h2>Manage identity, cloud sync, and workspace migration details.</h2>
        <p>
          Local mode stays available for development while production sync is controlled through
          environment configuration.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="User" value={user?.name ?? 'Demo'} sub={user?.role ?? 'student'} tone="cyan" />
        <StatCard label="Cloud Sync" value={cloud.ready ? 'Ready' : cloud.apiConfigured ? 'Auth required' : 'Off'} sub="AstraOS API" tone={cloud.tone} />
        <StatCard label="Legacy Data" value={`${(legacySize / 1024).toFixed(1)} KB`} sub={`${legacySnapshot.length} key(s)`} tone="violet" />
        <StatCard label="Mode" value={cloud.label} sub={cloud.detail} tone={cloud.tone} />
      </div>

      <div className="two-column">
        <Card title="Environment" eyebrow="Deployment readiness">
          <div className="settings-list">
            <article>
              <Database size={18} />
              <div>
                <strong>API base URL</strong>
                <p>{cloud.apiConfigured ? 'Configured' : 'Set VITE_API_BASE_URL before cloud sync.'}</p>
              </div>
            </article>
            <article>
              <KeyRound size={18} />
              <div>
                <strong>Clerk publishable key</strong>
                <p>{clerkReady ? 'Configured' : 'Set VITE_CLERK_PUBLISHABLE_KEY for signed-in data.'}</p>
              </div>
            </article>
            <article>
              <ShieldCheck size={18} />
              <div>
                <strong>Security model</strong>
                <p>{cloud.ready ? 'Protected API ownership checks are active for this session.' : 'Clerk session and backend ownership checks are required before cloud persistence.'}</p>
              </div>
            </article>
          </div>
        </Card>

        <Card title="Migration Readiness" eyebrow="Phase control">
          <div className="stack">
            {readinessItems.map((item) => (
              <ProgressBar key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Legacy Browser Data" eyebrow="Import source">
        {legacySnapshot.length ? (
          <div className="item-list compact">
            {legacySnapshot.map((item) => (
              <article className="data-row" key={item.key}>
                <span>{item.key}</span>
                <strong>{(item.byteLength / 1024).toFixed(1)} KB</strong>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No legacy keys detected"
            body="The importer scans known AstraOS prefixes when old localStorage data exists."
            icon={<Wand2 size={26} />}
          />
        )}
      </Card>
    </div>
  )
}
