# Chess.com Analyzer

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/chesscom-analyzer/iicoipbphmgocoipjhakhbccnlkbmbnm)

A Chrome extension that provides real-time analysis for Chess.com games, displaying the top 3 best moves with visual arrows on the board and an evaluation bar in the popup.

## Features

- **Live Analysis**: Continuously analyzes the current board position
- **Engine Choice**: Use built-in Stockfish or a local Maia3 bridge
- **Visual Arrows**: Displays the best moves directly on the Chess.com board
- **Evaluation Bars**: Shows move quality as visual bars in the popup
- **Customizable Depth**: Adjust analysis depth from 10 to 25 ply
- **Toggle Arrows**: Show/hide board arrows while keeping analysis running

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the `extension` folder
5. Pin the extension to your toolbar for easy access

## File Structure

```
extension/
├── manifest.json      # Extension configuration
├── background.js      # Service worker (message routing)
├── content.js         # Chess.com page integration
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── offscreen.html     # Required for offscreen API
├── offscreen.js       # Stockfish worker host
├── stockfish.js       # Stockfish engine (pure JS)
└── images/            # Extension icons (16-128px)
```

## File Descriptions

### `manifest.json`
Chrome extension manifest (v3). Defines permissions, content scripts, icons, and the popup. Key permissions:
- `storage`: Save user settings
- `offscreen`: Run Stockfish in a background worker

### `background.js`
Service worker that orchestrates communication between all components:
- Creates and manages the offscreen document
- Parses Stockfish output (depth, score, best moves)
- Broadcasts analysis to content script and popup
- Pre-compiled regex patterns for efficient parsing

### `content.js`
Injected into Chess.com pages. Responsibilities:
- **FEN Extraction**: Reads the board state from Chess.com's `wc-chess-board` element
- **Turn Detection**: Determines whose turn it is via clock/move count
- **Arrow Drawing**: Renders SVG arrows for the top 3 moves
- **Settings Sync**: Listens for settings changes from the popup

### `popup.html`
The extension popup UI with a "Sober Glassmorphism" design:
- Header with ON/OFF toggle
- Depth slider (10-25)
- Arrows enable/disable checkbox
- Live analysis with evaluation bars

### `popup.js`
Handles popup interactivity:
- Loads/saves settings to `chrome.storage.local`
- Requests latest analysis from background script
- Updates the UI when new analysis arrives
- Calculates evaluation bar widths

### `offscreen.html` / `offscreen.js`
Required by Chrome's Offscreen API to run a Web Worker:
- Initializes Stockfish as a Worker
- Configures MultiPV (3 moves)
- Forwards all engine output to the background script

### `stockfish.js`
The Stockfish chess engine compiled to pure JavaScript. Runs in a Web Worker for non-blocking analysis.

### `images/`
Extension icons in PNG format at standard sizes (16, 32, 48, 128 pixels).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chess.com Tab                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ content.js                                                │   │
│  │  • Extracts FEN from board                               │   │
│  │  • Draws arrows on board                                 │   │
│  │  • Sends analysis requests                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ chrome.runtime.sendMessage
┌─────────────────────────────────────────────────────────────────┐
│                     background.js (Service Worker)              │
│  • Routes messages between components                           │
│  • Parses Stockfish output                                     │
│  • Stores latest analysis for popup                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    offscreen.js (Web Worker Host)               │
│  • Runs stockfish.js in a Worker                               │
│  • Forwards commands/output                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     popup.html / popup.js                       │
│  • Displays analysis with eval bars                            │
│  • Manages settings (depth, arrows)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

1. Navigate to any game on [Chess.com](https://www.chess.com)
2. Click the extension icon to open the popup
3. Ensure the toggle is ON
4. Analysis will start automatically and arrows will appear on the board
5. Adjust depth or toggle arrows as needed

## Maia3 Setup (Local Bridge)

Chrome extensions cannot execute Python directly, so Maia3 runs as a local HTTP bridge.

1. Open a terminal in [maia3](maia3)
2. Install Maia3 dependencies if needed:

```bash
python -m pip install .
```

3. Start the bridge server:

```bash
python bridge_server.py --model maia3-5m
```

4. In the extension popup, set **Engine** to **Maia3 (localhost bridge)**

Default bridge endpoint is `http://127.0.0.1:8765/analyze`.

## Settings

| Setting | Description | Range |
|---------|-------------|-------|
| Enabled | Master ON/OFF toggle | On/Off |
| Depth | Analysis depth in ply | 10-25 |
| Arrows | Show/hide board arrows | On/Off |

## License

MIT
