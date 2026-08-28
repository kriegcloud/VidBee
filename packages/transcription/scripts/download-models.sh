#!/bin/bash
set -euo pipefail
DIR="${VIDBEE_TRANSCRIPTION_MODELS_DIR:-$HOME/Library/Application Support/vidbee/models/transcription}"
mkdir -p "$DIR/.downloads"
cd "$DIR"

download() {
  local url="$1"
  local dest="$2"
  if [[ -s "$dest" ]]; then
    echo "exists $dest"
    return
  fi
  echo "download $url"
  curl -fL --retry 8 --retry-delay 3 -C - -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

download "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" "silero_vad.onnx"
download "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx" "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"

PYA=".downloads/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
download "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2" "$PYA"
if [[ ! -s "sherpa-onnx-pyannote-segmentation-3-0/model.onnx" ]]; then
  tar -xjf "$PYA"
fi

QWEN=".downloads/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2"
download "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2" "$QWEN"
if [[ ! -s "sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/encoder.int8.onnx" ]]; then
  tar -xjf "$QWEN"
fi

echo "ready:"
ls -lh silero_vad.onnx 3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx
ls -lh sherpa-onnx-pyannote-segmentation-3-0/model.onnx
ls -lh sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/encoder.int8.onnx \
  sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/decoder.int8.onnx \
  sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/conv_frontend.onnx
ls -ld sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/tokenizer
