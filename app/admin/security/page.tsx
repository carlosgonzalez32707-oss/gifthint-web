/**
 * app/admin/security/page.tsx — GiftHint Security Monitoring Panel
 *
 * Server component. Renders three sections:
 *   1. Top Abusive IPs — reads from the `top_abusive_ips` view (last 7 days)
 *   2. Suspicious Events — recent rows from `suspicious_events` table
 *   3. Blocked IPs      — currently active rows from `blocked_ips` table
 *
 * Auth:
 *   Middleware gates /admin/* on the `gh_admin` cookie.
 *   This page does a secondary in-page check and redirects to / on failure.
 *
 * Client interactivity:
 *   BanButton — calls POST /api/admin/ban-ip to add to the Redis+DB blocklist
 *   Unban     — calls DELETE /api/admin/ban-ip to remove from the blocklist
 */

import { cookies }            from 'next/headers'
import { redirect }           from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { BanButton }          from '@/components/admin/BanButton'
import { tokens }             from '@/tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AbusiveIpRow {
  ip_address:   string
  event_count:  number
  event_types:  string[]
  last_seen_at: string
}

interface SuspiciousEventRow {
  id:           string
  event_type:   string
  ip_address:   string
  metadata:     Record<string, unknown>
  created_at:   string
  reviewed:     boolean
}

interface BlockedIpRow {
  id:           string
  ip_address:   string
  reason:       string | null
  created_at:   string
  created_by:   string | null
  active:       boolean
  unbanned_at:  string | null
  unbanned_by:  string | null
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAbusiveIps(
  supabase: ReturnType<typeof createServerClient>,
): Promise<AbusiveIpRow[]> {
  const { data, error } = await supabase
    .from('top_abusive_ips')
    .select('ip_address, event_count, event_types, last_seen_at')
    .order('event_count', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[security] top_abusive_ips error:', error.message)
    return []
  }

  return (data ?? []) as AbusiveIpRow[]
}

async function fetchSuspiciousEvents(
  supabase: ReturnType<typeof createServerClient>,
): Promise<SuspiciousEventRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('suspicious_events')
    .select('id, event_type, ip_address, metadata, created_at, reviewed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[security] suspicious_events error:', error.message)
    return []
  }

  return (data ?? []) as SuspiciousEventRow[]
}

async function fetchBlockedIps(
  supabase: ReturnType<typeof createServerClient>,
): Promise<BlockedIpRow[]> {
  const { data, error } = await supabase
    .from('blocked_ips')
    .select('id, ip_address, reason, created_at, created_by, active, unbanned_at, unbanned_by')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[security] blocked_ips error:', error.message)
    return []
  }

  return (data ?? []) as BlockedIpRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month:   'short',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  })
}

function eventTypeBadge(type: string): { bg: string; color: string; label: string } {
  switch (type) {
    case 'click_fraud':    return { bg: 'rgba(226, 75, 74, 0.12)',  color: '#E24B4A', label: 'Click Fraud' }
    case 'fake_views':     return { bg: 'rgba(245, 169, 78, 0.12)', color: '#F5A94E', label: 'Fake Views' }
    case 'claim_spam':     return { bg: 'rgba(244, 114, 182, 0.12)', color: '#F472B6', label: 'Claim Spam' }
    case 'email_harvest':  return { bg: 'rgba(139, 131, 240, 0.13)', color: '#8B83F0', label: 'Email Harvest' }
    default:               return { bg: 'rgba(122, 120, 112, 0.15)', color: '#7A7870', label: type }
  }
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background:   tokens.colors.surface,
  borderRadius: tokens.radius.lg,
  border:       `1px solid ${tokens.colors.border}`,
  overflow:     'hidden',
}

const th: React.CSSProperties = {
  padding:       '8px 16px',
  textAlign:     'left',
  fontSize:      '10px',
  fontWeight:    700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color:         tokens.colors.muted,
  borderBottom:  `1px solid ${tokens.colors.border}`,
  background:    tokens.colors.surface,
  whiteSpace:    'nowrap',
}

const td: React.CSSProperties = {
  padding:   '10px 16px',
  fontSize:  '12px',
  color:     tokens.colors.text,
  borderBottom: `1px solid ${tokens.colors.border}`,
  verticalAlign: 'middle',
}

const monoIp: React.CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize:   '12px',
  color:      tokens.colors.text,
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function SecurityPage() {
  // ── Auth guard (secondary check after middleware) ──────────────────────────
  const cookieStore    = await cookies()
  const adminCookie    = cookieStore.get('gh_admin')
  const configSecret   = process.env.ADMIN_SECRET
  if (!adminCookie || !configSecret || adminCookie.value !== configSecret) {
    redirect('/')
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin'

  // ── Fetch in parallel ──────────────────────────────────────────────────────
  const supabase = createServerClient()
  const [abusiveIps, suspiciousEvents, blockedIps] = await Promise.all([
    fetchAbusiveIps(supabase),
    fetchSuspiciousEvents(supabase),
    fetchBlockedIps(supabase),
  ])

  const activeBlocked = blockedIps.filter((r) => r.active)
  const blockedIpSet  = new Set(activeBlocked.map((r) => r.ip_address))

  // Group suspicious events by type for the summary bar
  const eventCounts = suspiciousEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] ?? 0) + 1
    return acc
  }, {})

  return (
    <main
      style={{
        minHeight:  '100vh',
        background: tokens.colors.bg,
        color:      tokens.colors.text,
        fontFamily: tokens.font.sans,
        padding:    '32px 24px 80px',
        maxWidth:   '1200px',
        margin:     '0 auto',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <a
                href="/admin"
                style={{
                  fontSize:   '12px',
                  color:      tokens.colors.muted,
                  textDecoration: 'none',
                }}
              >
                ← Dashboard
              </a>
            </div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              Security Monitoring
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: tokens.colors.muted }}>
              Admin: {adminEmail} · Last 7 days · {activeBlocked.length} IP{activeBlocked.length !== 1 ? 's' : ''} blocked
            </p>
          </div>
          <span
            style={{
              fontSize:     '11px',
              fontWeight:   600,
              padding:      '4px 10px',
              borderRadius: tokens.radius.pill,
              background:   'rgba(226, 75, 74, 0.12)',
              color:        '#E24B4A',
              border:       '1px solid rgba(226, 75, 74, 0.28)',
            }}
          >
            SECURITY
          </span>
        </div>
      </header>

      {/* ── Summary chips ─────────────────────────────────────────────────────── */}
      {suspiciousEvents.length > 0 && (
        <section style={{ marginBottom: '28px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {Object.entries(eventCounts).map(([type, count]) => {
            const badge = eventTypeBadge(type)
            return (
              <div
                key={type}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '6px',
                  padding:      '6px 14px',
                  borderRadius: tokens.radius.pill,
                  background:   badge.bg,
                  border:       `1px solid ${badge.color}44`,
                  fontSize:     '12px',
                  fontWeight:   600,
                  color:        badge.color,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{count}</span>
                {badge.label}
              </div>
            )
          })}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              padding:      '6px 14px',
              borderRadius: tokens.radius.pill,
              background:   'rgba(226, 75, 74, 0.10)',
              border:       '1px solid rgba(226, 75, 74, 0.28)',
              fontSize:     '12px',
              fontWeight:   600,
              color:        '#E24B4A',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '14px' }}>{activeBlocked.length}</span>
            Blocked
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Section 1 — Top Abusive IPs
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: '36px' }}>
        <SectionLabel>Top Abusive IPs — Last 7 Days</SectionLabel>
        <div style={card}>
          {abusiveIps.length === 0 ? (
            <EmptyState message="No suspicious activity in the last 7 days" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>IP Address</th>
                  <th style={{ ...th, textAlign: 'right' }}>Events</th>
                  <th style={th}>Types</th>
                  <th style={th}>Last Seen</th>
                  <th style={th}>Status</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {abusiveIps.map((row) => {
                  const isBlocked = blockedIpSet.has(row.ip_address)
                  return (
                    <tr key={row.ip_address} style={{ background: row.event_count >= 10 ? 'rgba(226, 75, 74, 0.04)' : undefined }}>
                      <td style={td}>
                        <span style={monoIp}>{row.ip_address}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: row.event_count >= 10 ? '#E24B4A' : row.event_count >= 5 ? '#F5A94E' : tokens.colors.text,
                          }}
                        >
                          {row.event_count}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(row.event_types ?? []).map((type) => {
                            const badge = eventTypeBadge(type)
                            return (
                              <span
                                key={type}
                                style={{
                                  fontSize:     '10px',
                                  fontWeight:   600,
                                  padding:      '2px 7px',
                                  borderRadius: tokens.radius.pill,
                                  background:   badge.bg,
                                  color:        badge.color,
                                }}
                              >
                                {badge.label}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td style={{ ...td, color: tokens.colors.muted }}>
                        {formatDate(row.last_seen_at)}
                      </td>
                      <td style={td}>
                        {isBlocked ? (
                          <span
                            style={{
                              fontSize:     '10px',
                              fontWeight:   600,
                              padding:      '2px 8px',
                              borderRadius: tokens.radius.pill,
                              background:   'rgba(226, 75, 74, 0.12)',
                              color:        '#E24B4A',
                            }}
                          >
                            Blocked
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize:     '10px',
                              fontWeight:   600,
                              padding:      '2px 8px',
                              borderRadius: tokens.radius.pill,
                              background:   'rgba(78, 201, 154, 0.10)',
                              color:        '#4EC99A',
                            }}
                          >
                            Active
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        {isBlocked ? (
                          <BanButton ip={row.ip_address} mode="unban" />
                        ) : (
                          <BanButton
                            ip={row.ip_address}
                            mode="ban"
                            reason={`Auto-flagged: ${row.event_count} suspicious events (${(row.event_types ?? []).join(', ')})`}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          Section 2 — Suspicious Events
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: '36px' }}>
        <SectionLabel>
          Suspicious Events — Last 7 Days ({suspiciousEvents.length})
        </SectionLabel>
        <div style={card}>
          {suspiciousEvents.length === 0 ? (
            <EmptyState message="No suspicious events in the last 7 days" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Time</th>
                  <th style={th}>Type</th>
                  <th style={th}>IP Address</th>
                  <th style={th}>Metadata</th>
                  <th style={th}>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {suspiciousEvents.map((event) => {
                  const badge = eventTypeBadge(event.event_type)
                  return (
                    <tr key={event.id}>
                      <td style={{ ...td, color: tokens.colors.muted, whiteSpace: 'nowrap' }}>
                        {formatDate(event.created_at)}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize:     '10px',
                            fontWeight:   600,
                            padding:      '2px 8px',
                            borderRadius: tokens.radius.pill,
                            background:   badge.bg,
                            color:        badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={monoIp}>{event.ip_address}</span>
                      </td>
                      <td style={{ ...td, maxWidth: '320px' }}>
                        <span
                          style={{
                            fontFamily: tokens.font.mono,
                            fontSize:   '11px',
                            color:      tokens.colors.muted,
                            wordBreak:  'break-all',
                          }}
                        >
                          {JSON.stringify(event.metadata)}
                        </span>
                      </td>
                      <td style={td}>
                        {event.reviewed ? (
                          <span style={{ color: tokens.colors.muted, fontSize: '11px' }}>✓ Reviewed</span>
                        ) : (
                          <span
                            style={{
                              fontSize:     '10px',
                              fontWeight:   600,
                              padding:      '2px 8px',
                              borderRadius: tokens.radius.pill,
                              background:   'rgba(245, 169, 78, 0.12)',
                              color:        '#F5A94E',
                            }}
                          >
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          Section 3 — Blocked IPs
      ═══════════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionLabel>
          Blocked IPs ({activeBlocked.length} active)
        </SectionLabel>
        <div style={card}>
          {blockedIps.length === 0 ? (
            <EmptyState message="No IPs in the blocklist" />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>IP Address</th>
                  <th style={th}>Status</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Banned</th>
                  <th style={th}>By</th>
                  <th style={th}>Unbanned</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {blockedIps.map((row) => (
                  <tr key={row.id} style={{ opacity: row.active ? 1 : 0.5 }}>
                    <td style={td}>
                      <span style={monoIp}>{row.ip_address}</span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize:     '10px',
                          fontWeight:   600,
                          padding:      '2px 8px',
                          borderRadius: tokens.radius.pill,
                          background:   row.active
                            ? 'rgba(226, 75, 74, 0.12)'
                            : 'rgba(122, 120, 112, 0.15)',
                          color:        row.active ? '#E24B4A' : tokens.colors.muted,
                        }}
                      >
                        {row.active ? 'Blocked' : 'Unbanned'}
                      </span>
                    </td>
                    <td style={{ ...td, maxWidth: '280px' }}>
                      <span style={{ color: tokens.colors.muted, fontSize: '11px' }}>
                        {row.reason ?? '—'}
                      </span>
                    </td>
                    <td style={{ ...td, color: tokens.colors.muted, whiteSpace: 'nowrap' }}>
                      {formatDate(row.created_at)}
                    </td>
                    <td style={{ ...td, color: tokens.colors.muted }}>
                      {row.created_by ?? '—'}
                    </td>
                    <td style={{ ...td, color: tokens.colors.muted, whiteSpace: 'nowrap' }}>
                      {row.unbanned_at ? formatDate(row.unbanned_at) : '—'}
                    </td>
                    <td style={td}>
                      {row.active ? (
                        <BanButton ip={row.ip_address} mode="unban" />
                      ) : (
                        <BanButton ip={row.ip_address} mode="ban" reason="Re-banned via admin panel" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin:        '0 0 12px',
        fontSize:      '11px',
        fontWeight:    700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         tokens.colors.muted,
      }}
    >
      {children}
    </p>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding:    '40px 24px',
        textAlign:  'center',
        color:      tokens.colors.muted,
        fontSize:   '13px',
      }}
    >
      {message}
    </div>
  )
}

export const metadata = {
  title:  'Security — GiftHint Admin',
  robots: { index: false, follow: false },
}
