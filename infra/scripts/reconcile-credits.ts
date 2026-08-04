import { createCreditLedgerFromUrl } from '../../packages/credit-ledger/src/index'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required')
}

const handle = createCreditLedgerFromUrl(databaseUrl)
try {
  const report = await handle.ledger.reconcile()
  console.log(JSON.stringify(report, null, 2))
  if (!report.healthy) process.exitCode = 2
} finally {
  await handle.close()
}
