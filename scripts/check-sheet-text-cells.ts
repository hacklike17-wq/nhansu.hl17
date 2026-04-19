/**
 * check-sheet-text-cells.ts — CLI wrapper cho sheet-check.service.
 *
 * Phát hiện ô text trông-như-số trong Google Sheet (vd "0.5" thay vì 0.5).
 * Những ô này bị Excel SUM() bỏ qua gây sai Tổng công.
 *
 * Usage:
 *   npx tsx scripts/check-sheet-text-cells.ts "<Google Sheet URL>"
 *
 * Exit code: 0 = không có ô lỗi · 1 = có ô lỗi · 2 = lỗi fetch/config.
 */
import { checkSheet } from "../src/lib/services/sheet-check.service"
import { SheetFetchError } from "../src/lib/google-sheet-fetcher"

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error("Usage: npx tsx scripts/check-sheet-text-cells.ts <URL>")
    process.exit(2)
  }

  console.log(`🔍 Quét sheet: ${url}\n`)

  let result
  try {
    result = await checkSheet(url)
  } catch (e) {
    if (e instanceof SheetFetchError) {
      console.error(`❌ Không tải được sheet: [${e.code}] ${e.message}`)
    } else {
      console.error(`❌ Lỗi không mong đợi: ${(e as Error).message}`)
    }
    process.exit(2)
  }

  if (result.missingTabs.length > 0) {
    console.log(`⚠️  Thiếu tab: ${result.missingTabs.join(", ")}`)
    console.log(`   Tabs có trong sheet: ${result.availableTabs.join(", ")}\n`)
  }

  if (result.findings.length === 0) {
    console.log("✅ Không có ô text-masquerading-as-number — sheet sạch!")
    process.exit(0)
  }

  console.log(`⚠️  Phát hiện ${result.findings.length} ô text chứa số (Excel SUM sẽ bỏ qua):\n`)
  console.log(
    `${"Tab".padEnd(30)} ${"Ô".padEnd(8)} ${"Mã NV".padEnd(8)} ${"Giá trị text".padEnd(14)} → Parse thành`
  )
  console.log("─".repeat(90))
  for (const f of result.findings) {
    console.log(
      `${f.tab.padEnd(30)} ${f.cell.padEnd(8)} ${(f.empCode ?? "-").padEnd(8)} ${JSON.stringify(f.rawValue).padEnd(14)} → ${f.parsedAs}`
    )
  }

  console.log(
    `\n💡 Cách fix: click từng ô → Format → Number → Automatic/Plain number.\n   Hoặc xoá ô rồi gõ lại số (không có dấu nháy ở đầu).`
  )
  process.exit(1)
}

main().catch(e => {
  console.error("Lỗi:", e)
  process.exit(2)
})
