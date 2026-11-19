import { readFileSync } from "node:fs";
import { SocialSourceSchema } from "../../downloader-core/src/social-media";
import { describe, expect, it } from "vitest";
import * as S from "effect/Schema";
import * as R from "effect/Result";
import * as OldOF from "../src/onlyfans-profile";
import * as NewOF from "../../downloader-core/src/onlyfans-profile";
import { FanslyCommandSchema as OldFansly } from "../src/fansly-profile";
import { FanslyCommandSchema as NewFansly } from "../../downloader-core/src/fansly-profile";
import { SocialMediaOptionsSchema as OldSocial } from "../src/social-media";
import { SocialMediaOptionsSchema as NewSocial } from "../../downloader-core/src/social-media";

const pairs = [
  { name: "OnlyFans command", old: OldOF.OnlyFansCommandSchema, decode: S.decodeUnknownResult(NewOF.OnlyFansCommandSchema), base: { url:"https://onlyfans.com/fixture",action:"map" } },
  { name: "Fansly command", old: OldFansly, decode: S.decodeUnknownResult(NewFansly), base: {url:"https://fansly.com/fixture",action:"map"} },
  { name: "OnlyFans download", old: OldOF.OnlyFansDownloadSchema, decode:S.decodeUnknownResult(NewOF.OnlyFansDownloadSchema), base:{url:"https://onlyfans.com/fixture",itemIds:["1"]} },
  { name: "OnlyFans item", old: OldOF.OnlyFansItemSchema,decode:S.decodeUnknownResult(NewOF.OnlyFansItemSchema),base:{id:"1",postId:"2",category:"photos",state:"available"} },
  { name:"OnlyFans profile", old:OldOF.OnlyFansProfileSchema,decode:S.decodeUnknownResult(NewOF.OnlyFansProfileSchema),base:{username:"fixture",profileUrl:"https://onlyfans.com/fixture",state:"idle",updatedAt:1,pages:0,items:[],chatId:"12",purchasedUserId:"13",creatorUsername:"fixture",linkedChatId:"14"} },
  { name:"Social options",old:OldSocial,decode:S.decodeUnknownResult(NewSocial),base:{} }
];
const values:unknown[]=[undefined,null,false,true,0,NaN,Infinity,-1,7,"","bad","https://example.invalid","mailto:a@example.invalid","123","a".repeat(65),[],["1"],Array.from({length:10001},()=> "1"),{},["bad"]];
describe("strict schema differential against retained zod boundaries",()=>{
 for(const pair of pairs) it(pair.name,()=>{
  const inputs:unknown[]=[pair.base,...values];
  for(const key of Object.keys(pair.base))for(const value of values)inputs.push({...pair.base,[key]:value});
  for(const category of [undefined,"media","photos","videos","posts",null])inputs.push({...pair.base,category});
  for(const input of inputs){
   const old=pair.old.safeParse(input);
   const next=pair.decode(input);
   expect(R.isSuccess(next),JSON.stringify({schema:pair.name,input})).toBe(old.success);
   if(old.success && R.isSuccess(next))expect(next.success).toEqual(old.data);
  }
 });
 it("date order preserves the visible message and since path",()=>{
  const input={since:"2026-02-01",until:"2026-01-01"};
  const old=OldSocial.safeParse(input),next=S.decodeUnknownResult(NewSocial)(input);
  expect(old.success).toBe(false);
  expect(R.isFailure(next)).toBe(true);
  if(!old.success && R.isFailure(next)){
   expect(old.error.issues[0]?.message).toBe("The start date must not be after the end date.");
   expect(old.error.issues[0]?.path).toEqual(["since"]);
   expect(next.failure.message).toBe('The start date must not be after the end date.\n  at ["since"]');
  }
 });
 it("date and option acceptance matches a generated matrix",()=>{
  for(const since of [undefined,"2024-02-29","2023-02-29","2026-01-01","0000-01-01","9999-12-31",""])for(const until of [undefined,"2026-01-01","2024-01-01"])for(const maxPosts of [undefined,0,1,1.5,1000000,1000001]){
   const input={since,until,maxPosts};const a=OldSocial.safeParse(input),b=S.decodeUnknownResult(NewSocial)(input);
   expect(R.isSuccess(b),JSON.stringify(input)).toBe(a.success);
   if(a.success && R.isSuccess(b))expect(b.success).toEqual(a.data);
  }
 });
});

it("SocialSource URL checks and nested categories match main's zod snapshots",()=>{
 const fixtures=JSON.parse(readFileSync(new URL("./fixtures/review-social-source-oracle.json",import.meta.url),"utf8"));
 for(const fixture of fixtures){
  const decoded=S.decodeUnknownResult(SocialSourceSchema)(fixture.input);
  expect(R.isSuccess(decoded),JSON.stringify(fixture.input)).toBe(fixture.accepted);
  if(R.isSuccess(decoded))expect(decoded.success).toEqual(fixture.decoded);
 }
});
