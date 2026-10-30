type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100;
const MAX_XML_BYTES = 20 * 1024 * 1024;

function readString(bytes: Uint8Array, offset: number, length: number) {
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, offset + length));
}

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("无法读取 Excel 文件结构");
}

function readEntries(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || centralOffset === 0xffffffff) throw new Error("不支持 ZIP64 格式的 Excel");
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel 压缩包目录损坏");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error("不支持 ZIP64 格式的 Excel");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = readString(bytes, offset + 46, nameLength);
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { view, bytes, entries };
}

async function readZipEntry(_buffer: ArrayBuffer, zip: ReturnType<typeof readEntries>, entry: ZipEntry) {
  const { view, bytes } = zip;
  if (entry.uncompressedSize > MAX_XML_BYTES) throw new Error("Excel 内容过大，请缩小文件后重试");
  const offset = entry.localOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("Excel 文件条目损坏");
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  if (start + entry.compressedSize > bytes.length) throw new Error("Excel 文件结构损坏");
  const compressed = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8 || typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持读取该 Excel 文件");
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_XML_BYTES) { await reader.cancel(); throw new Error("Excel 内容过大，请缩小文件后重试"); }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offsetOut = 0;
  for (const chunk of chunks) { output.set(chunk, offsetOut); offsetOut += chunk.length; }
  return output;
}

function xmlText(bytes: Uint8Array) {
  const document = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(bytes), "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Excel XML 内容损坏");
  return document;
}

function resolveCellReference(reference: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(reference.toUpperCase());
  if (!match) return { column: 0, row: 0 };
  let column = 0;
  for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
  return { column: column - 1, row: Number(match[2]) - 1 };
}

function cellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return cell.querySelector("is t")?.textContent ?? "";
  const value = cell.querySelector("v")?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}

export async function parseXlsxFirstSheet(file: File): Promise<Array<{ domainKey: string; question: string }>> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Excel 文件不能超过 10 MB");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("请上传 .xlsx 格式的 Excel 文件");
  const buffer = await file.arrayBuffer();
  let zip: ReturnType<typeof readEntries>;
  try { zip = readEntries(buffer); } catch (error) {
    if (error instanceof RangeError) throw new Error("Excel 文件结构损坏");
    throw error;
  }
  const byName = new Map(zip.entries.map((entry) => [entry.name, entry]));
  const workbookEntry = byName.get("xl/workbook.xml");
  const relsEntry = byName.get("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relsEntry) throw new Error("Excel 缺少工作簿信息");
  const workbook = xmlText(await readZipEntry(buffer, zip, workbookEntry));
  const rels = xmlText(await readZipEntry(buffer, zip, relsEntry));
  const firstSheet = workbook.querySelector("sheets > sheet");
  const relationId = firstSheet?.getAttribute("r:id");
  const relation = [...rels.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relationId);
  const target = relation?.getAttribute("Target");
  if (!target) throw new Error("Excel 缺少第一张工作表");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\//, "")}`;
  const sheetEntry = byName.get(sheetPath);
  if (!sheetEntry) throw new Error("Excel 第一张工作表不存在");
  const sharedEntry = byName.get("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (sharedEntry) {
    const shared = xmlText(await readZipEntry(buffer, zip, sharedEntry));
    for (const item of [...shared.querySelectorAll("si")]) {
      sharedStrings.push([...item.querySelectorAll("t")].map((part) => part.textContent ?? "").join(""));
    }
  }
  const sheet = xmlText(await readZipEntry(buffer, zip, sheetEntry));
  const rows = new Map<number, string[]>();
  for (const cell of [...sheet.querySelectorAll("sheetData row c")]) {
    const ref = cell.getAttribute("r");
    if (!ref) continue;
    const position = resolveCellReference(ref);
    if (position.column > 256 || position.row > 10000 || rows.size > 1000) throw new Error("Excel 工作表范围过大");
    const row = rows.get(position.row) ?? [];
    row[position.column] = cellValue(cell, sharedStrings).trim();
    rows.set(position.row, row);
  }
  const matrix = [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  if (matrix.length < 2) throw new Error("Excel 至少需要标题行和一条案例");
  const headers = matrix[0].map((item) => String(item ?? "").trim());
  const domainIndex = headers.indexOf("领域");
  const questionIndex = headers.indexOf("题目");
  if (domainIndex < 0 || questionIndex < 0) throw new Error("第一张表必须包含“领域”和“题目”列");
  const items = matrix.slice(1).filter((row) => row.some((item) => String(item ?? "").trim() !== "")).map((row) => ({
    domainKey: String(row[domainIndex] ?? "").trim(),
    question: String(row[questionIndex] ?? "").trim(),
  }));
  if (items.length > MAX_ROWS) throw new Error("一次最多导入 100 条固定案例");
  return items;
}
