import type {
	FinishProviderRequestInput,
	ProviderRequestAudit,
	StartProviderRequestInput,
} from "./provider-request-types";

/** Worker 写入 provider 出站请求审计所需的最小持久化契约。 */
export interface ProviderRequestAuditRepository {
	startProviderRequest(
		input: StartProviderRequestInput,
	): Promise<ProviderRequestAudit>;
	finishProviderRequest(
		input: FinishProviderRequestInput,
	): Promise<ProviderRequestAudit | undefined>;
}
