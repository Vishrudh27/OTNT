const crypto = require('crypto');
const nacl = require('tweetnacl');
const {
  isValidX25519KeyB64,
  generateWireGuardKeys,
  deriveSharedSecret,
  encryptWithSharedSecret,
  u8ToB64,
  b64ToU8
} = require('../cryptoUtils');

describe('isValidX25519KeyB64', () => {
  test('accepts a genuine 32-byte X25519 public key encoded as base64', () => {
    const kp = nacl.box.keyPair();
    expect(isValidX25519KeyB64(u8ToB64(kp.publicKey))).toBe(true);
  });

  test.each([
    ['non-string input', 12345],
    ['empty string', ''],
    ['not base64 at all', '!!!not-base64!!!'],
    ['valid base64 but wrong length (16 bytes)', u8ToB64(crypto.randomBytes(16))],
    ['valid base64 but wrong length (33 bytes)', u8ToB64(crypto.randomBytes(33))],
    ['null', null],
    ['undefined', undefined]
  ])('rejects %s', (_label, value) => {
    expect(isValidX25519KeyB64(value)).toBe(false);
  });
});

describe('generateWireGuardKeys', () => {
  test('returns a base64-encoded 32-byte keypair', () => {
    const { privateKey, publicKey } = generateWireGuardKeys();
    expect(b64ToU8(privateKey)).toHaveLength(32);
    expect(b64ToU8(publicKey)).toHaveLength(32);
    expect(isValidX25519KeyB64(publicKey)).toBe(true);
  });

  test('never returns the same keypair twice', () => {
    const a = generateWireGuardKeys();
    const b = generateWireGuardKeys();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('deriveSharedSecret (X25519 ECDH)', () => {
  test('both sides of a handshake derive the identical shared secret', () => {
    const client = nacl.box.keyPair();
    const server = nacl.box.keyPair();

    const clientSide = deriveSharedSecret(client.secretKey, server.publicKey);
    const serverSide = deriveSharedSecret(server.secretKey, client.publicKey);

    expect(Buffer.from(clientSide).equals(Buffer.from(serverSide))).toBe(true);
  });

  test('different peers derive different shared secrets', () => {
    const a = nacl.box.keyPair();
    const b = nacl.box.keyPair();
    const c = nacl.box.keyPair();

    const ab = deriveSharedSecret(a.secretKey, b.publicKey);
    const ac = deriveSharedSecret(a.secretKey, c.publicKey);

    expect(Buffer.from(ab).equals(Buffer.from(ac))).toBe(false);
  });
});

describe('encryptWithSharedSecret (AES-256-GCM, matches POST /api/tunnel/:id/client-config)', () => {
  function decrypt(sharedU8, { iv, tag, ciphertext }) {
    const aesKey = crypto.createHash('sha256').update(Buffer.from(sharedU8)).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  test('round-trips a real WireGuard client config end to end', () => {
    const client = nacl.box.keyPair();
    const server = nacl.box.keyPair();
    const shared = deriveSharedSecret(server.secretKey, client.publicKey);

    const plaintext = [
      '[Interface]',
      'PrivateKey = __OTNT_CLIENT_PRIVATE_KEY__',
      'Address = 10.77.0.3/32',
      '',
      '[Peer]',
      'PublicKey = someServerKey=',
      'AllowedIPs = 0.0.0.0/0',
      'Endpoint = 192.168.1.1:51820',
      'PersistentKeepalive = 25'
    ].join('\n');

    const encrypted = encryptWithSharedSecret(shared, plaintext);
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('tag');
    expect(encrypted).toHaveProperty('ciphertext');

    // Decrypt using the client's independently-derived copy of the shared secret.
    const clientShared = deriveSharedSecret(client.secretKey, server.publicKey);
    const decrypted = decrypt(clientShared, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test('produces a fresh random IV on every call, even for identical plaintext', () => {
    const shared = crypto.randomBytes(32);
    const first = encryptWithSharedSecret(shared, 'same plaintext');
    const second = encryptWithSharedSecret(shared, 'same plaintext');
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test('a tampered ciphertext fails GCM authentication instead of decrypting silently', () => {
    const shared = crypto.randomBytes(32);
    const encrypted = encryptWithSharedSecret(shared, 'sensitive config');

    const tamperedBytes = Buffer.from(encrypted.ciphertext, 'base64');
    tamperedBytes[0] ^= 0xff;
    const tampered = { ...encrypted, ciphertext: tamperedBytes.toString('base64') };

    expect(() => decrypt(shared, tampered)).toThrow();
  });

  test('the wrong shared secret cannot decrypt the config', () => {
    const shared = crypto.randomBytes(32);
    const wrongShared = crypto.randomBytes(32);
    const encrypted = encryptWithSharedSecret(shared, 'sensitive config');
    expect(() => decrypt(wrongShared, encrypted)).toThrow();
  });
});
