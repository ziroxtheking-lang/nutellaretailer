// Minimal .xlsx writer (no dependency): one sheet, bold red header row, frozen header,
// auto-filter, column widths, and optional hyperlink cells. Files are stored uncompressed
// in the zip, which Excel, LibreOffice and Google Sheets all open.

export type ExcelCell = string | number | { text: string; url: string } | null | undefined;

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // strip control characters Excel rejects
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i: number): string => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const cellXml = (ref: string, v: ExcelCell, style: number): string => {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof v === 'number') return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === 'object') {
    const f = `HYPERLINK("${v.url.replace(/"/g, '""')}","${v.text.replace(/"/g, '""')}")`;
    return `<c r="${ref}" s="3" t="str"><f>${xmlEscape(f)}</f><v>${xmlEscape(v.text)}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
};

const sheetXml = (headers: string[], rows: ExcelCell[][], widths: number[]): string => {
  const lastCol = colName(headers.length - 1);
  const lastRow = rows.length + 1;
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const head = `<row r="1" ht="22" customHeight="1">${headers.map((h, i) => cellXml(`${colName(i)}1`, h, 1)).join('')}</row>`;
  const body = rows.map((r, ri) =>
    `<row r="${ri + 2}">${r.map((v, ci) => cellXml(`${colName(ci)}${ri + 2}`, v, ri % 2 ? 4 : 2)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
};

// Styles: 0 default, 1 header (bold white on red), 2 body, 3 hyperlink, 4 body zebra row.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD70B0E"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F5F5"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFDDDDDD"/></left><right style="thin"><color rgb="FFDDDDDD"/></right><top style="thin"><color rgb="FFDDDDDD"/></top><bottom style="thin"><color rgb="FFDDDDDD"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="5">
<xf/>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf fontId="2" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// --- tiny uncompressed zip ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (d: Uint8Array) => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

const zip = (files: { name: string; data: string }[]): Blob => {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const data = enc.encode(f.data); const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 0, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const downloadExcel = (filename: string, sheetName: string, headers: string[], rows: ExcelCell[][], widths: number[]) => {
  const safeSheet = xmlEscape(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const blob = zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${safeSheet}'!$A$1:$${colName(headers.length - 1)}$${rows.length + 1}</definedName></definedNames></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(headers, rows, widths) },
  ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
