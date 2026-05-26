import * as XLSX from 'xlsx';

// Parse price list Excel → { headers, rows, rawSheet }
// Auto-detects column headers from first row, returns structured data
export function parsePriceList(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (data.length < 2) throw new Error('表格数据不足');

        // First row is headers
        const headers = data[0].map((h) => String(h).trim());
        const rows = data.slice(1).filter((r) =>
          r.some((c) => String(c).trim() !== '')
        );

        resolve({ headers, rows, fileName: file.name });
      } catch (err) {
        reject(new Error(`解析价格表失败：${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

// Parse quotation template → return all sheet data as raw arrays
// Keeps the template structure intact for HTML rendering
export function parseTemplate(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheets = {};
        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name];
          sheets[name] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        }
        resolve({ sheets, sheetNames: wb.SheetNames, fileName: file.name });
      } catch (err) {
        reject(new Error(`解析模板失败：${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}
