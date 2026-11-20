import { homedir } from 'node:os'
import { join } from 'node:path'
import { ModelManager } from '../src/model-manager.ts'
import { log } from '@vidbee/logger/script'

const modelsDir =
  process.env.VIDBEE_TRANSCRIPTION_MODELS_DIR ??
  join(homedir(), 'Library/Application Support/vidbee/models/transcription')

const manager = new ModelManager({ modelsDir })
log.log('downloading into', modelsDir)
const status = await manager.ensureReady()
log.log(JSON.stringify(status, null, 2))
