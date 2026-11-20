import { runLegacySync } from '@vidbee/task-queue-legacy/runtime'
import { modelFiles, modelFilesRuntime } from './host/model-runtime'
import { transcriptionCause } from './bridge/errors'
import type { DirectoryMemberRequirement } from './types'
export { INCOMPLETE_MODEL_ERROR, QWEN3_TOKENIZER_REPAIR_HINT, QWEN3_ASR_TOKENIZER_FILES } from '../../transcription/src/qwen3-tokenizer'
export type { DirectoryAssessment } from '../../transcription/src/Model.model'
export const assessDirectoryMembers = (dir: string, members: readonly DirectoryMemberRequirement[], withRepairHint = false) =>
  runLegacySync(modelFilesRuntime,modelFiles.assessDirectory(dir,members,withRepairHint),transcriptionCause)
