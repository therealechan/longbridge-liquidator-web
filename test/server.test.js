const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/server');

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.local, true);
    assert.equal(typeof res.body.sdk, 'boolean');
  });

  it('returns the package.json version', async () => {
    const pkg = require('../package.json');
    const res = await request(app).get('/api/health');
    assert.equal(typeof res.body.version, 'string');
    assert.equal(res.body.version, pkg.version);
  });
});

describe('CORS', () => {
  const allowed = [
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
    'http://localhost:3456',
    'http://127.0.0.1:3456',
  ];

  for (const origin of allowed) {
    it(`echoes allowed origin ${origin}`, async () => {
      const res = await request(app).get('/api/health').set('Origin', origin);
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], origin);
    });
  }

  it('omits CORS headers for a disallowed origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('omits CORS headers when no Origin is sent', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('answers OPTIONS preflight with 204 and allow headers', async () => {
    const res = await request(app)
      .options('/api/positions')
      .set('Origin', 'tauri://localhost')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'tauri://localhost');
    assert.match(res.headers['access-control-allow-methods'], /POST/);
    assert.match(res.headers['access-control-allow-methods'], /OPTIONS/);
    assert.match(res.headers['access-control-allow-headers'], /Content-Type/i);
  });

  it('does not grant preflight to a disallowed origin', async () => {
    const res = await request(app)
      .options('/api/liquidate')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});

describe('GET / (static)', () => {
  it('serves index.html', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /html/);
    assert.match(res.text, /Liquidator/);
  });
});

describe('POST /api/positions', () => {
  it('returns 503 when SDK unavailable and credentials provided', async () => {
    // SDK may or may not be available in test env; if unavailable, expect 503
    const res = await request(app)
      .post('/api/positions')
      .send({ app_key: 'test', app_secret: 'test', access_token: 'test' });
    // Either 503 (no SDK) or 500 (SDK present but bad creds) is acceptable
    assert.ok([500, 503].includes(res.status));
  });

  it('returns error without credentials', async () => {
    const res = await request(app)
      .post('/api/positions')
      .send({});
    assert.ok(res.status >= 400);
  });
});

describe('POST /api/liquidate', () => {
  it('rejects missing positions array', async () => {
    const res = await request(app)
      .post('/api/liquidate')
      .send({ app_key: 'k', app_secret: 's' });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects empty positions array', async () => {
    const res = await request(app)
      .post('/api/liquidate')
      .send({ app_key: 'k', app_secret: 's', positions: [] });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects invalid symbol format', async () => {
    const res = await request(app)
      .post('/api/liquidate')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: '<script>', quantity: 10 }],
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects non-positive quantity', async () => {
    const res = await request(app)
      .post('/api/liquidate')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: -1 }],
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects non-integer quantity', async () => {
    const res = await request(app)
      .post('/api/liquidate')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: 1.5 }],
      });
    assert.ok([400, 503].includes(res.status));
  });
});

describe('POST /api/buyback', () => {
  it('rejects missing positions array', async () => {
    const res = await request(app)
      .post('/api/buyback')
      .send({ app_key: 'k', app_secret: 's' });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects invalid symbol', async () => {
    const res = await request(app)
      .post('/api/buyback')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'DROP TABLE', quantity: 10 }],
      });
    assert.ok([400, 503].includes(res.status));
  });
});

describe('POST /api/conditional-order', () => {
  it('rejects missing positions array', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({ app_key: 'k', app_secret: 's', orderConfig: { type: 'stop-loss', percentage: 5, timeInForce: 'Day' } });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects missing orderConfig', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: 10, currentPrice: 150 }],
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects invalid type', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: 10, currentPrice: 150 }],
        orderConfig: { type: 'invalid', percentage: 5, timeInForce: 'Day' },
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects percentage out of range (0)', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: 10, currentPrice: 150 }],
        orderConfig: { type: 'stop-loss', percentage: 0, timeInForce: 'Day' },
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects percentage out of range (100)', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: 'AAPL.US', quantity: 10, currentPrice: 150 }],
        orderConfig: { type: 'stop-loss', percentage: 100, timeInForce: 'Day' },
      });
    assert.ok([400, 503].includes(res.status));
  });

  it('rejects invalid symbol', async () => {
    const res = await request(app)
      .post('/api/conditional-order')
      .send({
        app_key: 'k', app_secret: 's',
        positions: [{ symbol: '<script>', quantity: 10, currentPrice: 150 }],
        orderConfig: { type: 'stop-loss', percentage: 5, timeInForce: 'Day' },
      });
    assert.ok([400, 503].includes(res.status));
  });
});
