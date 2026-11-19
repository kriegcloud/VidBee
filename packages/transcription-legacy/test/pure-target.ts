import * as extract_captions from "../src/extract-captions"
import * as worker_protocol from "../src/worker/protocol"
import * as audio from "../src/audio"
import * as cloud_runner from "../src/cloud-runner"
import * as pipeline_sherpa from "../src/pipeline-sherpa"
import * as runtime from "../src/runtime"
import * as chunk_manifest from "../src/chunk-manifest"
import * as model_manager from "../src/model-manager"
import * as options from "../src/options"
import * as speaker_embed from "../src/speaker-embed"
import * as asr_json from "../src/asr-json"
import * as speaker_assign from "../src/speaker-assign"
import * as asr_recommend from "../src/asr-recommend"
import * as asr_recognizer from "../src/asr-recognizer"
import * as model_catalog from "../src/model-catalog"
import * as compute_provider from "../src/compute-provider"
import * as download_mirrors from "../src/download-mirrors"
import * as concurrency from "../src/concurrency"
import * as cloud from "../src/cloud"
import * as errors from "../src/errors"
import * as captions from '../src/captions'
import * as chinese from '../src/chinese-script'
import * as sources from '../src/transcript-sources'
import * as punctuate from '../src/punctuate'
import * as iso from '../src/iso-639'
import * as tiers from '../../transcription/src/asr-tiers'
import * as counts from '../../transcription/src/speaker-count'
import * as words from '../../transcription/src/asr-words'
import * as progress from '../../transcription/src/model-progress'
import * as edits from '../../transcription/src/transcript-edit'
import * as clusters from '../src/speaker-cluster'
import * as refine from '../src/speaker-refine'
import * as chunks from '../src/speaker-chunks'
export const pureTargets: Record<string, object> = {

 'asr-recommend': asr_recommend, 'asr-recognizer': asr_recognizer, 'model-catalog': model_catalog, 'compute-provider': compute_provider, 'download-mirrors': download_mirrors, 'concurrency': concurrency, 'cloud': cloud, 'errors': errors,

 'audio': audio, 'cloud-runner': cloud_runner, 'pipeline-sherpa': pipeline_sherpa, 'runtime': runtime, 'chunk-manifest': chunk_manifest, 'model-manager': model_manager, 'options': options, 'speaker-embed': speaker_embed, 'asr-json': asr_json, 'speaker-assign': speaker_assign,
 'extract-captions':extract_captions,'worker/protocol':worker_protocol,
 captions, 'chinese-script': chinese, 'transcript-sources': sources, punctuate, 'iso-639': iso,
 'asr-tiers': tiers, 'speaker-count':counts, 'asr-words':words, 'model-progress':progress,
 'transcript-edit':edits, 'speaker-cluster':clusters, 'speaker-refine':refine, 'speaker-chunks':chunks,
}
