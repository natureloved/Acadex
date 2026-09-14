/**
 * A small, dependency-free CSV reader.
 *
 * Hand-rolled on purpose: the project has a "no new dependencies" rule, and the
 * subset of RFC 4180 the import screen needs is small enough to read in one
 * sitting - quoted fields, escaped quotes (""), embedded commas and newlines,
 * CRLF or LF line endings, and a UTF-8 BOM.
 */

export type CsvRow = { line: number; values: string[] };
export type CsvTable = { header: string[]; rows: CsvRow[] };

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");

  const rows: CsvRow[] = [];
  let values: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endField = () => {
    values.push(field);
    field = "";
  };

  const endRow = () => {
    endField();
    // Ignore blank lines (trailing newline, stray empty row).
    const isBlank = values.length === 1 && values[0].trim() === "";
    if (!isBlank) rows.push({ line: rowStartLine, values });
    values = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (char === '"') {
      // A stray quote inside an unquoted field is kept literally.
      field += char;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      endRow();
      line += 1;
      rowStartLine = line;
      continue;
    }

    field += char;
  }

  endRow();

  const header = rows.length > 0 ? rows[0].values.map((value) => value.trim().toLowerCase()) : [];
  return { header, rows: rows.slice(1) };
}
