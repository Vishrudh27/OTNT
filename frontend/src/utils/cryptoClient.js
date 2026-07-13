// frontend/src/utils/cryptoClient.js
import nacl from 'tweetnacl';

/* ================================
   Base64 <-> Uint8Array Helpers
================================= */
export function b64ToU8(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export function u8ToB64(u8) {
  return btoa(String.fromCharCode(...u8));
}

export function bufToText(buf) {
  return new TextDecoder().decode(buf);
}

/* ================================
   ECDH (X25519) using TweetNaCl
================================= */
export function generateECDHKeys() {
  const kp = nacl.box.keyPair(); // X25519 (Curve25519)
  return {
    privateKey: u8ToB64(kp.secretKey), // base64 encoded
    publicKey: u8ToB64(kp.publicKey)   // base64 encoded
  };
}

export function deriveSharedSecret(clientPrivB64, serverPubB64) {
  const clientPriv = b64ToU8(clientPrivB64);
  const serverPub = b64ToU8(serverPubB64);
  const shared = nacl.scalarMult(clientPriv, serverPub); // Uint8Array (32 bytes)
  return shared;
}

/* ================================
   AES-GCM Key Derivation (SHA-256)
================================= */
export async function deriveAESKeyFromShared(sharedU8) {
  const hash = await crypto.subtle.digest('SHA-256', sharedU8); // 32-byte key
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

/* ================================
   AES-GCM Decryption
================================= */
export async function decryptAESGCM({ ivB64, tagB64, ciphertextB64, aesCryptoKey }) {
  const iv = b64ToU8(ivB64);
  const tag = b64ToU8(tagB64);
  const cipher = b64ToU8(ciphertextB64);

  // WebCrypto requires ciphertext + tag concatenated
  const cipherWithTag = new Uint8Array(cipher.length + tag.length);
  cipherWithTag.set(cipher, 0);
  cipherWithTag.set(tag, cipher.length);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesCryptoKey,
    cipherWithTag
  );

  return bufToText(new Uint8Array(plainBuf));
}

/* ================================
   File Download Helper
================================= */
export function downloadAsFile(text, filename = 'wg-client.conf') {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
