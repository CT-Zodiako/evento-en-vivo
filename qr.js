import qrcode from 'qrcode-generator';

const MARGIN = 2;

// Boolean matrix of the QR code: true = dark module.
export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

const escapeXml = (text) =>
  text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

export function qrSvg(text) {
  const matrix = qrMatrix(text);
  const size = matrix.length + MARGIN * 2;
  let path = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path += `M${x + MARGIN} ${y + MARGIN}h1v1h-1z`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img">`
    + `<title>${escapeXml(text)}</title>`
    + `<rect width="${size}" height="${size}" fill="#fff"/>`
    + `<path d="${path}" fill="#000"/></svg>`;
}

// Terminal rendering for dark terminals: light modules are drawn as blocks,
// so the code reads as dark-on-light with a light quiet zone.
// Each character covers two module rows using half blocks.
export function qrTerminal(text) {
  const matrix = qrMatrix(text);
  const size = matrix.length + MARGIN * 2;
  const light = (row, col) => {
    const r = row - MARGIN;
    const c = col - MARGIN;
    if (r < 0 || c < 0 || r >= matrix.length || c >= matrix.length) return true;
    return !matrix[r][c];
  };
  const lines = [];
  for (let row = 0; row < size; row += 2) {
    let line = '';
    for (let col = 0; col < size; col++) {
      const top = light(row, col);
      const bottom = row + 1 < size ? light(row + 1, col) : false;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
