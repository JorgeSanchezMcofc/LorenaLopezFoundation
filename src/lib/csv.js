// CSV compatible con Excel (UTF-8 con BOM) y protegido contra fórmulas inyectadas.

export function toCsv(header, rows) {
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
