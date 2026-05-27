/**
 * app/terms/page.tsx — GiftHint Terms of Service
 *
 * Plain-English ToS covering service description, acceptable use,
 * affiliate relationship, liability limits, and change policy.
 *
 * Update LAST_UPDATED before each material revision.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'
import { tokens }        from '@/tokens'

export const metadata: Metadata = {
  title:       'Terms of Service — GiftHint',
  description: 'The rules and terms that govern your use of GiftHint.',
  robots:      { index: true, follow: true },
}

const LAST_UPDATED  = 'May 11, 2026'
const CONTACT_EMAIL = 'legal@gifthint.io'

// ── Layout primitives (identical shell to privacy page) ───────────────────────
// Defined locally so neither page imports the other — each page is standalone.

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

      <main
        style={{
          maxWidth: '680px',
          margin:   '0 auto',
          padding:  '48px 24px 80px',
        }}
      >
        {children}
      </main>

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
    <p style={{ fontSize: '12px', color: tokens.colors.muted, margin: '0 0 44px', opacity: 0.7 }}>
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
    <p style={{ fontSize: '14px', color: tokens.colors.muted, lineHeight: 1.75, margin: '0 0 14px' }}>
      {children}
    </p>
  )
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul style={{ margin: '0 0 14px', paddingLeft: '20px' }}>{children}</ul>
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ fontSize: '14px', color: tokens.colors.muted, lineHeight: 1.75, marginBottom: '4px' }}>
      {children}
    </li>
  )
}

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
      <p style={{ margin: 0, fontSize: '13.5px', color: tokens.colors.amber, lineHeight: 1.7, fontWeight: 500 }}>
        {children}
      </p>
    </div>
  )
}

/** Muted callout box — used for liability limitations. */
function NoteBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background:   tokens.colors.surface2,
        border:       `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radius.lg,
        padding:      '14px 18px',
        margin:       '20px 0 14px',
      }}
    >
      <p style={{ margin: 0, fontSize: '13px', color: tokens.colors.muted, lineHeight: 1.7 }}>
        {children}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TermsPage() {
  return (
    <PolicyShell>
      <H1>Terms of Service</H1>
      <Updated date={LAST_UPDATED} />

      <P>
        Welcome to GiftHint. By installing the GiftHint browser extension or
        using the GiftHint website (gifthint.io), you agree to these Terms of
        Service ("Terms"). Please read them carefully. If you do not agree, do
        not use the Service.
      </P>

      {/* ── 1. Service description ──────────────────────────────────────────── */}
      <H2>1. What GiftHint is</H2>

      <P>
        GiftHint is a wishlist service that lets users ("wishers") save product
        links from any website using a browser extension and share a curated
        wishlist page with friends and family ("gifters"). GiftHint is operated
        by GiftHint ("we," "us," or "our").
      </P>

      <P>
        The Service consists of:
      </P>

      <UL>
        <LI>
          <strong style={{ color: tokens.colors.text }}>The browser extension</strong> —
          a Chromium extension that adds a floating save button to product pages
          and communicates saved items to GiftHint servers.
        </LI>
        <LI>
          <strong style={{ color: tokens.colors.text }}>The wisher dashboard</strong> —
          a web interface at gifthint.io where wishers can manage their saved items.
        </LI>
        <LI>
          <strong style={{ color: tokens.colors.text }}>Public wishlist pages</strong> —
          shareable pages (e.g. gifthint.io/list/yourname) that gifters can view
          without creating an account.
        </LI>
      </UL>

      {/* ── 2. User accounts ────────────────────────────────────────────────── */}
      <H2>2. User accounts</H2>

      <P>
        To save items you must create an account by signing in with Google OAuth.
        You must be at least 13 years old (or the minimum digital age of consent
        in your country, whichever is higher) to create an account.
      </P>

      <P>
        You are responsible for maintaining the security of your account. Because
        we use Google OAuth, your GiftHint session security is tied to your Google
        account security — use a strong Google password and enable two-factor
        authentication. Notify us immediately at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: tokens.colors.purple }}>
          {CONTACT_EMAIL}
        </a>{' '}
        if you suspect unauthorised access to your account.
      </P>

      <P>
        One person may hold one account. You may not create accounts on behalf of
        others without their express consent.
      </P>

      {/* ── 3. Acceptable use ───────────────────────────────────────────────── */}
      <H2>3. Acceptable use</H2>

      <P>
        You agree to use GiftHint only for lawful personal, non-commercial wishlist
        purposes. You must not:
      </P>

      <UL>
        <LI>
          Save links to products that are illegal to buy, sell, or possess in your
          jurisdiction (e.g. unlicensed firearms, controlled substances).
        </LI>
        <LI>
          Use the Service to advertise or sell products commercially, or to
          promote a business, brand, or influencer campaign without our written
          consent.
        </LI>
        <LI>
          Attempt to reverse engineer, scrape at scale, or interfere with the
          operation of the Service or its infrastructure.
        </LI>
        <LI>
          Use automated tools (bots, scrapers, crawlers) to create accounts or
          save items in bulk.
        </LI>
        <LI>
          Circumvent, disable, or tamper with affiliate link generation in order
          to deprive GiftHint of its lawful affiliate commissions.
        </LI>
        <LI>
          Upload, transmit, or link to content that is defamatory, obscene,
          or infringes the intellectual property rights of any third party.
        </LI>
      </UL>

      <P>
        We reserve the right to suspend or permanently terminate accounts that
        violate these rules, at our sole discretion and without prior notice.
      </P>

      {/* ── 4. Affiliate disclosure ─────────────────────────────────────────── */}
      <H2>4. Affiliate relationships and commercial disclosure</H2>

      <DisclosureBox>
        📣 Material connection disclosure (FTC 16 CFR § 255): GiftHint participates
        in affiliate advertising programs. When a gifter clicks a product link on
        a wishlist page and subsequently makes a purchase on the retailer's
        website, GiftHint may earn an affiliate commission. This commission is paid
        by the retailer and does not increase the price paid by the buyer or the
        wisher in any way.
      </DisclosureBox>

      <P>
        Affiliate programs we participate in include but are not limited to the
        Amazon Associates Program and Skimlinks. Product links saved by wishers
        may be automatically rewritten to include affiliate tracking parameters
        when the wishlist page is rendered. We store the original unmodified URL
        you saved; the affiliate rewrite is applied only at display time.
      </P>

      <P>
        The existence of an affiliate relationship does not influence which
        products wishers can save, the order in which items appear, or any other
        aspect of the wishlist experience. We do not give preferential placement
        or endorsement to any product or retailer in exchange for commission.
      </P>

      <P>
        By using the Service you acknowledge and agree to the automatic affiliate
        rewriting of product links on your public wishlist page.
      </P>

      {/* ── 5. Intellectual property ────────────────────────────────────────── */}
      <H2>5. Intellectual property</H2>

      <P>
        GiftHint and its licensors own all rights, title, and interest in the
        Service, including all software, design, and trademarks. These Terms do
        not grant you any rights to GiftHint's intellectual property beyond the
        limited right to use the Service as described herein.
      </P>

      <P>
        By saving a product URL, you represent that you have the right to share
        that URL publicly. Product images, names, and prices displayed on your
        wishlist page are sourced from the retailer's website and are the property
        of the respective retailer or manufacturer. GiftHint claims no ownership
        over third-party product content.
      </P>

      {/* ── 6. Third-party services ─────────────────────────────────────────── */}
      <H2>6. Third-party websites and services</H2>

      <P>
        Your wishlist contains links to third-party retailer websites. GiftHint
        is not responsible for the content, privacy practices, or availability of
        those websites. Purchases you make on retailer websites are solely between
        you and the retailer; GiftHint is not a party to any retail transaction.
      </P>

      <P>
        Retailer prices, availability, and product details are fetched at the time
        an item is saved and may become stale. GiftHint does not guarantee that
        displayed prices are accurate or that items are still available.
      </P>

      {/* ── 7. Disclaimers ──────────────────────────────────────────────────── */}
      <H2>7. Disclaimer of warranties</H2>

      <P>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF
        ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT.
      </P>

      <P>
        We do not warrant that the Service will be uninterrupted, error-free, or
        free of viruses or other harmful components. We do not warrant the
        accuracy of any product information displayed on wishlist pages.
      </P>

      {/* ── 8. Limitation of liability ──────────────────────────────────────── */}
      <H2>8. Limitation of liability</H2>

      <NoteBox>
        To the fullest extent permitted by applicable law, GiftHint and its
        officers, directors, employees, and agents shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages arising
        from your use of or inability to use the Service — including but not
        limited to lost profits, lost data, or the cost of substitute goods —
        even if GiftHint has been advised of the possibility of such damages.
        GiftHint's total cumulative liability to you for any claims arising from
        these Terms or the Service shall not exceed USD $50.
      </NoteBox>

      <P>
        Some jurisdictions do not allow the exclusion of certain warranties or
        the limitation of certain types of damages, so some of the above
        limitations may not apply to you.
      </P>

      {/* ── 9. Indemnification ──────────────────────────────────────────────── */}
      <H2>9. Indemnification</H2>

      <P>
        You agree to indemnify, defend, and hold harmless GiftHint and its
        affiliates, officers, and employees from any claims, liabilities, damages,
        and expenses (including reasonable legal fees) arising from your violation
        of these Terms or your use of the Service.
      </P>

      {/* ── 10. Account termination ─────────────────────────────────────────── */}
      <H2>10. Account termination</H2>

      <P>
        You may delete your account at any time from the account settings page or
        by emailing{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: tokens.colors.purple }}>
          {CONTACT_EMAIL}
        </a>
        . We will permanently delete your account data within 30 days of receiving
        your request.
      </P>

      <P>
        We may suspend or terminate your account immediately if we believe you are
        violating these Terms or if we are required to do so by law. If we
        terminate your account without cause we will give you reasonable notice
        and an opportunity to export your wishlist data.
      </P>

      {/* ── 11. Changes to terms ────────────────────────────────────────────── */}
      <H2>11. Changes to these Terms</H2>

      <P>
        We may revise these Terms at any time. When we make material changes we
        will update the "Last updated" date at the top of this page and notify
        registered users by email at least 14 days before the change takes effect.
        Your continued use of the Service after the effective date of a revised
        version constitutes your acceptance of the new Terms.
      </P>

      <P>
        If you do not agree to the revised Terms, please delete your account and
        uninstall the extension before the effective date.
      </P>

      {/* ── 12. Governing law ───────────────────────────────────────────────── */}
      <H2>12. Governing law and disputes</H2>

      <P>
        These Terms are governed by the laws of the State of Delaware, United
        States, without regard to its conflict-of-law provisions. Any dispute
        arising from these Terms or the Service that cannot be resolved informally
        shall be submitted to binding arbitration under the American Arbitration
        Association's Consumer Arbitration Rules, conducted in English. You waive
        any right to participate in a class-action lawsuit or class-wide
        arbitration.
      </P>

      <P>
        Notwithstanding the above, either party may seek injunctive or other
        equitable relief in any court of competent jurisdiction to prevent
        irreparable harm.
      </P>

      {/* ── 13. Miscellaneous ───────────────────────────────────────────────── */}
      <H2>13. Miscellaneous</H2>

      <P>
        <strong style={{ color: tokens.colors.text }}>Entire agreement.</strong>{' '}
        These Terms, together with our{' '}
        <Link href="/privacy" style={{ color: tokens.colors.purple }}>
          Privacy Policy
        </Link>
        , constitute the entire agreement between you and GiftHint regarding the
        Service and supersede all prior agreements.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>Severability.</strong>{' '}
        If any provision of these Terms is found to be unenforceable, that
        provision will be modified to the minimum extent necessary to make it
        enforceable, and the remaining provisions will continue in full force.
      </P>

      <P>
        <strong style={{ color: tokens.colors.text }}>No waiver.</strong>{' '}
        Our failure to enforce any right or provision of these Terms is not a
        waiver of that right or provision.
      </P>

      {/* ── 14. Contact ─────────────────────────────────────────────────────── */}
      <H2>14. Contact us</H2>

      <P>
        Questions about these Terms? Email us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: tokens.colors.purple }}>
          {CONTACT_EMAIL}
        </a>
        . We aim to respond within 5 business days.
      </P>
    </PolicyShell>
  )
}
