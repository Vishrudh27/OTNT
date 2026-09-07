// cryptoUtils.js — pure crypto helpers, extracted out of index.js.
//
// This file has NO side effects on require (no server, no Redis, no
// WireGuard) — that is the whole point of it existing separately, since
// index.js calls main() unconditionally at the bottom and can't safely be
// required by a test. index.js requires these same functions from here
// instead of defining them inline, so unit tests exercise the exact
// production code path rather than a reimplementation of it.
const nacl = require('tweetnacl');
const crypto = require('crypto');

const u8ToB64 = (u8) => Buffer.from(u8).toString('base64');
const b64ToU8 = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

/** Validates that a string is a well-formed X25519 key encoded as base64. */
function isValidX25519KeyB64(value) {
  if (typeof value !== 'string') return false;
  if (!/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/** Generates a fresh X25519 (WireGuard-compatible) keypair. */
function generateWireGuardKeys() {
  const kp = nacl.box.keyPair();
  return { privateKey: u8ToB64(kp.secretKey), publicKey: u8ToB64(kp.publicKey) };
}

/** X25519 ECDH: derives the shared secret from one side's private key and the other's public key. */
function deriveSharedSecret(privateKeyU8, publicKeyU8) {
  return nacl.scalarMult(privateKeyU8, publicKeyU8);
}

/**
 * AES-256-GCM encrypts `plaintext` under a key derived as sha256(sharedSecret),
 * matching POST /api/tunnel/:id/client-config exactly. Returns base64 iv/tag/ciphertext.
 */
function encryptWithSharedSecret(sharedSecretU8, plaintext) {
  const aesKey = crypto.createHash('sha256').update(Buffer.from(sharedSecretU8)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

module.exports = {
  u8ToB64,
  b64ToU8,
  isValidX25519KeyB64,
  generateWireGuardKeys,
  deriveSharedSecret,
  encryptWithSharedSecret
};
