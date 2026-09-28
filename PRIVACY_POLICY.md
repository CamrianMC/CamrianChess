# Privacy Policy for Chess.com Analyzer

**Last Updated: December 27, 2025**

Chess.com Analyzer ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how we handle data within the extension.

## 1. Data Collection
Chess.com Analyzer **does not collect, store, or transmit any personally identifiable information (PII)**. 

To provide its core functionality (chess analysis), the extension reads:
- **Website Content**: The extension reads the DOM of `chess.com` pages to extract the current piece positions (FEN) of the chess game you are viewing.
- **Settings**: The extension saves your preferences (analysis depth, UI toggles) locally in your browser using `chrome.storage.local`.

## 2. Data Usage
The data mentioned above is used **strictly for analysis purposes within your browser**:
- Game positions are sent to the locally bundled Stockfish engine.
- No game data or user metadata is ever sent to external servers or third parties.

## 3. Remote Code
The extension **does not use any remote code**. All analysis (Stockfish) and logic are contained within the extension package itself.

## 4. Third-Party Services
The extension interacts with Chess.com to display analysis arrows on the board. We are not affiliated with Chess.com, and their own privacy policy applies to your use of their website.

## 5. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be reflected by the "Last Updated" date at the top of this page.

## 6. Contact
If you have any questions about this Privacy Policy, you can open an issue on the [GitHub repository](https://github.com/hadufer/chess.com-analyzer).
