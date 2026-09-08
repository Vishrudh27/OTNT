#!/usr/bin/env node
/**
 * reap.js — operator escape hatch for the accepted registry-loss failure mode.
 * ------------------------------------------------------------------------
 * OTNT's ownership check (wireguard.js's isOTNTOwned()) requires BOTH an
 * `otnt<N>` interface name AND Redis registry membership before any
 * automatic cleanup path (cleanupStaleTunnels, cleanupIface, createTunnel's
 * pre-check) will touch a kernel interface. This is deliberate fail-safe
 * design: if the Redis registry is ever lost (a manual FLUSHALL, a Redis
 * restore from an older backup, etc.) while a real `otnt*` interface is
 * still up, OTNT will NOT reclaim it automatically — reclaiming based on
 * name prefix alone would risk deleting an interface a human happened to
 * name `otnt*` for unrelated reasons.
 *
 * That safety means registry loss needs a human in the loop to actually
 * clean up the resulting orphans. This script is that human-in-the-loop
 * tool: it lists every `otnt*` interface present in the kernel that is
 * NOT in the Redis registry (i.e. every interface the automatic cleanup
 * paths will always refuse to touch), and only tears them down after an
 * explicit typed confirmation — never automatically, never silently.
 *
 * Usage:
 *   npm run reap            List orphaned otnt* interfaces (no changes made).
 *   npm run reap -- --yes   List, then delete them after typed confirmation.
 */

const util = require('util');
const cp = require('child_process');
const exec = util.promisify(cp.exec);
const readline = require('readline');

const wireguard = require('../wireguard');
const { connectRedis, client: redis } = require('../redisClient');

async function listOTNTKernelInterfaces() {
  try {
    const { stdout } = await exec('ip -o link show | grep otnt || true');
    if (!stdout.trim()) return [];
    return stdout.trim().split('\n')
      .map((line) => line.split(':')[1]?.trim())
      .filter(Boolean)
      .filter((name) => name.startsWith(wireguard.OTNT_IFACE_PREFIX));
  } catch (e) {
    console.error('[REAP] Failed to list kernel interfaces:', e.message);
    return [];
  }
}

async function findOrphans() {
  const kernelIfaces = await listOTNTKernelInterfaces();
  const orphans = [];
  for (const iface of kernelIfaces) {
    // isOTNTOwned() is the same check every automatic cleanup path uses to
    // decide whether it's allowed to touch an interface. If it says "not
    // owned" for a name that already has the otnt prefix, the only reason
    // is registry loss — the exact case this script exists for.
    const owned = await wireguard.isOTNTOwned(iface);
    if (!owned) orphans.push(iface);
  }
  return orphans;
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function tearDown(iface) {
  console.log(`[REAP] Tearing down ${iface}...`);
  try { await exec(`sudo wg-quick down ${iface}`); } catch (e) { console.warn(`  wg-quick down: ${e.message}`); }
  try { await exec(`sudo ip link delete ${iface}`); } catch (e) { console.warn(`  ip link delete: ${e.message}`); }
  try { await exec(`sudo ip addr flush dev ${iface}`); } catch (e) { console.warn(`  ip addr flush: ${e.message}`); }
  console.log(`[REAP] ${iface} removed.`);
}

async function main() {
  const autoConfirm = process.argv.includes('--yes');

  await connectRedis();

  const orphans = await findOrphans();

  if (orphans.length === 0) {
    console.log('[REAP] No orphaned otnt* interfaces found. Registry and kernel state agree.');
    await redis.quit();
    return;
  }

  console.log(`[REAP] Found ${orphans.length} orphaned otnt* interface(s) present in the kernel but NOT in the Redis registry (otnt:ifaces):`);
  orphans.forEach((iface) => console.log(`  - ${iface}`));
  console.log('These will never be touched automatically — see the comment at the top of this file for why.');

  if (!autoConfirm) {
    console.log('\nRun with --yes to delete them after a confirmation prompt, e.g.:');
    console.log('  npm run reap -- --yes');
    await redis.quit();
    return;
  }

  const answer = await askConfirmation(
    `\nType "delete" to permanently tear down these ${orphans.length} interface(s), anything else to abort: `
  );

  if (answer !== 'delete') {
    console.log('[REAP] Aborted — no changes made.');
    await redis.quit();
    return;
  }

  for (const iface of orphans) {
    await tearDown(iface);
  }

  await redis.quit();
}

main().catch((e) => {
  console.error('[REAP] Fatal error:', e);
  process.exit(1);
});
