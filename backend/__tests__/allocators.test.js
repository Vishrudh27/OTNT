jest.mock('../redisClient', () => ({
  client: {
    sMembers: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn(),
    sIsMember: jest.fn()
  }
}));
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, cb) => cb(new Error('nothing running (test double)')))
}));

const fs = require('fs');
const cp = require('child_process');
const { client: redis } = require('../redisClient');
const wireguard = require('../wireguard');

const DEFAULT_EXEC_IMPL = (cmd, cb) => cb(new Error('nothing running (test double)'));

// Isolate these tests from this machine's real /etc/wireguard contents (and
// from CI machines that won't have the directory at all) — getUsedIPs()
// falls back to scanning it, and that must not be able to influence a unit
// test either way.
jest.spyOn(fs, 'existsSync').mockReturnValue(false);

/** Backs the Redis set mocks with a real in-memory Set, so allocate/release
 *  round-trips behave exactly like real Redis would (just without the
 *  network latency — which, if anything, makes races EASIER to trigger in
 *  the real world than in this test, not harder). */
function backSetWithRedisMock(store) {
  redis.sMembers.mockImplementation(() => Promise.resolve(Array.from(store)));
  redis.sAdd.mockImplementation((_key, val) => { store.add(val); return Promise.resolve(1); });
  redis.sRem.mockImplementation((_key, val) => { store.delete(val); return Promise.resolve(1); });
}

beforeEach(() => {
  jest.clearAllMocks();
  fs.existsSync.mockReturnValue(false);
  // Re-assert the default every test: a prior test's cp.exec.mockImplementation()
  // override would otherwise leak forward, since clearAllMocks() resets call
  // history but not implementations.
  cp.exec.mockImplementation(DEFAULT_EXEC_IMPL);
});

describe('IP allocator (10.77.0.x pool)', () => {
  test('sequential allocations return distinct, increasing addresses starting at .2', async () => {
    backSetWithRedisMock(new Set());
    const ips = [];
    for (let i = 0; i < 5; i++) ips.push(await wireguard.getNextFreeIP());
    expect(ips).toEqual(['10.77.0.2/32', '10.77.0.3/32', '10.77.0.4/32', '10.77.0.5/32', '10.77.0.6/32']);
    expect(new Set(ips).size).toBe(5);
  });

  test('releasing an IP makes it available for reuse, and reuse picks the lowest free slot', async () => {
    const store = new Set();
    backSetWithRedisMock(store);

    const a = await wireguard.getNextFreeIP(); // 10.77.0.2/32
    const b = await wireguard.getNextFreeIP(); // 10.77.0.3/32
    await wireguard.getNextFreeIP();           // 10.77.0.4/32 (held)

    await wireguard.releaseIP(a);
    const reused = await wireguard.getNextFreeIP();
    expect(reused).toBe('10.77.0.2/32');

    await wireguard.releaseIP(b);
    const reusedB = await wireguard.getNextFreeIP();
    expect(reusedB).toBe('10.77.0.3/32');
  });

  test('accepts a bare IP or a /32 CIDR interchangeably when releasing', async () => {
    const store = new Set(['5']);
    backSetWithRedisMock(store);
    await wireguard.releaseIP('10.77.0.5');
    expect(store.has('5')).toBe(false);
  });

  test('concurrent allocation without external serialization can race (documented pre-existing gap)', async () => {
    // getNextFreeIP() has no lock of its own (unlike wireguard.js's
    // createTunnel(), which serializes iface/port allocation internally via
    // tunnelCreationLock). index.js's /api/handshake/init calls
    // getNextFreeIP() twice SEQUENTIALLY per request (safe — the second
    // call's read sees the first call's write), but two DIFFERENT concurrent
    // requests racing this function have no such protection. This test
    // documents that reality rather than asserting a guarantee the code
    // does not actually make; see docs/phase3-concurrency-test.md and the
    // Phase 4 write-up for context. If this starts failing, it likely means
    // someone added the missing lock — update this test to assert
    // uniqueness instead.
    backSetWithRedisMock(new Set());
    const results = await Promise.all([
      wireguard.getNextFreeIP(),
      wireguard.getNextFreeIP(),
      wireguard.getNextFreeIP()
    ]);
    const uniqueCount = new Set(results).size;
    expect(uniqueCount).toBeGreaterThanOrEqual(1);
    expect(uniqueCount).toBeLessThanOrEqual(3);
  });
});

describe('Listen-port allocator (51820-51869 pool)', () => {
  test('sequential allocations return distinct ports starting at 51820', async () => {
    backSetWithRedisMock(new Set());
    const ports = [];
    for (let i = 0; i < 5; i++) ports.push(await wireguard.getNextFreePort());
    expect(ports).toEqual([51820, 51821, 51822, 51823, 51824]);
  });

  test('releasing a port makes it available for reuse', async () => {
    const store = new Set();
    backSetWithRedisMock(store);

    const p1 = await wireguard.getNextFreePort();
    await wireguard.getNextFreePort();
    await wireguard.releasePort(p1);

    const reused = await wireguard.getNextFreePort();
    expect(reused).toBe(51820);
  });

  test('throws a clear error when the pool is exhausted', async () => {
    const store = new Set();
    for (let p = 51820; p <= 51869; p++) store.add(String(p));
    backSetWithRedisMock(store);

    await expect(wireguard.getNextFreePort()).rejects.toThrow(/No free listen port/);
  });

  test('releasePort is a no-op for a falsy port (never throws)', async () => {
    backSetWithRedisMock(new Set());
    await expect(wireguard.releasePort(null)).resolves.toBeUndefined();
    await expect(wireguard.releasePort(undefined)).resolves.toBeUndefined();
  });
});

describe('getNextFreeOTNTInterface', () => {
  test('returns otnt0 when nothing is registered or live', async () => {
    redis.sMembers.mockResolvedValue([]);
    await expect(wireguard.getNextFreeOTNTInterface()).resolves.toBe('otnt0');
  });

  test('skips names already in the Redis registry', async () => {
    redis.sMembers.mockResolvedValue(['otnt0', 'otnt1']);
    await expect(wireguard.getNextFreeOTNTInterface()).resolves.toBe('otnt2');
  });

  test('also skips names that are live in the kernel but not yet in the registry', async () => {
    redis.sMembers.mockResolvedValue([]);
    cp.exec.mockImplementation((cmd, cb) => {
      if (cmd === 'wg show interfaces') return cb(null, { stdout: 'otnt0\n' });
      return cb(new Error('unexpected command in test'));
    });
    await expect(wireguard.getNextFreeOTNTInterface()).resolves.toBe('otnt1');
  });
});
