/**
 * generation 分享的 API 持久化 port。
 *
 * 创建/撤销分享与匿名公开读取分别声明能力；SQL 实现归档在 shares.ts，API
 * 通过组合根注入窄 port。generation-repository 仅为旧调用方保留兼容 facade。
 */
import type {
	CreateGenerationShareInput,
	GenerationArtifact,
	GenerationRecord,
	GenerationShare,
	GetGenerationShareForRecordInput,
	PublicSharedGeneration,
	RevokeGenerationShareInput,
} from "./types";

export interface ShareRepository {
	createGenerationShare(
		input: CreateGenerationShareInput,
	): Promise<GenerationShare>;
	getGenerationRecord(id: string): Promise<GenerationRecord | undefined>;
	getGenerationShareForRecord(
		input: GetGenerationShareForRecordInput,
	): Promise<GenerationShare | undefined>;
	revokeGenerationShare(
		input: RevokeGenerationShareInput,
	): Promise<GenerationShare | undefined>;
}

export interface PublicShareRepository {
	getPublicSharedGeneration(
		shareId: string,
	): Promise<PublicSharedGeneration | undefined>;
	getPublicSharedArtifact(
		shareId: string,
		artifactId: string,
	): Promise<GenerationArtifact | undefined>;
}
