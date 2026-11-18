import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('node_modules/stockfish/bin')
const destination = resolve('public/engine')
await mkdir(destination, { recursive: true })
await Promise.all([
  copyFile(resolve(source, 'stockfish-19-lite.js'), resolve(destination, 'stockfish.js')),
  copyFile(resolve(source, 'stockfish-19-lite.wasm'), resolve(destination, 'stockfish.wasm')),
])
console.log('Stockfish 19 Lite WASM files copied to public/engine.')

// Single-thread build: used on phones (or any page that is not cross-origin isolated, e.g.
// http://<LAN-IP>:5173) where SharedArrayBuffer is unavailable. The engine locates its .wasm
// by swapping .js for .wasm in its own URL, so the two files must share a base name.
const available = await readdir(source)
const pick = (extension) => available.filter((name) => name.includes('lite-single') && name.endsWith(extension)).sort()[0]
const singleJs = pick('.js')
const singleWasm = pick('.wasm')
if (singleJs && singleWasm) {
  await Promise.all([
    copyFile(resolve(source, singleJs), resolve(destination, 'stockfish-single.js')),
    copyFile(resolve(source, singleWasm), resolve(destination, 'stockfish-single.wasm')),
  ])
  console.log(`Single-thread build (${singleJs}) copied to public/engine for mobile fallback.`)
} else {
  console.warn('Warning: no "lite-single" build found in node_modules/stockfish/bin. Phones on non-HTTPS pages will not be able to run the engine.')
}
