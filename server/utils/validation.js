export function sanitizeString(str, maxLength = 50) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength).replace(/[<>&"']/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' };
    return map[c];
  });
}

export function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

export function isValidPlayerName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 20;
}

export function isValidColor(color) {
  return ['red', 'blue', 'green', 'yellow'].includes(color);
}
