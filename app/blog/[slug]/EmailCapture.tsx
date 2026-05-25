'use client'

/**
 * app/blog/[slug]/EmailCapture.tsx — GiftHint blog
 *
 * Bottom-of-post email capture CTA.
 * Posts { gifterEmail, wisherUsername: 'blog', occasionDate: null }
 * to /api/reminder-signup (re-uses the reminder infrastructure).
 *
 * Three states: idle → loading → success | error
 */

import React, { useState, useRef } from 'react'

const c = {
  purple:     '#7C3AED',
  purpleGlow: 'rgba(124,58,237,0.40)',
  green:      '#059669',
  border:     'rgba(255,255,255,0.25)',
  muted:      'rgba(255,255,255,0.65)',
}

type State = 'idle' | 'loading' | 'success' | 'error'

export function EmailCapture() {
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = inputRef.current?.value.trim() ?? ''
    if (!email) return

    setState('loading')
    try {
      const res = await fetch('/api/reminder-signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          gifterEmail:    email,
          wisherUsername: 'blog',   // sentinel — signals blog subscription context
        }),
      })

      if (res.ok) {
        setState('success')
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setErrorMsg(body.error === 'invalid_email' ? 'Please enter a valid email address.' : 'Something went wrong. Try again.')
        setState('error')
      }
    } catch {
      setErrorMsg('Something went wrong. Check your connection and try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            10,
        padding:        '28px 24px',
        background:     'rgba(255,255,255,0.12)',
        borderRadius:   16,
        border:         `1px solid ${c.border}`,
        textAlign:      'center',
      }}>
        <span style={{ fontSize: 32 }}>✅</span>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>You&apos;re on the list!</p>
        <p style={{ fontSize: 14, color: c.muted, margin: 0 }}>
          We&apos;ll send you gift ideas and wishlist tips worth reading.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="email"
          required
          placeholder="your@email.com"
          disabled={state === 'loading'}
          style={{
            flex:         '1 1 220px',
            padding:      '12px 16px',
            borderRadius: 10,
            border:       `1.5px solid ${state === 'error' ? '#F87171' : c.border}`,
            background:   'rgba(255,255,255,0.12)',
            color:        '#fff',
            fontSize:     15,
            fontFamily:   'inherit',
            outline:      'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)' }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = state === 'error' ? '#F87171' : c.border }}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          style={{
            flex:         '0 0 auto',
            padding:      '12px 24px',
            borderRadius: 10,
            border:       'none',
            background:   '#fff',
            color:        c.purple,
            fontSize:     15,
            fontWeight:   800,
            fontFamily:   'inherit',
            cursor:       state === 'loading' ? 'wait' : 'pointer',
            transition:   'opacity 150ms',
            opacity:      state === 'loading' ? 0.7 : 1,
          }}
        >
          {state === 'loading' ? 'Subscribing…' : 'Get gift ideas →'}
        </button>
      </div>
      {state === 'error' && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#FCA5A5' }}>{errorMsg}</p>
      )}
    </form>
  )
}
