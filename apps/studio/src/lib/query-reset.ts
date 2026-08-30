/**
 * 登出 / 切换用户时清空 TanStack Query 缓存。
 *
 * 此前各 zustand store 通过 registerPrivateDataReset 逐个注册 reset；迁移到
 * react-query 的服务端状态不再走那个注册表，统一在这里清空全部查询缓存，
 * 防止上一个用户的列表/余额数据残留给下一个用户（与 store reset 同一语义）。
 * 本模块只做副作用注册，从 main.tsx 导入一次即可。
 */
import { getAppQueryClient } from '@bailian-studio/lib-client'
import { registerPrivateDataReset } from '@bailian-studio/app-shell'

registerPrivateDataReset(() => {
  getAppQueryClient()?.clear()
})
