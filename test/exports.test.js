const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');
const jwt = require('jsonwebtoken');
const { unzipSync, strFromU8 } = require('fflate');

const databasePath = require.resolve('../src/config/database');
require.cache[databasePath] = {
  id: databasePath, filename: databasePath, loaded: true,
  exports: { query() { throw new Error('Export tests must not access a configured database'); } }
};

test('streams authenticated JSON rows into an Excel download', { timeout: 30000 }, async (t) => {
  process.env.JWT_SECRET = 'export-test-secret';
  const User = require('../src/models/User');
  let active = true;
  t.mock.method(User, 'isActive', async () => active);
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const url = `http://127.0.0.1:${server.address().port}/exports/xlsx`;
  const cookie = `token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`;
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const post = (body, options = {}) => fetch(url, {
    method: 'POST', headers, body, ...options
  });
  const sheet = async (response) => {
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    assert.ok(files['[Content_Types].xml']);
    assert.ok(files['xl/workbook.xml']);
    return strFromU8(files['xl/worksheets/sheet1.xml']);
  };
  const streamingRequest = () => {
    const request = http.request(url, { method: 'POST', headers });
    const errors = [];
    request.on('error', (error) => errors.push(error));
    const response = once(request, 'response').then(([value]) => value);
    return { request, response, errors };
  };

  await t.test('preserves existing health and authenticated route wiring', async () => {
    const origin = new URL(url).origin;
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'Auth Service running' });
    for (const path of ['/auth/me', '/products', '/roles', '/permissions', '/users']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 401, path);
    }
  });

  await t.test('authenticates before parsing and rejects inactive users', async () => {
    let response = await post('not json', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(response.status, 401);
    active = false;
    response = await post('not json');
    assert.equal(response.status, 401);
    active = true;
  });

  await t.test('preserves row/column positions, primitive types, Unicode and literal formula-like text', async () => {
    const response = await post(JSON.stringify([
      ['Name', 'Price', 'Active', 'Empty', 'Last'],
      ['Mug <&> "€🙂"', 12.5, true, null, '=SUM(1,2)'],
      [null, 0, false],
      []
    ]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="export.xlsx"');
    assert.equal(response.headers.get('content-length'), null);
    const xml = await sheet(response);
    assert.match(xml, /Mug &lt;&amp;&gt;/);
    assert.match(xml, /€/);
    assert.match(xml, /🙂/);
    assert.match(xml, /<c r="B2"[^>]*>.*?<v>12\.5<\/v>/s);
    assert.match(xml, /<c r="C2" t="b"(?: s="\d+")?><v>1<\/v>/);
    assert.match(xml, /<c r="B3"[^>]*>.*?<v>0<\/v>/s);
    assert.match(xml, /<c r="C3" t="b"><v>0<\/v>/);
    assert.match(xml, /<c r="E2" t="inlineStr"(?: s="\d+")?>.*?=SUM\(1,2\)/s);
    assert.doesNotMatch(xml, /<f[ >]/);
    assert.match(xml, /<row r="4"/);
    assert.match(xml, /<c r="A1" t="inlineStr"><is><t>Name/);
  });

  await t.test('supports an empty workbook and requests larger than the normal JSON body limit', async () => {
    const empty = await post('[]');
    assert.equal(empty.status, 200);
    assert.doesNotMatch(await sheet(empty), /<row[ >]/);
    const response = await post(JSON.stringify([Array(4).fill('x'.repeat(32767))]));
    assert.equal(response.status, 200);
    assert.match(await sheet(response), /<c r="D1"/);
  });

  await t.test('separates styled headers from banded data while preserving cell types and positions', async () => {
    const response = await post(JSON.stringify({
      headers: ['Product', 'Price', 'In stock'],
      rows: [['Mug', 12.5, true], ['Plate', null, false]]
    }));
    assert.equal(response.status, 200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
    const styles = strFromU8(files['xl/styles.xml']);
    assert.match(xml, /<c r="A1" t="inlineStr" s="1">.*?Product/s);
    assert.match(xml, /<c r="C1" t="inlineStr" s="1">.*?In stock/s);
    assert.match(xml, /<c r="B2" t="n"><v>12\.5<\/v>/);
    assert.match(xml, /<c r="C2" t="b"><v>1<\/v>/);
    assert.match(xml, /<c r="A3" t="inlineStr" s="2">.*?Plate/s);
    assert.match(xml, /<c r="B3" s="2"\/>/);
    assert.match(xml, /<c r="C3" t="b" s="2"><v>0<\/v>/);
    const colors = [...styles.matchAll(/<fgColor rgb="([A-F0-9]+)"\/>/g)].map((match) => match[1]);
    assert.equal(new Set(colors).size, 2, 'Header and band fills must be distinct');

    const empty = await post('{"headers":["Product"],"rows":[]}');
    assert.equal(empty.status, 200);
    const emptyXml = await sheet(empty);
    assert.match(emptyXml, /Product/);
    assert.doesNotMatch(emptyXml, /<row r="2"/);
  });

  await t.test('accepts a frontend filename and safely encodes Unicode download headers', async () => {
    for (const [filename, expected] of [
      ['products', 'attachment; filename="products.xlsx"'],
      ['Stock report.XLSX', 'attachment; filename="Stock report.XLSX"']
    ]) {
      const named = await fetch(`${url}?filename=${encodeURIComponent(filename)}`, {
        method: 'POST', headers, body: '[["Mug"]]'
      });
      assert.equal(named.status, 200);
      assert.equal(named.headers.get('content-disposition'), expected);
      assert.match(await sheet(named), /Mug/);
    }
    const unicode = await fetch(`${url}?filename=${encodeURIComponent('商品.xlsx')}`, {
      method: 'POST', headers, body: '[]'
    });
    assert.equal(unicode.status, 200);
    assert.match(unicode.headers.get('content-disposition'), /filename\*=UTF-8''%E5%95%86%E5%93%81.xlsx/);
    await sheet(unicode);

    for (const query of [
      'filename=', 'filename=..', 'filename=..%2Fsecret', 'filename=a%5Cb',
      'filename=x%0D%0AX-Test%3Avalue', 'filename=a&filename=b', 'filename[x]=a',
      `filename=${'x'.repeat(201)}`
    ]) {
      const response = await fetch(`${url}?${query}`, { method: 'POST', headers, body: '[]' });
      assert.equal(response.status, 400, query);
      assert.equal(response.headers.get('content-disposition'), null);
      assert.equal(typeof (await response.json()).error, 'string');
    }
  });

  await t.test('validates header shape, property order and header limits before starting the file', async () => {
    for (const body of [
      '{"headers":"Name","rows":[]}', '{"headers":[1],"rows":[]}',
      '{"headers":[{}],"rows":[]}', '{"rows":[],"headers":["Name"]}',
      '{"headers":["Name"]}', '{"headers":[],"headers":[],"rows":[]}',
      '{"headers":[],"rows":{}}', '{"extra":true,"headers":[],"rows":[]}'
    ]) {
      const response = await post(body);
      assert.equal(response.status, 400, body);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    for (const headers of [['x'.repeat(32768)], Array(16385).fill('x')]) {
      const response = await post(JSON.stringify({ headers, rows: [] }));
      assert.equal(response.status, 413);
      await response.json();
    }
  });

  await t.test('rejects invalid input and unsupported media before sending workbook bytes', async () => {
    for (const body of ['{}', '[1]', '[[{}]]', '[[[1]]]', '[bad', '[] trailing', '[[1e999]]', '[["\\u0000"]]']) {
      const response = await post(body);
      assert.equal(response.status, 400, body);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    for (const body of [
      JSON.stringify([['x'.repeat(32768)]]),
      JSON.stringify([Array(16385).fill(null)]),
      JSON.stringify([Array(129).fill('x'.repeat(32767))])
    ]) {
      const response = await post(body);
      assert.equal(response.status, 413);
      assert.equal(typeof (await response.json()).error, 'string');
    }
    for (const extraHeaders of [
      { 'Content-Type': 'text/plain' },
      { 'Content-Encoding': 'gzip' }
    ]) {
      const response = await post('[]', { headers: { ...headers, ...extraHeaders } });
      assert.equal(response.status, 415);
    }
  });

  await t.test('starts sending XLSX bytes before upload completion and continues generating subsequent rows', async () => {
    const { request, response: pendingResponse } = streamingRequest();
    request.write('[["first"],');
    const response = await pendingResponse;
    assert.equal(response.statusCode, 200);
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    const complete = finished(response);
    await once(response, 'data');
    assert.equal(request.writableEnded, false);
    assert.equal(Buffer.concat(chunks).subarray(0, 2).toString(), 'PK');
    request.end('["second"]]');
    await complete;
    const files = unzipSync(Buffer.concat(chunks));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
    assert.match(xml, /first/);
    assert.match(xml, /second/);
  });

  await t.test('streams object payloads before the data upload finishes and aborts on invalid late rows', async () => {
    for (const valid of [true, false]) {
      const { request, response: pendingResponse } = streamingRequest();
      request.write('{"headers":["Product"],"rows":[["first"],');
      const response = await pendingResponse;
      assert.equal(response.statusCode, 200);
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      const complete = finished(response);
      await once(response, 'data');
      assert.equal(request.writableEnded, false);
      request.end(valid ? '["second"]]}' : '[{}]]}');
      if (valid) {
        await complete;
        const files = unzipSync(Buffer.concat(chunks));
        const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
        assert.match(xml, /<c r="A1" t="inlineStr" s="1">.*?Product/s);
        assert.match(xml, /<c r="A3" t="inlineStr" s="2">.*?second/s);
      } else {
        await assert.rejects(complete);
        assert.equal(response.complete, false);
      }
    }
  });

  await t.test('rejects an oversized unfinished cell without waiting for the upload to finish', async () => {
    const { request, response: pendingResponse } = streamingRequest();
    request.write('[["' + 'x'.repeat(131072));
    const response = await pendingResponse;
    assert.equal(response.statusCode, 413);
    assert.equal(request.writableEnded, false);
    let body = '';
    for await (const chunk of response) body += chunk;
    assert.match(JSON.parse(body).error, /32767/);
    request.destroy();
  });

  await t.test('aborts rather than serving a success-shaped workbook when late JSON is invalid', async () => {
    const { request, response: pendingResponse } = streamingRequest();
    request.write('[["first"],');
    const response = await pendingResponse;
    const complete = finished(response);
    response.resume();
    await once(response, 'data');
    request.end('{"not":"a row"}]');
    await assert.rejects(complete);
    assert.equal(response.complete, false);
  });

  await t.test('cleans up an interrupted upload/download and serves the next request', async () => {
    const { request, response: pendingResponse } = streamingRequest();
    request.write('[["first"],');
    const response = await pendingResponse;
    const complete = finished(response);
    response.resume();
    await once(response, 'data');
    response.destroy();
    request.destroy();
    await assert.rejects(complete);
    const next = await post('[["still working"]]');
    assert.equal(next.status, 200);
    assert.match(await sheet(next), /still working/);
  });
});
