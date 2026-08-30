import { getAppQueryClient } from '@bailian-studio/lib-client'
import { registerPrivateDataReset } from '@bailian-studio/app-shell'

registerPrivateDataReset(() => {
  getAppQueryClient()?.clear()
})
