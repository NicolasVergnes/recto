import type { loadStatsData } from '$lib/db/study'

/** What the statistics screen shows: cards and review log of a deck (or all), plus today's queue. */
export type StatsData = Awaited<ReturnType<typeof loadStatsData>>
