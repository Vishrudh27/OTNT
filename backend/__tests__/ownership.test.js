// isOTNTOwned() is the single choke point every destructive WireGuard
// operation in wireguard.js routes through (see the file's header comment).
// The whole point of the ownership model is the strict AND: prefix match
// AND registry membership. Both mismatch directions must be treated as
// "not ours" — this is what stops OTNT from ever touching a user's own
// wg0, and what this test exists to pin down.
jest.mock('../redisClient', () => ({
  client: {
    sIsMember: jest.fn(),
    sMembers: jest.fn(),
    sAdd: jest.fn(),
    sRem: jest.fn()
  }
}));
jest.mock('child_process', () => ({ exec: jest.fn() }));

const { client: redis } = require('../redisClient');
const wireguard = require('../wireguard');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isOTNTOwned truth table', () => {
  test('otnt-prefixed AND registered -> owned', async () => {
    redis.sIsMember.mockResolvedValue(true);
    await expect(wireguard.isOTNTOwned('otnt0')).resolves.toBe(true);
    expect(redis.sIsMember).toHaveBeenCalledWith('otnt:ifaces', 'otnt0');
  });

  test('otnt-prefixed but NOT registered -> not owned (mismatch, not "probably ours")', async () => {
    redis.sIsMember.mockResolvedValue(false);
    await expect(wireguard.isOTNTOwned('otnt5')).resolves.toBe(false);
  });

  test('registered in Redis but name does NOT have the otnt prefix -> not owned', async () => {
    // Simulate a registry entry that doesn't match the prefix (e.g. corrupted
    // or manually-inserted data) — the prefix check must short-circuit
    // before ever consulting Redis for this case.
    redis.sIsMember.mockResolvedValue(true);
    await expect(wireguard.isOTNTOwned('wg0')).resolves.toBe(false);
    expect(redis.sIsMember).not.toHaveBeenCalled();
  });

  test('neither prefixed nor registered -> not owned', async () => {
    redis.sIsMember.mockResolvedValue(false);
    await expect(wireguard.isOTNTOwned('eth0')).resolves.toBe(false);
  });

  test('fails closed when Redis is unreachable — never treats an interface as owned on uncertainty', async () => {
    redis.sIsMember.mockRejectedValue(new Error('connection lost'));
    await expect(wireguard.isOTNTOwned('otnt0')).resolves.toBe(false);
  });

  test.each([null, undefined, 123, '', 'OTNT0'])(
    'rejects non-matching/invalid name %p without touching Redis',
    async (name) => {
      await expect(wireguard.isOTNTOwned(name)).resolves.toBe(false);
      expect(redis.sIsMember).not.toHaveBeenCalled();
    }
  );
});

describe('deleteTunnel() refuses to touch anything not owned', () => {
  test('throws on a syntactically invalid ifaceName before ever checking ownership', async () => {
    await expect(wireguard.deleteTunnel('not valid; rm -rf')).rejects.toThrow(/Refusing to delete/);
    expect(redis.sIsMember).not.toHaveBeenCalled();
  });

  test('throws on a well-formed but unowned name (e.g. a real wg0)', async () => {
    redis.sIsMember.mockResolvedValue(false);
    await expect(wireguard.deleteTunnel('wg0')).rejects.toThrow(/not OTNT-owned/);
  });

  test('throws on an otnt-prefixed name that was never registered', async () => {
    redis.sIsMember.mockResolvedValue(false);
    await expect(wireguard.deleteTunnel('otnt99')).rejects.toThrow(/not OTNT-owned/);
  });
});

describe('cleanupIface() refuses to touch anything not owned', () => {
  test('returns false without ever calling exec against an unowned interface', async () => {
    redis.sIsMember.mockResolvedValue(false);
    const cp = require('child_process');
    const result = await wireguard.cleanupIface('wg0');
    expect(result).toBe(false);
    expect(cp.exec).not.toHaveBeenCalled();
  });
});
