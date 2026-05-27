/**
 * app/privacy/page.tsx — GiftHint Privacy Policy
 *
 * Plain-English privacy policy covering FTC affiliate disclosure,
 * GDPR / CCPA data rights, and Chrome Web Store reviewer requirements.
 *
 * Update LAST_UPDATED before each material revision.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'
import { tokens }        from '@/tokens'

export const metadata: Metadata = {
  title:       'Privacy Policy — GiftHint',
  description: 'How GiftHint collects, uses, and protects your information.',
  robots:      { index: true, follow: true },
}

const LAST_UPDATED  = 'May 11, 2026'
const CONTACT_EMAIL = 'privacy@gifthint.io'

// ── Layout primitives ─────────────────────────────────────────────────────────

function PolicyShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight:  '100vh',
        background: tokens.colors.bg,
        color:      tokens.colors.text,
        fontFamily: tokens.font.sans,
      }}
    >
      {/* Nav */}
      <nav
        style={{
          position:       'sticky',
          top:            0,
          zIndex:         100,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 24px',
          height:         '52px',
          background:     tokens.colors.bg,
          borderBottom:   `1px solid ${tokens.colors.border}`,
        }}
      >
        <Link
          href="/"
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            '7px',
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>🎁</span>
          <span
            style={{
              fontSize:     '14px',
              fontWeight:   800,
              color:        tokens.colors.text,
              letterSpacing: '-0.2px',
            }}
          >
            GiftHint
          </span>
        </Link>

        <Link
          href="/"
          style={{
            fontSize:       '12px',
            color:          tokens.colors.muted,
            textDecoration: 'none',
          }}
        >
          ← Back to home
        </Link>
      </nav>

      {/* Content */}
      <main
        style={{
          maxWidth: '680px',
          margin:   '0 auto',
          padding:  '48px 24px 80px',
        }}
      >
        {children}
      </main>

      {/* Minimal footer */}
      <footer
        style={{
          borderTop:      `1px solid ${tokens.colors.border}`,
          padding:        '16px 24px',
          display:        'flex',
          flexWrap:       'wrap',
          justifyContent: 'center',
          gap:            '16px',
        }}
      >
        {[
          { href: '/privacy', label: 'Privacy Policy'   },
          { href: '/terms',   label: 'Terms of Service' },
          { href: '/',        label: 'Home'              },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              fontSize:       '11.5px',
              color:          tokens.colors.muted,
              textDecoration: 'none',
              opacity:        0.7,
            }}
          >
            {label}
          </Link>
        ))}
      </footer>
    </div>
  )
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        fontSize:     'clamp(26px, 5vw, 34px)',
        fontWeight:   900,
        letterSpacing: '-0.5px',
        color:        tokens.colors.text,
        margin:       '0 0 8px',
        lineHeight:   1.1,
      }}
    >
      {children}
    </h1>
  )
}

function Updated({ date }: { date: string }) {
  return (
    <p
      style={{
        fontSize:     '12px',
        color:        tokens.colors.muted,
        margin:       '0 0 44px',
        opacity:      0.7,
      }}
    >
      Last updated {date}
    </p>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize:     '16px',
        fontWeight:   700,
        color:        tokens.colors.text,
        margin:       '36px 0 10px',
        letterSpacing: '-0.2px',
      }}
    >
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize:   '14px',
        color:      tokens.colors.muted,
        lineHeight: 1.75,
        margin:     '0 0 14px',
      }}
    >
      {children}
    </p>
  )
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{
        margin:     '0 0 14px',
        paddingLeft: '20px',
      }}
    >
      {children}
    </ul>
  )
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        fontSize:   '14px',
        color:      tokens.colors.muted,
        lineHeight: 1.75,
        marginBottom: '4px',
      }}
    >
      {children}
    </li>
  )
}

/** Prominent amber callout box — used for the FTC affiliate disclosure. */
function DisclosureBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      aria-label="Affiliate disclosure"
      style={{
        background:   '#3D2E12',
        border:       `1px solid rgba(245,169,78,0.28)`,
        borderRadius: tokens.radius.lg,
        padding:      '16px 18px',
        margin:       '20px 0 14px',
      }}
    >
      <p
        style={{
          margin:     0,
          fontSize:   '13.5px',
          color:      tokens.colors.amber,
          lineHeight: 1.7,
          fontWeight: 500,
        }}
      >
        {children}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  return (
    <PolicyShell>
      <H1>Privacy Policy</H1>
      <Updated date={LAST_UPDATED} />

      <P>
        GiftHint ("we," "us," or "our") operates the GiftHint browser extension
        and the website at gifthint.io (collectively, the "Service"). This Privacy
        Policy explains what information we collect, how we use it, and what
        choices you have. We've written it in plain English because you deserve
        to understand it.
      </P>

      {/* ── 1. What we collect ──────────────────────────────────────────────── */}
      <H2>1. Information we collect</H2>

      <P>
        <strong style={{ color: tokens.colors.text }}>Account information.</strong>{' '}
        When you sign in with Google we receive your name, email address, and
        profile photo from Google OAuth. We store your name and photo to display
        on your public wishlist page. We never see or store your Google password.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>Wishlist items.</strong>{' '}
        When you click the heart button on a product page, the extension sends the
        product URL, title, price, image URL, and retailer name to our servers so
        we can save the item to your list.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>Gifter interactions.</strong>{' '}
        When someone views your wishlist and claims an item, we store the name they
        provide (or record it as anonymous), and the timestamp of the claim.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>Usage analytics.</strong>{' '}
        We collect anonymised event data (e.g. which CTA buttons are clicked, which
        pages are visited) to understand how people use the Service. This data does
        not include your name, email, or any product data.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>Technical data.</strong>{' '}
        Standard server logs include IP addresses, browser user-agent strings, and
        HTTP referrer headers. We retain raw logs for 30 days then delete them.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>What we do NOT collect.</strong>{' '}
        The browser extension does not read your browsing history, capture
        keystrokes, access your passwords, read page content outside of
        explicitly triggered save actions, or run in the background when the
        extension popup is closed.
      </P>

      {/* ── 2. How we use it ────────────────────────────────────────────────── */}
      <H2>2. How we use your information</H2>

      <UL>
        <LI>To create and display your public wishlist page.</LI>
        <LI>To notify you (if you opt in) when an item is claimed.</LI>
        <LI>To generate and rewrite product links with affiliate tracking codes.</LI>
        <LI>To detect and prevent abuse of the Service.</LI>
        <LI>To improve the product through aggregate, anonymised analytics.</LI>
        <LI>To respond to support requests sent to us by email.</LI>
      </UL>

      <P>
        We do not sell your personal information to third parties. We do not use
        your data for targeted advertising.
      </P>

      {/* ── 3. Affiliate disclosure — PROMINENT per FTC rules ───────────────── */}
      <H2>3. Affiliate link disclosure</H2>

      <DisclosureBox>
        📣 Important: GiftHint earns money through affiliate programs. When a
        gifter clicks a product link on your wishlist and makes a purchase, we
        may receive a small commission from the retailer — at no additional cost
        to the buyer or to you. This is how we keep GiftHint free for everyone.
        Affiliate commissions do not affect which products you can save or how
        they are displayed.
      </DisclosureBox>

      <P>
        We participate in affiliate programs including, but not limited to, the
        Amazon Associates Program, Skimlinks, and direct retailer affiliate
        networks. Product links on wishlist pages may be rewritten to include
        affiliate tracking parameters before the page is displayed. The original
        product URL you saved is always stored and remains accessible.
      </P>

      <P>
        In accordance with the United States Federal Trade Commission (FTC) 16
        CFR Part 255 guidelines on endorsements and testimonials, we disclose
        this material connection on every wishlist page via the footer disclosure
        notice.
      </P>

      {/* ── 4. Cookies & local storage ──────────────────────────────────────── */}
      <H2>4. Cookies and local storage</H2>

      <P>
        The GiftHint website uses a minimal set of cookies:
      </P>

      <UL>
        <LI>
          <strong style={{ color: tokens.colors.text }}>Session cookie</strong> —
          stores your authentication state after you sign in with Google. Expires
          when you sign out or after 30 days of inactivity.
        </LI>
        <LI>
          <strong style={{ color: tokens.colors.text }}>Preference keys</strong> —
          stored in <code>localStorage</code> (not sent to our servers) to remember
          UI preferences such as whether you dismissed the CTA banner.
        </LI>
      </UL>

      <P>
        We do not use advertising cookies, cross-site tracking pixels, or
        third-party analytics cookies. Skimlinks, our affiliate link partner, may
        set its own cookies when a gifter clicks a product link and lands on a
        retailer website. Skimlinks' use of those cookies is governed by the{' '}
        <a
          href="https://skimlinks.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: tokens.colors.purple }}
        >
          Skimlinks Privacy Policy
        </a>
        .
      </P>

      {/* ── 5. Data sharing ─────────────────────────────────────────────────── */}
      <H2>5. How we share your information</H2>

      <P>
        We share personal information only in the following limited circumstances:
      </P>

      <UL>
        <LI>
          <strong style={{ color: tokens.colors.text }}>With service providers.</strong>{' '}
          We use Supabase (database hosting) and Vercel (web hosting). Both are
          contractually bound to process data only on our behalf and not to use
          it for their own purposes.
        </LI>
        <LI>
          <strong style={{ color: tokens.colors.text }}>Public wishlist data.</strong>{' '}
          Your display name, avatar, and saved wishlist items are visible to anyone
          who has your wishlist URL. Do not add items to your list that you would
          not want others to see.
        </LI>
        <LI>
          <strong style={{ color: tokens.colors.text }}>Legal compliance.</strong>{' '}
          We may disclose information if required by law, court order, or to
          protect the rights, safety, or property of GiftHint or others.
        </LI>
      </UL>

      {/* ── 6. Data retention ───────────────────────────────────────────────── */}
      <H2>6. Data retention</H2>

      <P>
        We retain your account data and wishlist items for as long as your account
        is active. If you delete your account, all associated data — including your
        profile, wishlist items, and claim records — is permanently deleted within
        30 days. Server access logs are deleted after 30 days.
      </P>

      {/* ── 7. Your rights ──────────────────────────────────────────────────── */}
      <H2>7. Your rights</H2>

      <P>
        Depending on where you live, you may have rights including:
      </P>

      <UL>
        <LI><strong style={{ color: tokens.colors.text }}>Access</strong> — request a copy of the personal data we hold about you.</LI>
        <LI><strong style={{ color: tokens.colors.text }}>Correction</strong> — ask us to correct inaccurate data.</LI>
        <LI><strong style={{ color: tokens.colors.text }}>Deletion</strong> — ask us to delete your account and associated data.</LI>
        <LI><strong style={{ color: tokens.colors.text }}>Portability</strong> — request your wishlist data in a machine-readable format.</LI>
        <LI><strong style={{ color: tokens.colors.text }}>Objection</strong> — object to certain uses of your data.</LI>
      </UL>

      <P>
        To exercise any of these rights, email us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: tokens.colors.purple }}>
          {CONTACT_EMAIL}
        </a>
        . We will respond within 30 days. We may ask you to verify your identity
        before actioning your request.
      </P>

      {/* ── 8. Children ─────────────────────────────────────────────────────── */}
      <H2>8. Children's privacy</H2>

      <P>
        The Service is not directed to children under the age of 13, and we do
        not knowingly collect personal information from children under 13. If you
        believe a child under 13 has provided personal information to us, please
        contact us and we will delete it promptly.
      </P>

      {/* ── 9. Security ─────────────────────────────────────────────────────── */}
      <H2>9. Security</H2>

      <P>
        We use industry-standard safeguards including TLS encryption in transit,
        encrypted database storage, and access controls that restrict which
        employees and services can access personal data. No method of transmission
        over the internet is 100% secure; we cannot guarantee absolute security,
        but we work hard to protect your data.
      </P>

      {/* ── 10. Changes ─────────────────────────────────────────────────────── */}
      <H2>10. Changes to this policy</H2>

      <P>
        We may update this Privacy Policy from time to time. When we make material
        changes we will update the "Last updated" date at the top of this page. For
        significant changes we will notify registered users by email at least 14
        days before the change takes effect. Continued use of the Service after a
        change constitutes your acceptance of the revised policy.
      </P>

      {/* ── 11. Contact ─────────────────────────────────────────────────────── */}
      <H2>11. Contact us</H2>

      <P>
        Questions about this Privacy Policy or your personal data? We're reachable
        at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: tokens.colors.purple }}>
          {CONTACT_EMAIL}
        </a>
        . We aim to respond within 5 business days.
      </P>
    </PolicyShell>
  )
}
