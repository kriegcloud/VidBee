import { setTimeout as delay } from 'node:timers/promises'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { OnlyFansCommandSchema, OnlyFansDownloadSchema, OnlyFansProfileSchema } from '@vidbee/downloader-core-legacy/onlyfans-profile'
import { ProfileCodec, ProfileHost } from '../../browser-capture/src/BrowserProfiles.service.js'
import { HostFailure } from '../../browser-capture/src/Capture.errors.js'
const failure = (operation:string) => (cause:unknown) => HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
export const ProfileCodecLegacy = Layer.succeed(ProfileCodec,{
  read: text=>Effect.try({try:()=>OnlyFansProfileSchema.parse(JSON.parse(text)),catch:failure('read profile')}),
  command: input=>Effect.try({try:()=>OnlyFansCommandSchema.parse(input),catch:failure('profile command')}),
  download: input=>Effect.try({try:()=>OnlyFansDownloadSchema.parse(input),catch:failure('profile download')}),
})
export const profileHostLayer = (defaultDirectory:()=>string) => Layer.succeed(ProfileHost,{
  defaultDirectory:Effect.try({try:defaultDirectory,catch:failure('default directory')}),
  delay:(ms,signal)=>Effect.tryPromise({try:()=>delay(ms,undefined,{signal}),catch:failure('profile delay')}),
})
