import { EMBEDDED_DATA_ELEMENT_ID } from "../schema/embedded"
import { type ImportResult, parseImportJson } from "./jsonIO"

/**
 * skill が配布用 HTML に焼き込んだ議論データを読み出す。
 *
 * 埋め込みの無い通常のビルド (ホスト版 / plugin 同梱の argos.html) では
 * null を返し、呼び出し側は従来どおり空グラフで起動する。
 *
 * パース・検証に失敗した場合は例外を投げる。呼び出し側で握り潰して
 * 空グラフで起動させること。壊れたデータで白画面になるより、Import を
 * 促せる状態のほうがよい。
 */
export function readEmbeddedFixture(): ImportResult | null {
  if (typeof document === "undefined") return null
  const text = document.getElementById(EMBEDDED_DATA_ELEMENT_ID)?.textContent?.trim()
  if (!text) return null
  return parseImportJson(text)
}
