// getTransferBytes() deliberately THROWS on a read failure instead of
// returning 0 (see the FIX comment above it in wireguard.js) — a transient
// read failure must never stomp a tunnel's real accumulated dataUsed with a
// misleading 0, which could reset how close a tunnel looks to its data cap.
// index.js's callers are required to catch and keep the last known good
// value. This is a coordinated contract between the two files; this test
// pins the wireguard.js half of it down.
jest.mock('../redisClient', () => ({
  client: { sIsMember: jest.fn(), sMembers: jest.fn(), sAdd: jest.fn(), sRem: jest.fn() }
}));
jest.mock('child_process', () => ({ exec: jest.fn() }));

const cp = require('child_process');
const wireguard = require('../wireguard');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTransferBytes contract', () => {
  test('sums rx+tx across all peers on a successful read', async () => {
    cp.exec.mockImplementation((cmd, cb) => {
      expect(cmd).toBe('sudo wg show otnt0 transfer');
      cb(null, { stdout: 'peerA\t1000\t2000\npeerB\t500\t1500\n' });
    });
    await expect(wireguard.getTransferBytes('otnt0')).resolves.toBe(1000 + 2000 + 500 + 1500);
  });

  test('throws (does NOT return 0) when the underlying command fails', async () => {
    cp.exec.mockImplementation((cmd, cb) => cb(new Error('wg: otnt0 does not exist')));
    await expect(wireguard.getTransferBytes('otnt0')).rejects.toThrow();
  });

  test('throws on a malformed/unsafe ifaceName before ever calling exec', async () => {
    await expect(wireguard.getTransferBytes('otnt0; rm -rf /')).rejects.toThrow(/Invalid ifaceName/);
    expect(cp.exec).not.toHaveBeenCalled();
  });

  test('treats an interface with no peers (empty output) as zero transfer, not an error', async () => {
    cp.exec.mockImplementation((cmd, cb) => cb(null, { stdout: '' }));
    await expect(wireguard.getTransferBytes('otnt0')).resolves.toBe(0);
  });
});
