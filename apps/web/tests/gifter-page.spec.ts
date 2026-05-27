/**
 * tests/gifter-page.spec.ts — GiftHint
 *
 * Playwright e2e tests for the public gifter page (/list/[username]).
 * Run with: npx playwright test
 *
 * Environment variables:
 *   PLAYWRIGHT_BASE_URL  — defaults to http://localhost:3000
 *   TEST_USERNAME        — defaults to 'testuser'
 *
 * Tests marked test.skip() require the database to be seeded with items
 * for TEST_USERNAME before they will pass. Remove the skip and seed the
 * DB (or set TEST_USERNAME to a real seeded user) in CI.
 */

import { test, expect } from '@playwright/test'

const BASE_URL     = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const TEST_USERNAME = process.env.TEST_USERNAME       ?? 'testuser'
const GIFTER_PATH   = `/list/${TEST_USERNAME}`

// ── Shared setup ──────────────────────────────────────────────────────────────

test.describe('Gifter page — /list/[username]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GIFTER_PATH)
  })

  // ── T09: Page loads without auth ───────────────────────────────────────────
  test('page loads for test user without requiring sign-in', async ({ page }) => {
    // Must not redirect to any auth page
    await expect(page).not.toHaveURL(/sign-in|login|auth/i)

    // h1 must mention "Gift List"
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
    await expect(heading).toContainText(/Gift List/i)
  })

  // ── T08 (page title): Page <title> contains username or "Gift List" ────────
  test('page <title> contains the username or "Gift List"', async ({ page }) => {
    const title = await page.title()
    expect(
      title.toLowerCase().includes(TEST_USERNAME.toLowerCase()) ||
      title.toLowerCase().includes('gift list'),
    ).toBe(true)
  })

  // ── T13: Viral CTA bar is present and visible ──────────────────────────────
  test('viral CTA bar is present and visible', async ({ page }) => {
    // Match by data-testid first, then fall back to text
    const ctaBar = page.getByTestId('cta-bar')
      .or(page.getByText(/Create yours free/i).first())

    await expect(ctaBar).toBeVisible()
  })

  // ── T14: FTC / affiliate disclosure footer ────────────────────────────────
  test('FTC / affiliate disclosure footer is visible and contains "affiliate"', async ({ page }) => {
    // Scroll to bottom so the footer enters the viewport
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Match by role or testid
    const footer = page.locator('footer').first()
      .or(page.getByTestId('gifter-footer').first())

    await expect(footer).toBeVisible()

    const text = await footer.innerText()
    expect(text.toLowerCase()).toContain('affiliate')
  })

  // ── Filter bar tabs are present ───────────────────────────────────────────
  test('filter bar shows "All items" and "Still needed" tabs', async ({ page }) => {
    const allTab = page
      .getByRole('tab', { name: /All items/i })
      .or(page.getByRole('button', { name: /All items/i }))

    const neededTab = page
      .getByRole('tab', { name: /Still needed/i })
      .or(page.getByRole('button', { name: /Still needed/i }))

    await expect(allTab).toBeVisible()
    await expect(neededTab).toBeVisible()
  })

  // ── T15: Mobile 375×812 — no horizontal overflow ──────────────────────────
  test('mobile 375×812: page renders without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(GIFTER_PATH)

    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHScroll).toBe(false)

    // CTA bar still visible at mobile width
    const ctaBar = page.getByTestId('cta-bar')
      .or(page.getByText(/Create yours free/i).first())
    await expect(ctaBar).toBeVisible()
  })

  // ── Requires seeded DB: "Buy on" button visible ───────────────────────────
  // Remove test.skip and seed TEST_USERNAME with at least one item before running.
  test.skip('first "Buy on" button is visible when gift items exist', async ({ page }) => {
    const buyButton = page.getByRole('link', { name: /Buy on/i }).first()
    await expect(buyButton).toBeVisible()
  })

  // ── Requires seeded DB: Amazon affiliate tag in href ──────────────────────
  test.skip('Amazon "Buy on" button href contains ?tag= affiliate param', async ({ page }) => {
    const amazonLink = page.getByRole('link', { name: /Buy on Amazon/i }).first()
    await expect(amazonLink).toBeVisible()

    const href = await amazonLink.getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).toContain('tag=')
  })

  // ── Requires seeded DB with unclaimed item: Claim form appears ─────────────
  // T10: clicking "I'll buy this" shows the inline claim form.
  test.skip('claim form appears when "I\'ll buy this" is clicked', async ({ page }) => {
    const buyThisBtn = page.getByRole('button', { name: /I'll buy this/i }).first()
    await expect(buyThisBtn).toBeVisible()
    await buyThisBtn.click()

    // Inline form or modal appears
    const form = page.locator('[data-testid="claim-form"]')
      .or(page.getByRole('dialog'))
      .or(page.getByPlaceholder(/your name/i))

    await expect(form.first()).toBeVisible()
  })

  // ── Requires fully-claimed DB: all-claimed banner shows ───────────────────
  test.skip('all-claimed banner appears when every item is already claimed', async ({ page }) => {
    const banner = page.getByText(/Everything.*been claimed/i)
    await expect(banner).toBeVisible()
  })
})
