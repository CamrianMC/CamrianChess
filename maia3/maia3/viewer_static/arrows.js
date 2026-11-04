(() => {
  'use strict';

  const ARROW_COLORS = ['#32cd32', '#ffa500', '#ffd700'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SQUARE_SIZE = 12.5;

  let boardShell = null;
  let arrowsSvg = null;

  function squareToCoords(square, orientation) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;

    if (orientation === 'black') {
      return { x: 7 - file, y: rank };
    }
    return { x: file, y: 7 - rank };
  }

  function parseUCIMove(move) {
    if (typeof move !== 'string' || move.length < 4) return null;
    return {
      from: move.substring(0, 2),
      to: move.substring(2, 4)
    };
  }

  function initArrowLayer(shellElement) {
    boardShell = shellElement;
    if (!boardShell) return;
    if (arrowsSvg && arrowsSvg.isConnected) return;

    boardShell.style.position = 'relative';

    arrowsSvg = document.createElementNS(SVG_NS, 'svg');
    arrowsSvg.id = 'maia-live-arrows';
    arrowsSvg.setAttribute('viewBox', '0 0 100 100');
    arrowsSvg.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 30;
    `;

    const defs = document.createElementNS(SVG_NS, 'defs');
    ARROW_COLORS.forEach((color, index) => {
      const marker = document.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', `live-arrow-head-${index}`);
      marker.setAttribute('markerWidth', '4');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '0');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');

      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', '0,0 4,2 0,4');
      polygon.setAttribute('fill', color);
      polygon.setAttribute('fill-opacity', String(0.78 - index * 0.12));

      marker.appendChild(polygon);
      defs.appendChild(marker);
    });

    arrowsSvg.appendChild(defs);
    boardShell.appendChild(arrowsSvg);
  }

  function clearArrows() {
    if (!arrowsSvg) return;
    const defs = arrowsSvg.querySelector('defs');
    arrowsSvg.replaceChildren();
    if (defs) arrowsSvg.appendChild(defs);
  }

  function drawArrows(moves, orientation) {
    if (!arrowsSvg || !Array.isArray(moves)) return;
    clearArrows();

    const boardOrientation = orientation === 'black' ? 'black' : 'white';
    moves.slice(0, 3).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const parsed = parseUCIMove(entry.move);
      if (!parsed) return;

      const from = squareToCoords(parsed.from, boardOrientation);
      const to = squareToCoords(parsed.to, boardOrientation);
      const x1 = (from.x + 0.5) * SQUARE_SIZE;
      const y1 = (from.y + 0.5) * SQUARE_SIZE;
      const targetX = (to.x + 0.5) * SQUARE_SIZE;
      const targetY = (to.y + 0.5) * SQUARE_SIZE;

      const dx = targetX - x1;
      const dy = targetY - y1;
      const length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const x2 = targetX - (dx / length) * 5;
      const y2 = targetY - (dy / length) * 5;

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', ARROW_COLORS[index] || ARROW_COLORS[ARROW_COLORS.length - 1]);
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-opacity', String(0.78 - index * 0.12));
      line.setAttribute('marker-end', `url(#live-arrow-head-${index})`);
      arrowsSvg.appendChild(line);
    });
  }

  window.LiveArrows = {
    initArrowLayer,
    clearArrows,
    drawArrows
  };
})();
