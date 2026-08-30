/**
 * Backward-compatible repository export for the shared provider-neutral model
 * lookup seam. The canonical contract lives in model-core so other pure
 * consumers, such as Canvas execution, can use the same port.
 */
export type { ModelManifestResolver } from '@bailian-studio/model-core'
