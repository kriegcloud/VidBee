import {buildSubscriptionDownloadOptions as build} from '@vidbee/subscriptions-core/download-options'
import type {OneClickQualityPreset,OneClickContainerOption} from '@vidbee/downloader-core/format-preferences'
import type {SubscriptionDownloadPreferences} from './types.js'
export const buildSubscriptionDownloadOptions:(subscription:SubscriptionDownloadPreferences,defaults:{oneClickDownloadType?:'video'|'audio';oneClickQuality?:OneClickQualityPreset;oneClickContainer?:OneClickContainerOption})=>{type:'subtitles';format:'srt'}|{type:'video'|'audio';format:string;containerFormat?:OneClickContainerOption}=build
