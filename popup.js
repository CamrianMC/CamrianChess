// Popup Script - Extension Settings & Analysis Display

document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabledCheckbox');
    const depthSlider = document.getElementById('depthSlider');
    const depthValue = document.getElementById('depthValue');
    const multipvSlider = document.getElementById('multipvSlider');
    const multipvValue = document.getElementById('multipvValue');
    const engineSelect = document.getElementById('engineSelect');
    const arrowsCheckbox = document.getElementById('arrowsCheckbox');
    const movesList = document.getElementById('movesList');
    const currentDepthText = document.getElementById('currentDepth');

    let isEnabled = true;
    let currentTabId = null;

    // Load saved settings
    chrome.storage.local.get(['enabled', 'depth', 'showArrows', 'multipv', 'engine'], (result) => {
        isEnabled = result.enabled !== false;
        enabledCheckbox.checked = isEnabled;

        const depth = result.depth || 15;
        depthSlider.value = depth;
        depthValue.textContent = depth;

        const multipv = result.multipv || 3;
        multipvSlider.value = multipv;
        multipvValue.textContent = multipv;

        engineSelect.value = result.engine === 'maia3' ? 'maia3' : 'stockfish';

        arrowsCheckbox.checked = result.showArrows !== false;

        updateUIState();
    });

    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url?.includes('chess.com')) {
            currentTabId = tabs[0].id;
            // Request latest analysis from background
            chrome.runtime.sendMessage({ type: 'getLatestAnalysis' }, (response) => {
                if (response && response.analysis) {
                    displayAnalysis(response.analysis);
                }
            });
        }
    });

    // Toggle ON/OFF
    enabledCheckbox.addEventListener('change', () => {
        isEnabled = enabledCheckbox.checked;
        chrome.storage.local.set({ enabled: isEnabled });
        updateUIState();
        notifyContentScript();
    });

    function updateUIState() {
        if (!isEnabled) {
            movesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⏸</div>
                    <p class="empty-text">Analysis disabled</p>
                </div>
            `;
            currentDepthText.textContent = 'Depth: 0';
        }
    }

    // Sliders (Depth, Lines) share identical wiring.
    function setupSlider(slider, valueEl, storageKey) {
        slider.addEventListener('input', () => {
            valueEl.textContent = slider.value;
        });
        slider.addEventListener('change', () => {
            chrome.storage.local.set({ [storageKey]: parseInt(slider.value) });
            notifyContentScript();
        });
    }

    setupSlider(depthSlider, depthValue, 'depth');
    setupSlider(multipvSlider, multipvValue, 'multipv');

    engineSelect.addEventListener('change', () => {
        chrome.storage.local.set({ engine: engineSelect.value });
        notifyContentScript();
    });

    // Arrows checkbox
    arrowsCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ showArrows: arrowsCheckbox.checked });
        notifyContentScript();
    });

    function notifyContentScript() {
        if (!currentTabId) return;

        chrome.tabs.sendMessage(currentTabId, {
            type: 'settingsUpdate',
            settings: {
                enabled: isEnabled,
                depth: parseInt(depthSlider.value),
                showArrows: arrowsCheckbox.checked,
                multipv: parseInt(multipvSlider.value),
                engine: engineSelect.value
            }
        });
    }

    // Display analysis results
    function displayAnalysis(data) {
        if (!isEnabled) return;

        if (!data || !data.moves || data.moves.length === 0) {
            movesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p class="empty-text">Analyzing...</p>
                </div>
            `;
            currentDepthText.textContent = 'Depth: 0';
            return;
        }

        currentDepthText.textContent = `Depth: ${data.depth}`;

        const classes = ['best', 'second', 'third'];
        let html = '';

        data.moves.forEach((move, index) => {
            if (!move) return;

            // Normalize score for the bar (cap at +/- 400 cp)
            const scoreCp = move.isMate ? 400 : Math.abs(move.score);
            const barWidth = Math.min(100, (scoreCp / 400) * 100);

            const scoreText = move.isMate
                ? `M${move.score > 0 ? '+' : ''}${move.score}`
                : `${move.score > 0 ? '+' : ''}${(move.score / 100).toFixed(1)}`;

            html += `
                <div class="move-item ${classes[index] || ''}">
                    <div class="move-rank">${index + 1}</div>
                    <span class="move-name">${move.move}</span>
                    <div class="move-bar-container">
                        <div class="move-bar" style="width: ${barWidth}%"></div>
                    </div>
                    <span class="move-score">${scoreText}</span>
                </div>
            `;
        });

        movesList.innerHTML = html;
    }

    // Listen for analysis updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'analysisUpdate' && isEnabled) {
            displayAnalysis(message.data);
        }
    });
});
