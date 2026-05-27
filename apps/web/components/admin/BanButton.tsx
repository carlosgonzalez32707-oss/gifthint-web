'use client'

/**
 * components/admin/BanButton.tsx — GiftHint
 *
 * Client component that calls POST /api/admin/ban-ip to add an IP to the
 * blocklist, or DELETE /api/admin/ban-ip to remove it.
 *
 * Props:
 *   ip       — the IPv4/IPv6 address to act on
 *   mode     — 'ban' (default) or 'unban'
 *   reason?  — optional reason stored in the blocked_ips audit record
 *
 * After a successful action the component forces a full router refresh so the
 * server-rendered table reflects the new state without a manual page reload.
 */

import { useState }   from 'react'
import { useRouter }  from 'next/navigation'

interface BanButtonProps {
  ip:      string
  mode?:   'ban' | 'unban'
  reason?: string
}

export function BanButton({ ip, mode = 'ban', reason }: BanButtonProps) {
  const router             = useRouter()
  const [busy, setBusy]    = useState(false)
  const [error, setError]  = useState<string | null>(null)
  const [done, setDone]    = useState(false)

  const isBan = mode === 'ban'

  async function handleClick() {
    if (busy || done) return
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/ban-ip', {
        method:  isBan ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(isBan ? { ipAddress: ip, reason } : { ipAddress: ip }),
      })

      const data = (await res.json()) as { error?: string; success?: boolean }

      if (!res.ok) {
        if (data.error === 'already_banned') {
          setError('Already banned')
        } else if (data.error === 'not_found') {
          setError('Not in blocklist')
        } else {
          setError(data.error ?? `HTTP ${res.status}`)
        }
        return
      }

      setDone(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <span
        style={{
          fontSize:     '11px',
          fontWeight:   600,
          padding:      '3px 10px',
          borderRadius: '999px',
          background:   isBan ? 'rgba(226, 75, 74, 0.12)' : 'rgba(78, 201, 154, 0.12)',
          color:        isBan ? '#E24B4A' : '#4EC99A',
        }}
      >
        {isBan ? '✓ Banned' : '✓ Unbanned'}
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          fontSize:      '11px',
          fontWeight:    600,
          padding:       '3px 10px',
          borderRadius:  '999px',
          border:        `1px solid ${isBan ? 'rgba(226, 75, 74, 0.35)' : 'rgba(78, 201, 154, 0.35)'}`,
          background:    isBan ? 'rgba(226, 75, 74, 0.10)' : 'rgba(78, 201, 154, 0.10)',
          color:         isBan ? '#E24B4A' : '#4EC99A',
          cursor:        busy ? 'wait' : 'pointer',
          opacity:       busy ? 0.6 : 1,
          transition:    'opacity 150ms',
        }}
      >
        {busy ? '…' : isBan ? 'Ban IP' : 'Unban'}
      </button>
      {error && (
        <span style={{ fontSize: '10px', color: '#E24B4A', paddingLeft: '2px' }}>{error}</span>
      )}
    </span>
  )
}
