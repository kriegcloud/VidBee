import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubMirrorFetch, fetchFirstOk, githubDownloadUrls, isDownloadMirror, isGithubDownloadUrl, modelDownloadUrls, modelScopeFileUrl, parseDownloadMirror, preferChinaMirrors } from '@vidbee/transcription-legacy/download-mirrors'

afterEach(() => vi.useRealTimers())
describe('pre-port mirror URL and preference protocol', () => {
  it('records all settings and explicit host profiles independently of the machine', () => {
    const values: unknown[] = [undefined, null, false, true, 0, 1, NaN, '', 'auto', 'cn', 'global', 'CN', {}, []]
    expect(values.map(value => [isDownloadMirror(value), parseDownloadMirror(value)])).toMatchSnapshot()
    expect(['auto', 'cn', 'global', 'bogus'].flatMap(setting => ['auto', 'cn', 'global', ''].flatMap(env => ['en-US', 'zh-CN'].map(language => ({ setting, env, language, result: preferChinaMirrors({mirror: setting, env: { VIDBEE_DOWNLOAD_MIRROR: env }, locales:[language], timeZone:'UTC', countryCode:'US'}) }))))).toMatchSnapshot()
  })
  it('records exact candidate URLs, mapped directories, escaping and host acceptance', () => {
    const urls = ['https://github.com/o/r/releases/download/v/a.tar.bz2', 'https://api.github.com/repos/o/r', 'https://raw.githubusercontent.com/o/r/main/a', 'https://evilgithub.com/a', 'https://github.com.evil/a', 'not a URL']
    expect(urls.map(url => ({url, github:isGithubDownloadUrl(url), global:githubDownloadUrls(url), cn:githubDownloadUrls(url,true)}))).toMatchSnapshot()
    const specs = ['silero_vad.onnx', 'sherpa-onnx-whisper-tiny/tokens.txt', 'sherpa-onnx-whisper-tiny\\encoder a.onnx', 'unknown/a.onnx', 'sherpa-onnx-whisper-tiny/tokenizer', 'file'].map(fileName => ({fileName,url:urls[0]!}))
    expect(specs.map(spec => ({spec, mapped:modelScopeFileUrl(spec), global:modelDownloadUrls(spec), cn:modelDownloadUrls(spec,true)}))).toMatchSnapshot()
  })
  it('preserves exact fetch init, Response identity and synchronous prefix through fallback', async () => {
    const trace: unknown[] = []
    const response = new Response('body')
    const headers = { 'x-fixture':'yes' }
    const caller = new AbortController()
    const fetchImpl: typeof fetch = async (url, init) => {
      trace.push({ url, keys:Object.keys(init ?? {}), method:init?.method, headers:init?.headers, callerSignal:init?.signal === caller.signal, aborted:init?.signal?.aborted })
      return url === 'first' ? new Response('ignored',{status:503}) : response
    }
    const pending = fetchFirstOk(['first','second','unused'], fetchImpl, {method:'POST',headers,body:'payload',signal:caller.signal})
    trace.push('immediate'); queueMicrotask(()=>trace.push('marker'))
    const result = await pending; trace.push('settled')
    expect(result).toEqual({response,url:'second'}); expect(result.response).toBe(response)
    expect(trace).toMatchSnapshot()
  })
  it('pins application errors, final non-Error stringification and original Error identity', async () => {
    const error = new Error('transport')
    await expect(fetchFirstOk([],fetch)).rejects.toThrow('no download URLs')
    await expect(fetchFirstOk(['a'],async()=>new Response('',{status:418}))).rejects.toThrow('download failed for a (418)')
    await expect(fetchFirstOk(['a'],async()=>{throw error})).rejects.toBe(error)
    await expect(fetchFirstOk(['a'],async()=>{throw {fixture:true}})).rejects.toThrow('[object Object]')
  })
  it('does not retry user abort and preserves Error reason identity', async () => {
    for (const reason of [new Error('stop'), 'stop']) {
      const controller = new AbortController(); controller.abort(reason)
      let calls=0
      const result = fetchFirstOk(['a','b'],async()=>{calls++;return new Response('')},{signal:controller.signal})
      if (reason instanceof Error) await expect(result).rejects.toBe(reason)
      else await expect(result).rejects.toMatchObject({name:'AbortError',message:'download cancelled'})
      expect(calls).toBe(0)
    }
  })
  it('times headers, clears deadline on response, and leaves slow body unrestricted', async () => {
    vi.useFakeTimers()
    const trace: unknown[]=[]
    const pending=fetchFirstOk(['a'],(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{trace.push(init.signal?.reason.name);reject(init.signal?.reason)})),undefined,23)
    const assertion=expect(pending).rejects.toMatchObject({name:'TimeoutError',message:'download timed out: a'})
    await vi.advanceTimersByTimeAsync(23); await assertion
    expect(trace).toEqual(['TimeoutError']); expect(vi.getTimerCount()).toBe(0)
    let release: ((bytes:Uint8Array)=>void)|undefined
    const body = new ReadableStream<Uint8Array>({start(controller){release=bytes=>{controller.enqueue(bytes);controller.close()}}})
    const response=new Response(body)
    expect((await fetchFirstOk(['a'],async()=>response,undefined,23)).response).toBe(response)
    await vi.advanceTimersByTimeAsync(23000); expect(vi.getTimerCount()).toBe(0)
    release?.(new TextEncoder().encode('late')); expect(await response.text()).toBe('late')
  })
  it('Request URL extraction loses Request-only method and headers and preference is live', async () => {
    const calls: unknown[]=[];let china=false
    const wrapped=createGithubMirrorFetch(async (url,init)=>{calls.push({url,keys:Object.keys(init ?? {}),method:init?.method,headers:init?.headers});return new Response('ok')},()=>china)
    await wrapped(new Request('https://github.com/o/r',{method:'POST',headers:{'x-request':'lost'},body:'lost'}))
    china=true;await wrapped(new URL('https://github.com/o/r'),{method:'HEAD'})
    expect(calls).toMatchSnapshot()
  })
})
