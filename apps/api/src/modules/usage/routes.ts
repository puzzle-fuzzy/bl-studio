import { Elysia } from 'elysia'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'

export function createUsageRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/usage' }).get('/', async ({ request }) => {
    const user = await requireAuthUser(request, deps.authService)
    const period = currentUtcMonthWindow()
    const usage = await deps.usageRepository.getGenerationUsage({
      userId: user.id,
      ...period,
    })

    return {
      success: true,
      data: {
        usage: {
          ...usage,
          period,
          currency: 'CNY' as const,
        },
      },
    }
  })
}

export function currentUtcMonthWindow(now = new Date()): {
  since: string
  until: string
} {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return {
    since: new Date(Date.UTC(year, month, 1)).toISOString(),
    until: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  }
}
