import { createCreditLedgerFromUrl } from '../../packages/credit-ledger/src/index'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required')
}

const olderThanArgument = process.argv.find(argument => argument.startsWith('--older-than='))?.slice('--older-than='.length)
const olderThan = olderThanArgument === undefined
  ? new Date(Date.now() - 24 * 60 * 60 * 1000)
  : new Date(olderThanArgument)
if (!Number.isFinite(olderThan.getTime())) throw new Error('--older-than must be a valid ISO timestamp')

const confirm = process.argv.includes('--confirm')
const actorUserId = process.env.OPERATOR_USER_ID
const handle = createCreditLedgerFromUrl(databaseUrl)
try {
  const result = await handle.ledger.releaseStaleReservations({
    olderThan,
    confirm,
    ...(actorUserId !== undefined ? { actorUserId } : {}),
  })
  console.log(JSON.stringify({
    mode: confirm ? 'confirm' : 'dry-run',
    olderThan: olderThan.toISOString(),
    ...result,
  }, null, 2))
} finally {
  await handle.close()
}
