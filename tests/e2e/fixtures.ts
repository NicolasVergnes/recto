import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

/**
 * Every scenario runs at noon (Europe/Paris) of the current day, time then flowing normally:
 * the study day changes at 04:00, and a learning card answered at 03:55 legitimately belongs
 * to the next day — tests must not depend on the hour they run at (CI included).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    await page.clock.install({ time: new Date(`${today}T11:00:00Z`) })
    await use(page)
  },
})
