import * as Core from '../../transcription/src/model-catalog'
import type {ModelGroup,ModelFileSpec} from './types'
import type {AsrTierId} from './asr-tiers'
export { MODEL_CATALOG, QWEN3_ASR_MODEL_DIR, modelVersion, MINIMAL_MODEL_GROUPS, MINIMAL_MODEL_TIERS } from '../../transcription/src/model-catalog'

export const catalogFor: (opts?: {
    groups?: readonly ModelGroup[];
    tiers?: readonly AsrTierId[];
}) => readonly ModelFileSpec[]=Core.catalogFor
