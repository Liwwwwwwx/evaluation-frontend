const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLUMNS = 100;

/** 保留带引号的分隔符、双引号和单元格内换行，限制展示规模。 */
export function parsePreviewTable(text: string, delimiter: string): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let truncated = false;
  const pushCell = () => { if (row.length < MAX_TABLE_COLUMNS) row.push(cell); else truncated = true; cell = ""; };
  const pushRow = () => { pushCell(); if (rows.length < MAX_TABLE_ROWS) rows.push(row); else truncated = true; row = []; };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) pushCell();
    else if (ch === "\n" || ch === "\r") { pushRow(); if (ch === "\r" && source[i + 1] === "\n") i++; if (rows.length >= MAX_TABLE_ROWS && i < source.length - 1) { truncated = true; break; } }
    else cell += ch;
  }
  if (rows.length < MAX_TABLE_ROWS && (cell !== "" || row.length > 0)) pushRow();
  return { rows, truncated };
}
