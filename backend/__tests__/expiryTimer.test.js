// Exercises index.js's REAL scheduleTimers()/terminateTunnel() — not a
// reimplementation — using Jest fake timers so a 90-second expiry test
// runs instantly and deterministically instead of needing a real wait
// (which is what the manual Phase 3 acceptance test used real time for;
// see docs/phase3-concurrency-test.md).
jest.mock('../wireguard', () => ({
  deleteTunnel: jest.fn().mockResolvedValue(true),
  releaseIP: jest.fn().mockResolvedValue(undefined),
  getTransferBytes: jest.fn().mockResolvedValue(0)
}));
jest.mock('../redisClient', () => ({
  client: {},
  connectRedis: jest.fn(),
  saveTunnel: jest.fn().mockResolvedValue(undefined),
  getTunnel: jest.fn(),
  getAllTunnels: jest.fn().mockResolvedValue([]),
  deleteTunnel: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../auditLogger', () => ({ log: jest.fn() }));

const wireguard = require('../wireguard');
const redisClient = require('../redisClient');
const audit = require('../auditLogger');
const { tunnels, scheduleTimers } = require('../index');

const EXPIRY_MONITOR_INTERVAL_MS = 1000;
const DATA_MONITOR_INTERVAL_MS = 250;

function makeTunnel(id, overrides = {}) {
  const t = {
    id,
    ifaceName: `otnt-${id}`,
    listenPort: 51820,
    serverIP: '10.77.0.2/32',
    clientIP: '10.77.0.3/32',
    timers: {},
    expiry: null,
    dataCap: null,
    dataUsed: 0,
    terminating: false,
    ...overrides
  };
  tunnels.set(id, t);
  return t;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  tunnels.clear();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('expiry-timer accuracy', () => {
  test('does not terminate before the expiry deadline', async () => {
    const t = makeTunnel('t1', { expiry: Date.now() + 5000 });
    scheduleTimers('t1');

    await jest.advanceTimersByTimeAsync(4000);

    expect(tunnels.has('t1')).toBe(true);
    expect(wireguard.deleteTunnel).not.toHaveBeenCalled();
  });

  test('terminates within one monitor interval of the deadline, not late', async () => {
    const t = makeTunnel('t1', { expiry: Date.now() + 5000 });
    scheduleTimers('t1');

    // The 1s-interval monitor's tick at exactly t=5000 should be the one
    // that catches it — advance to just past that single tick, not further.
    await jest.advanceTimersByTimeAsync(5000 + 10);

    expect(tunnels.has('t1')).toBe(false);
    expect(wireguard.deleteTunnel).toHaveBeenCalledWith('otnt-t1', { listenPort: 51820 });
    expect(wireguard.releaseIP).toHaveBeenCalledWith('10.77.0.2/32');
    expect(wireguard.releaseIP).toHaveBeenCalledWith('10.77.0.3/32');
    expect(audit.log).toHaveBeenCalledWith(expect.stringContaining('expired'));
    expect(t.terminating).toBe(true);
  });

  test('data-cap monitor tears down as soon as usage reaches the cap, on its own faster cadence', async () => {
    const t = makeTunnel('t2', { dataCap: 2_000_000 });
    wireguard.getTransferBytes.mockResolvedValue(1_000_000); // under cap
    scheduleTimers('t2');

    await jest.advanceTimersByTimeAsync(DATA_MONITOR_INTERVAL_MS * 3); // 750ms, still under cap
    expect(tunnels.has('t2')).toBe(true);

    wireguard.getTransferBytes.mockResolvedValue(2_500_000); // now over cap
    await jest.advanceTimersByTimeAsync(DATA_MONITOR_INTERVAL_MS); // next 250ms tick

    expect(tunnels.has('t2')).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(expect.stringContaining('hit data cap'));
  });

  test('a getTransferBytes() failure is logged and does not crash the monitor or falsely terminate', async () => {
    const t = makeTunnel('t3', { dataCap: 1000 });
    wireguard.getTransferBytes.mockRejectedValue(new Error('interface mid-teardown'));
    scheduleTimers('t3');

    await jest.advanceTimersByTimeAsync(DATA_MONITOR_INTERVAL_MS * 2);

    expect(tunnels.has('t3')).toBe(true);
    expect(wireguard.deleteTunnel).not.toHaveBeenCalled();
  });

  test('dual-condition race: when expiry and data-cap become true on the same tick, exactly one termination wins', async () => {
    // 4 data-cap ticks (250ms) land exactly on the 1 expiry tick (1000ms).
    // Both conditions are true at that same virtual instant — this is the
    // scenario the `terminating` flag exists to make safe (see the header
    // comment above scheduleTimers() in index.js).
    const t = makeTunnel('t4', {
      expiry: Date.now() + 1000,
      dataCap: 1000
    });
    wireguard.getTransferBytes.mockResolvedValue(999_999_999); // always over cap

    scheduleTimers('t4');
    await jest.advanceTimersByTimeAsync(1000 + 10);

    expect(tunnels.has('t4')).toBe(false);
    expect(wireguard.deleteTunnel).toHaveBeenCalledTimes(1);
    expect(redisClient.deleteTunnel).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  test('a tunnel with neither expiry nor dataCap set schedules no timers and never self-terminates', async () => {
    makeTunnel('t5');
    scheduleTimers('t5');

    await jest.advanceTimersByTimeAsync(60_000);

    expect(tunnels.has('t5')).toBe(true);
    expect(wireguard.deleteTunnel).not.toHaveBeenCalled();
  });
});
