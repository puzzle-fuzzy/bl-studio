/**
 * 共享的 TanStack Query 基建：统一的 QueryClient 配置 + Provider。
 *
 * 三前端拆分（studio / writer / canvas）前的服务端状态统一（TODO 第七节
 * Batch 0c）：此前 web 有 4 种手写取数守卫模式、admin 全部页面自带
 * loading/error 样板。此后统一为 react-query 的缓存 + 重试 + 失效语义，
 * SSE 事件作为失效提示（invalidateQueries）接入。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientError } from '@bailian-studio/api-client'
import { useState, type ReactNode } from 'react'

/**
 * 4xx（鉴权/校验/业务拒绝）重试没有意义，直接失败；网络抖动与 5xx 重试两次。
 * ApiClientError.status 在 HTTP 传输失败（网络断开）时为 undefined——这类可以重试。
 */
function defaultRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError && error.status !== undefined && error.status >= 400 && error.status < 500) {
    return false
  }
  return failureCount < 2
}

/** 最近一次由 AppQueryProvider 创建的客户端；供登出/切换用户时清空查询缓存。 */
let sharedClient: QueryClient | undefined

export function createAppQueryClient(): QueryClient {
  sharedClient = buildAppQueryClient()
  return sharedClient
}

function buildAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: defaultRetry,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function getAppQueryClient(): QueryClient | undefined {
  return sharedClient
}

/** 各 app 的根 Provider：在 RouterProvider 外层挂一次。 */
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
