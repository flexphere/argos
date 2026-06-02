#!/usr/bin/env node
// MCP の notion-fetch レスポンス（markdown 風テキスト）から transcript セクションを抜き出す。
//
// 使い方:
//   node extract-transcript.mjs --input <path> --output <path>
//   cat mcp-response.txt | node extract-transcript.mjs --output <path>
//
// オプション:
//   --input <path>        : 入力ファイル（省略時 stdin）
//   --output <path>       : 出力ファイル（必須）
//   --include-summary     : summary セクションも結合
//   --include-manual      : meeting_notes 外の本文も結合

import { readFileSync, writeFileSync } from "node:fs"

function parseArgs(argv) {
  const args = { input: null, output: null, includeSummary: false, includeManual: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--input") args.input = argv[++i]
    else if (a === "--output") args.output = argv[++i]
    else if (a === "--include-summary") args.includeSummary = true
    else if (a === "--include-manual") args.includeManual = true
    else {
      console.error(`unknown argument: ${a}`)
      process.exit(1)
    }
  }
  return args
}

const args = parseArgs(process.argv)
if (!args.output) {
  console.error(
    "Usage: extract-transcript.mjs [--input <path>] --output <path> [--include-summary] [--include-manual]",
  )
  process.exit(1)
}

const source = args.input ? readFileSync(args.input, "utf8") : readFileSync(0, "utf8")

// MCP レスポンスから <transcript>...</transcript> ブロックを抽出
function extractSection(text, tag) {
  // <tag> ... </tag> を非貪欲マッチ
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")
  const m = text.match(re)
  return m ? m[1] : null
}

// MCP レスポンス全体から meeting-notes ブロックを切り出してから内部要素を取る
function extractMeetingNotes(text) {
  const block = extractSection(text, "meeting-notes")
  if (!block) return null
  return {
    summary: extractSection(block, "summary"),
    notes: extractSection(block, "notes"),
    transcript: extractSection(block, "transcript"),
  }
}

// インデントや余分な空白を整理
function cleanText(s) {
  return s
    .split("\n")
    .map((line) => line.replace(/^\t+/, "").trim())
    .filter((line) => line.length > 0)
    .join("\n")
}

// 入力の形式を判定して transcript を取り出す。
//   1. <meeting-notes> ブロックあり (= MCP raw レスポンス)
//   2. <transcript> ブロックだけある (= meeting-notes ラッパーを剥がされた中間形)
//   3. どちらも無い (= agent が既に整形済みの transcript テキストを渡してきた)
//      → そのまま transcript として使う (best-effort fallback)
const mn = extractMeetingNotes(source)
let summary = null
let transcript = null
if (mn) {
  summary = mn.summary
  transcript = mn.transcript
} else {
  // case 2: <transcript> 単独
  transcript = extractSection(source, "transcript")
  // case 3: タグ無し → そのまま透過
  if (transcript === null) transcript = source
}

if (!transcript || transcript.trim().length === 0) {
  console.error(
    "transcript が空です。録音前/処理中の Notion ページか、入力ファイルが空かを確認してください",
  )
  process.exit(2)
}

const parts = []
if (args.includeSummary && summary) {
  parts.push(`# Summary\n\n${cleanText(summary)}`)
}
parts.push(`# Transcript\n\n${cleanText(transcript)}`)

if (args.includeManual) {
  // <content> 内部に限定し meeting-notes を除く。
  // MCP レスポンス先頭の前置き文や <properties> JSON は <content> の外側なので自然に除外される。
  const content = extractSection(source, "content") ?? source
  const withoutMN = content.replace(/<meeting-notes>[\s\S]*?<\/meeting-notes>/i, "")
  const stripped = cleanText(withoutMN.replace(/<[^>]+>/g, "").replace(/\[\^[^\]]+\]/g, ""))
  if (stripped.length > 0) {
    parts.push(`# Manual Notes\n\n${stripped}`)
  }
}

const result = parts.join("\n\n")
writeFileSync(args.output, result, "utf8")

// 概要を stderr に表示
const lines = result.split("\n").length
const chars = result.length
console.error(
  `✓ transcript 抽出完了: ${chars.toLocaleString()} chars / ${lines.toLocaleString()} lines → ${args.output}`,
)
