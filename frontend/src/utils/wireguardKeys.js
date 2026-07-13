import nacl from 'tweetnacl';

// helpers to convert Uint8Array <-> base64 in browser (no Buffer)
export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa expects binary string
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Client WireGuard keypair (X25519)
export function generateWireGuardKeys() {
  const keyPair = nacl.box.keyPair();
  return {
    privateKey: bytesToBase64(keyPair.secretKey),
    publicKey: bytesToBase64(keyPair.publicKey)
  };
}

// Client ECDH keypair for handshake (also X25519)
export function generateECDHKeys() {
  const keyPair = nacl.box.keyPair(); // same curve
  return {
    privateKey: keyPair.secretKey,
    publicKeyB64: bytesToBase64(keyPair.publicKey)
  };
}

// Compute shared secret on client if needed
export function computeSharedSecret(clientSecretKey, serverPubB64) {
  const serverPub = base64ToBytes(serverPubB64);
  // nacl.scalarMult returns 32-byte shared key
  const shared = nacl.scalarMult(clientSecretKey, serverPub);
  return bytesToBase64(shared);
}
