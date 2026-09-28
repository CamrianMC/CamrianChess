// stockfish.js — Web Worker wrapper for Stockfish WASM (Stockfish 10, nmrugg/stockfish.js)
//
// This file is loaded as a Web Worker by offscreen.js:
//   new Worker(chrome.runtime.getURL('stockfish.js'))
//
// Strategy: delegate entirely to stockfish.loader.js via importScripts().
//
// The loader defines a global STOCKFISH factory and ends with an auto-bootstrap
// IIFE. The IIFE detects the Web Worker environment by checking:
//   typeof onmessage !== 'undefined'  (always true in a Worker scope)
//   typeof window === 'undefined'     (no window in a Worker)
//
// When both conditions hold the IIFE:
//   1. Calls stockfish = STOCKFISH()  — no explicit WasmPath.
//      Inside load_stockfish(), ENVIRONMENT_IS_WORKER = true, so:
//        scriptDirectory = self.location.href up to last '/'
//                        = 'chrome-extension://<id>/'
//      wasmBinaryFile resolves via locateFile('stockfish.wasm'):
//        = scriptDirectory + 'stockfish.wasm'
//        = 'chrome-extension://<id>/stockfish.wasm'
//      which is exactly the file listed in web_accessible_resources.
//      No Module.locateFile or Module.wasmBinaryFile override is required.
//   2. Sets: onmessage = (event) => stockfish.postMessage(event.data, true)
//      — incoming worker messages (UCI command strings) are forwarded to the engine.
//   3. Sets: stockfish.onmessage = (line) => postMessage(line)
//      — every UCI output line the engine produces is sent back to offscreen.js.
//
// This is the complete, correct wire-up. The worker protocol that offscreen.js
// expects is preserved unchanged:
//   • offscreen.js sends UCI commands via worker.postMessage(str)
//   • offscreen.js receives UCI output via addEventListener('message', e => e.data)
//     where e.data is a plain UCI string.
//
// No additional code is needed. importScripts() IS the complete implementation.

importScripts('stockfish.loader.js');
