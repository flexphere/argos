#!/usr/bin/env node
// Notion ページ URL → page_id (32-hex 連結形式) 変換ツール。
//
// 受理する入力例:
//   https://www.notion.so/workspace/Title-3681009a77028026863fe892713be310
//   https://www.notion.so/workspace/Title-3681009a77028026863fe892713be310?source=copy_link
//   https://notion.so/3681009a-7702-8026-863f-e892713be310
//   3681009a77028026863fe892713be310
//   3681009a-7702-8026-863f-e892713be310

const input = process.argv[2]
if (!input) {
  console.error("Usage: node url-parser.mjs <notion-url-or-id>")
  process.exit(1)
}

const HEX32 = /([0-9a-f]{32})/i
const HEX_DASHED = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function extractPageId(raw) {
  const dashed = raw.match(HEX_DASHED)
  if (dashed) return dashed[1].replace(/-/g, "").toLowerCase()

  const flat = raw.match(HEX32)
  if (flat) return flat[1].toLowerCase()

  return null
}

const pageId = extractPageId(input)
if (!pageId) {
  console.error(`Notion URL の形式が認識できません: ${input}`)
  process.exit(1)
}

process.stdout.write(pageId)
