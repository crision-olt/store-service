const express = require('express');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const XlsxStreamWriter = require('xlsx-stream-writer');
const { authenticateToken } = require('../middleware/auth');
const { exportRows, ExportInputError } = require('../utils/export-rows');

const router = express.Router();

router.post('/xlsx', authenticateToken, async (req, res) => {
  if (!req.is('application/json') || ![undefined, 'identity'].includes(req.headers['content-encoding'])) {
    return res.status(415).json({ error: 'Send uncompressed application/json containing an array of row arrays' });
  }
  const requestedFilename = req.query.filename ?? 'export.xlsx';
  if (typeof requestedFilename !== 'string' || Buffer.byteLength(requestedFilename) > 200 ||
      !requestedFilename.trim() || /^[.]{1,2}$/.test(requestedFilename.trim()) ||
      /[\\/\u0000-\u001F\u007F]/.test(requestedFilename)) {
    return res.status(400).json({ error: 'Filename must be a non-empty name of at most 200 UTF-8 bytes, without paths or control characters' });
  }
  const filename = /\.xlsx$/i.test(requestedFilename.trim())
    ? requestedFilename.trim() : `${requestedFilename.trim()}.xlsx`;
  const rows = exportRows(req);
  const onClose = () => {
    if (!res.writableFinished) req.destroy();
  };
  res.on('close', onClose);

  try {
    // Validate the first row before committing the download headers.
    const first = await rows.next();
    const hasHeader = !first.done && first.value.header;
    const workbook = new XlsxStreamWriter({
      inlineStrings: true,
      styles: [{ fill: 'FFE2E8F0' }, { fill: 'FFF8FAFC' }],
      styleIdFunc: (_value, _column, row) => {
        if (hasHeader && row === 0) return 1;
        return (row - Number(hasHeader)) % 2 === 1 ? 2 : 0;
      }
    });
    workbook.addRows((async function* () {
      if (!first.done) yield first.value.cells;
      for await (const row of rows) yield row.cells;
    })());
    res.attachment(filename).set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Expose-Headers': 'Content-Disposition'
    });
    await pipeline(Readable.fromWeb(workbook.getStream()), res);
  } catch (error) {
    if (req.aborted && ['ECONNRESET', 'ABORT_ERR', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code)) return;
    console.error('Excel export error:', error);
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.removeHeader('Content-Disposition');
    res.removeHeader('Content-Type');
    res.status(error instanceof ExportInputError ? error.status : 500)
      .set('Connection', 'close')
      .json({ error: error instanceof ExportInputError ? error.message : 'Failed to generate Excel file' });
  } finally {
    res.off('close', onClose);
    await rows.return();
  }
});

module.exports = router;
