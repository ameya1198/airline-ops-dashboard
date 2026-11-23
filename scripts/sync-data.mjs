// Copy the summary tables built by pipeline/build_summaries.py into public/data
// so the app can serve them as static files.
import { cpSync, existsSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, "../../data/summary")
const dest = resolve(here, "../public/data")

if (!existsSync(src)) {
  console.error(`No summary tables at ${src}. Run: python pipeline/build_summaries.py`)
  process.exit(1)
}
rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log(`Copied ${src} -> ${dest}`)
