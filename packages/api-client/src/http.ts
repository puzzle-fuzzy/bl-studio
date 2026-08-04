/**
 * Bailian Studio API 客户端的 HTTP 传输层。
 *
 * `unwrapData` 负责：发起 fetch、读取 JSON、判定响应信封类型，然后用 zod
 * schema 校验 `data` 字段。任何失败路径都会抛出一个带类型的
 * `ApiClientError` —— 全程无需 `as` 强转，因为拿到带类型值的唯一途径就是
 * schema 的 `.parse()` 成功。
 */
import { z } from 'zod'
import { ApiErrorSchema } from './schemas'

/**
 * API 客户端的统一异常类型。`code` 是机器可读的错误码（来自服务端信封或
 * 客户端自带的传输层错误码，如 NETWORK_ERROR / BAD_RESPONSE），`status` 是
 * 收到响应时的 HTTP 状态码（网络层失败时为 undefined），`traceId` 用于把
 * 客户端错误关联到服务端日志。
 */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
    public readonly traceId?: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

/** 读取响应体并解析为 JSON；解析失败时统一抛出 BAD_RESPONSE 错误。 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ApiClientError(
      'BAD_RESPONSE',
      `Response was not valid JSON (status ${response.status})`,
      response.status,
    )
  }
}

/**
 * 执行一次 fetch 并把响应解析为 JSON。
 *
 * 把网络层异常（fetch reject）和协议层异常（非 JSON body）都收敛成
 * `ApiClientError`：网络异常映射为 `NETWORK_ERROR`（无 HTTP status，因为
 * 连响应都没拿到）；JSON 解析失败由 readJson 映射为 `BAD_RESPONSE`。
 */
async function requestJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }
  const body = await readJson(response)
  return { status: response.status, body }
}

/**
 * 请求 `url`，校验 `{ success: true, data }` 信封结构，返回解析后的 `data`。
 *
 * 错误信封 `{ success: false, error }`、非 JSON body、网络层失败，都会抛出
 * `ApiClientError`，并在拿到响应时附上 HTTP status —— 调用方可以用
 * `instanceof ApiClientError` + `error.code` / `error.status` 区分不同失败态，
 * 例如 getCurrentUser() 用 `status === 401` 把"未登录"识别为 null 而非异常。
 */
export async function unwrapData<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  dataSchema: z.ZodSchema<T>,
): Promise<T> {
  const { status, body } = await requestJson(url, init, fetchImpl)

  const errorParsed = ApiErrorSchema.safeParse(body)
  if (errorParsed.success) {
    throw new ApiClientError(
      errorParsed.data.error.code,
      errorParsed.data.error.message,
      status,
      errorParsed.data.error.details,
      errorParsed.data.traceId,
    )
  }

  const envelope = z
    .object({ success: z.literal(true), data: dataSchema })
    .safeParse(body)
  if (!envelope.success) {
    throw new ApiClientError(
      'BAD_RESPONSE',
      'Response did not match the expected success envelope',
      status,
    )
  }
  return envelope.data.data
}

/** 执行一个成功响应刻意不带 body 的端点。 */
export async function requestNoContent(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
    )
  }

  if (response.ok) return

  const body = await readJson(response)
  const parsed = ApiErrorSchema.safeParse(body)
  if (parsed.success) {
    throw new ApiClientError(
      parsed.data.error.code,
      parsed.data.error.message,
      response.status,
      parsed.data.error.details,
      parsed.data.traceId,
    )
  }
  throw new ApiClientError(
    'BAD_RESPONSE',
    'Response did not match the expected error envelope',
    response.status,
  )
}
