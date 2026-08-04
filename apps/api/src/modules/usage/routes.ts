import { Elysia } from 'elysia'
import type { GenerationUsage } from '@bailian-studio/generation-repository'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'

export function createUsageRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/usage' })
  .get('/', async ({ request }) => {
    const user = await requireAuthUser(request, deps.authService)
    const repository = deps.generationRepository
    const period = currentUtcMonthWindow()
    const usage = repository.getGenerationUsage === undefined
      ? emptyUsage()
      : await repository.getGenerationUsage({ userId: user.id, ...period })

    return {
      success: true,
      data: {
        usage: {
          ...usage,
          // Deprecated alias retained at the HTTP boundary while clients migrate;
          // providerCostCents is the canonical provider-reported value.
          finalCents: usage.providerCostCents,
          period,
          currency: 'CNY' as const,
        },
      },
    }
  })
}

export function currentUtcMonthWindow(now = new Date()): { since: string; until: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return {
    since: new Date(Date.UTC(year, month, 1)).toISOString(),
    until: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  }
}

function emptyUsage(): GenerationUsage {
  return { attemptCount: 0, successfulCount: 0, generationCount: 0, estimatedCents: 0, chargedCents: 0, providerCostCents: 0 }
}
