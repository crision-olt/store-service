const MAX_ROWS = 1048576;
const MAX_COLUMNS = 16384;
const MAX_CELL_LENGTH = 32767;
const MAX_ROW_LENGTH = 4 * 1024 * 1024;
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;

class ExportInputError extends Error {
  constructor(status, message, cause) {
    super(message, { cause });
    this.status = status;
  }
}

async function* exportRows(request) {
  const { parser } = await import('stream-json');
  const tokens = parser.asStream({
    packValues: true,
    streamValues: false,
    maxDepth: 3,
    maxPackedLength: MAX_CELL_LENGTH,
    writableObjectMode: false,
    highWaterMark: 1
  });
  let parserError;
  let uploadError;
  const failUpload = (error) => {
    uploadError = error;
    tokens.destroy(error);
  };
  const abortUpload = () => {
    const error = new Error('Excel upload aborted');
    error.code = 'ECONNRESET';
    failUpload(error);
  };
  tokens.once('error', (error) => { parserError = error; });
  request.on('error', failUpload);
  request.on('aborted', abortUpload);
  request.pipe(tokens);

  let depth = 0;
  let started = false;
  let format;
  let section;
  let headersRead = false;
  let rowsRead = false;
  let headerRow;
  let row;
  let rowCount = 0;
  let rowLength = 0;
  const invalidShape = () => new ExportInputError(
    400, 'Expected an array of rows containing only string, number, boolean, or null cells'
  );
  const invalidJson = () => new ExportInputError(400, 'Invalid JSON: expected an array of row arrays');

  try {
    for await (const token of tokens) {
      if (!started) {
        if (token.name !== 'startArray' && token.name !== 'startObject') throw invalidShape();
        started = true;
        format = token.name === 'startArray' ? 'array' : 'table';
        depth = 1;
        continue;
      }
      if (token.name === 'keyValue' && format === 'table' && depth === 1) {
        if (token.value === 'headers' && !headersRead && !section) {
          section = 'headers';
        } else if (token.value === 'rows' && headersRead && !rowsRead && !section) {
          section = 'rows';
        } else {
          throw new ExportInputError(400, 'Object payload must contain "headers" followed by "rows", with no other properties');
        }
        continue;
      }
      if (token.name === 'startArray') {
        depth += 1;
        if (format === 'table' && section === 'rows' && depth === 2) {
          rowsRead = true;
          yield { cells: headerRow, header: true };
          headerRow = undefined;
          continue;
        }
        const isHeader = format === 'table' && section === 'headers' && depth === 2;
        const isData = format === 'array' ? depth === 2 : section === 'rows' && depth === 3;
        if (!isHeader && !isData) {
          if (format === 'array' && depth > 2) throw invalidJson();
          throw invalidShape();
        }
        if (++rowCount > MAX_ROWS) throw new ExportInputError(413, 'Excel supports at most 1048576 rows');
        row = [];
        rowLength = 0;
      } else if (token.name === 'endArray') {
        if (row) {
          const cells = row;
          row = undefined;
          if (format === 'table' && section === 'headers') {
            headerRow = cells;
            headersRead = true;
            section = undefined;
          } else {
            yield { cells, header: false };
          }
        } else if (format === 'table' && section === 'rows' && depth === 2) {
          section = undefined;
        } else if (format !== 'array' || depth !== 1) {
          throw invalidShape();
        }
        depth -= 1;
      } else if (token.name === 'endObject' && format === 'table' && depth === 1) {
        if (!headersRead || !rowsRead || section) throw invalidShape();
        depth -= 1;
      } else {
        if (format === 'array' && depth === 2 && token.name === 'startObject') throw invalidJson();
        if (!row) throw invalidShape();
        if (section === 'headers' && token.name !== 'stringValue') {
          throw new ExportInputError(400, 'Headers must contain only strings');
        }
        let value;
        switch (token.name) {
          case 'stringValue':
            if (token.value.length > MAX_CELL_LENGTH) {
              throw new ExportInputError(413, 'Cell content must not exceed 32767 characters');
            }
            if (INVALID_XML.test(token.value)) {
              throw new ExportInputError(400, 'Cell text contains characters that Excel cannot represent');
            }
            value = token.value;
            break;
          case 'numberValue':
            value = Number(token.value);
            if (!Number.isFinite(value)) throw new ExportInputError(400, 'Cell numbers must be finite');
            break;
          case 'trueValue': value = true; break;
          case 'falseValue': value = false; break;
          case 'nullValue': value = null; break;
          default: throw invalidShape();
        }
        if (row.length === MAX_COLUMNS) throw new ExportInputError(413, 'Excel supports at most 16384 columns per row');
        rowLength += token.value?.length ?? 0;
        if (rowLength > MAX_ROW_LENGTH) throw new ExportInputError(413, 'A row must not exceed 4194304 characters');
        row.push(value);
      }
    }
    if (!started || depth !== 0) throw invalidShape();
  } catch (error) {
    if (error !== parserError || error === uploadError) throw error;
    if (error instanceof RangeError && error.message.includes('maxPackedLength')) {
      throw new ExportInputError(413, 'Cell content must not exceed 32767 characters', error);
    }
    throw new ExportInputError(400, 'Invalid JSON: expected an array of row arrays', error);
  } finally {
    request.unpipe(tokens);
    request.off('error', failUpload);
    request.off('aborted', abortUpload);
    tokens.destroy();
  }
}

module.exports = { exportRows, ExportInputError };
