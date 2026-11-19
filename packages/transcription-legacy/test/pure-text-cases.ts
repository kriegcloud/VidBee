import * as Str from "effect/String";

/** Complete, valid arguments for the permanent old-source compatibility oracle. */
const cue = { startMs: 100, endMs: 900, text: "你好世界", speaker: " Alice " };
const segment = {
  startMs: 100,
  endMs: 900,
  text: "漢語软件",
  speakerKey: "speaker-1",
  confidence: null,
  words: [{ startMs: 100, endMs: 900, text: "漢語软件" }],
};
const result = {
  resultKind: "transcript",
  sourceKind: "asr",
  language: "zh",
  modelVersion: "fixture",
  asrTier: null,
  speakers: [{ speakerKey: "speaker-1", displayName: "Alice" }],
  segments: [segment],
};
const asr = { language: "en", resultKind: "transcript", sourceKind: "asr" };
const caption = { language: "zh", resultKind: "transcript", sourceKind: "captions" };
const head = {
  ...caption,
  asrTier: null,
  createdAt: 10,
  downloadTaskId: "download-1",
  id: "row-1",
  modelVersion: "embedded-captions",
  sourceFilePath: "/fixture/movie.mp4",
  supersededAt: null,
  transcriptionTaskId: "captions:download-1:zh",
  updatedAt: 20,
};
const history = [
  { ...head },
  { ...head, id: "row-old", supersededAt: 25 },
  { ...head, ...asr, id: "row-asr", downloadTaskId: "download-2", transcriptionTaskId: "asr-task" },
];
const option = {
  auto: false,
  key: "captions:zh",
  kind: "captions",
  language: "zh",
  languageCode: "zh",
  selected: true,
};
const vtt =
  "WEBVTT\n\n00:00:00.100 --> 00:00:00.900\n<v Alice>你好世界</v>\n\n00:00:01.000 --> 00:00:02.000\n<v Bob>Hello</v>";
const ass = "Dialogue: 0,0:00:00.10,0:00:00.90,Default,Alice,0,0,0,,你好\\N世界";
const tracks = [
  { language: "zh", path: "/fixture/movie.zh.vtt", title: "Official", text: vtt },
  { language: "ai-en", path: "/fixture/movie.ai-en.vtt", title: "Auto", text: "hello" },
  { language: "zh", path: "/fixture/movie.danmaku.ass", title: "Danmaku", text: ass },
];

/**
 * The marker travels through the oracle serializer; reconstruct addPunct from it.
 * `append-period`: text + "。"; `rewrite`: "changed"; `throw`: throw Error("punctuation fixture").
 */
const appendPeriod = { __pureTextPunctuator: "append-period", addPunct: (text: string): string => `${text}。` };
const rewrite = { __pureTextPunctuator: "rewrite", addPunct: (_text: string): string => "changed" };
const throwing = {
  __pureTextPunctuator: "throw",
  addPunct: (_text: string): string => {
    throw new Error("punctuation fixture");
  },
};

export const pureTextCases: Record<string, Record<string, unknown[][]>> = {
  captions: {
    isPlatformAiCaptionTag: [["ai-zh"], ["automatic-en"], ["zh"], [null]],
    isChatCaptionTag: [["live_chat"], ["danmaku"], ["zh"], [null]],
    isMachineCaptionTag: [["ai-zh"], ["rechat"], ["en"]],
    isMachineCaptionPath: [
      ["/fixture/movie.danmaku.ass"],
      ["/fixture/movie.en.vtt"],
      ["/fixture/movie.live-chat.srt/"],
      [null],
    ],
    isImportableCaptionTrack: [
      [tracks[0]],
      [tracks[2]],
      [{ language: "ai-zh", title: "Auto", path: "/fixture/movie.ai-zh.vtt" }],
    ],
    isHumanCaptionTrack: [
      [tracks[0]],
      [tracks[2]],
      [{ language: "en", title: "live_chat", path: "/fixture/movie.vtt" }],
    ],
    captionLanguageForMatch: [["AI_ZHO"], ["eng-auto"], ["zh-Hant"]],
    captionLanguageKey: [["ai-zh"], ["zho"], ["zh-Hant"], [null]],
    refineCaptionLanguage: [
      ["ai-zh", "漢語轉換"],
      ["zho", "hello"],
      [null, "汉语转换"],
    ],
    captionsTaskId: [["download-1"], ["download-1", "ai-zh"], ["download-1", null]],
    isTextSubtitleCodec: [["subrip"], ["hdmv_pgs_subtitle"], [null]],
    cleanCaptionText: [["<v Alice>你好</v>\\N世界 {style}"], ["  hello\n world "]],
    parseCaptionCues: [[vtt], ["1\n00:00:01,000 --> 00:00:02,000\nHello"]],
    parseAssCues: [[ass]],
    parseCaptionTrack: [
      [vtt, "vtt"],
      [ass, "ass"],
      ["1\n00:00:01,000 --> 00:00:02,000\nHello", "srt"],
    ],
    languageFromSidecarName: [
      ["movie.ai-zh.vtt", "movie"],
      ["movie.srt", "movie"],
      ["other.en.vtt", "movie"],
    ],
    preferredCaptionLanguages: [["zh-TW"], ["zh-CN"], ["en-US"], ["fr"]],
    captionLanguageScore: [
      ["ai-zh", ["zh", "en"]],
      ["zh-Hant", ["zh-TW", "en"]],
      [null, ["en"]],
    ],
    pickCaptionTrack: [
      [tracks, ["zh", "en"]],
      [[tracks[2], tracks[1]], ["en"]],
    ],
    pipelineResultFromCues: [[[cue, { ...cue, speaker: "Bob", text: "hello", startMs: 1000, endMs: 2000 }], "zh"]],
  },
  "chinese-script": {
    chineseScriptOf: [["zh-TW"], ["zho_Hans"], ["cmn-HK"], ["en"]],
    chineseScriptHint: [["zh-TW"], ["zh-CN"], ["en"], [null]],
    looksLikeChinese: [["漢語软件"], ["かな中文"], ["한국어中文"], ["hello"]],
    chineseScriptFromText: [["漢語轉換"], ["汉语转换"], ["hello"]],
    applyChineseScript: [
      ["漢語软件", "hans"],
      ["汉语软件", "hant"],
      ["hello", null],
    ],
    applyChineseScriptToSegment: [
      [segment, "hans"],
      [segment, "hant"],
      [segment, null],
    ],
    languageAfterChineseScript: [
      [[segment], "hans"],
      [[segment], "hant"],
      [[{ text: "hello" }], null],
    ],
    applyChineseScriptToResult: [
      [result, "hans"],
      [result, "hant"],
      [result, null],
    ],
  },
  "transcript-sources": {
    buildTranscriptSources: [
      [{ asrActive: true, current: asr, preferredKey: "captions:zh", stored: [asr, caption], tracks }],
      [{ asrActive: false, current: caption, preferredKey: null, stored: [caption, asr], tracks }],
    ],
    recordForTranscriptSource: [
      [option, history, head],
      [{ ...option, key: "asr", kind: "asr" }, history, head],
      [undefined, history, head],
    ],
    latestTranscriptHead: [
      [history, "asr-task"],
      [[{ ...head, supersededAt: 30 }], head.transcriptionTaskId],
    ],
    resolveTranscriptHeads: [
      [{ asrActive: false, heads: history, latestTaskId: "asr-task", preferredKey: "captions:zh", tracks }],
    ],
    groupTranscriptHeads: [[history]],
  },
  punctuate: {
    needsPunctuation: [["你好世界"], ["Hello!"], [`${Str.repeat(402)("a")}!`]],
    alignInsertions: [
      ["你好世界", "你好，世界。"],
      ["🙂你好", "🙂你好。"],
      ["abc", "changed"],
    ],
    punctuateText: [
      [appendPeriod, "你好世界"],
      [rewrite, "你好世界"],
      [throwing, "hello"],
    ],
    punctuateWords: [
      [
        appendPeriod,
        "你好世界",
        [
          { startMs: 0, endMs: 10, text: "你好" },
          { startMs: 10, endMs: 20, text: "世界" },
        ],
      ],
      [appendPeriod, "hello", undefined],
      [throwing, "hello", [{ startMs: 0, endMs: 20, text: "hello" }]],
    ],
    punctuateCues: [
      [appendPeriod, [{ text: "你好" }, { text: "世界" }]],
      [rewrite, [{ text: "hello" }]],
      [appendPeriod, [{ text: Str.repeat(599)("a") }, { text: "hello" }]],
    ],
  },
  "iso-639": { iso6391FromTag: [["zho"], ["eng-US"], ["deu"], ["en"], ["unknown"]] },
};
