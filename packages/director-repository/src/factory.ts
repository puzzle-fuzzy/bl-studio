import { type BailianStudioDb, createDb } from "@bailian-studio/db";
import { createDirectorRepository } from "./repository";
import type { DirectorRepository } from "./types";

export interface DirectorRepositoryHandle {
	db: BailianStudioDb;
	repository: DirectorRepository;
	close(): Promise<void>;
}

export function createDirectorRepositoryFromUrl(
	url: string,
): DirectorRepositoryHandle {
	const db = createDb({ url, max: 5 });
	return {
		db,
		repository: createDirectorRepository({ db }),
		close: () => db.close(),
	};
}
