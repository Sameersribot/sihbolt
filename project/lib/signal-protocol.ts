import sodium from 'libsodium-wrappers';

await sodium.ready;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface PreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
  oneTimePreKey?: string;
}

export interface RatchetState {
  rootKey: Uint8Array;
  chainKeySend: Uint8Array;
  chainKeyReceive: Uint8Array;
  dhSend: KeyPair;
  dhReceive: Uint8Array;
  sendCounter: number;
  receiveCounter: number;
  previousCounter: number;
}

export interface EncryptedMessage {
  ciphertext: string;
  ratchetKey: string;
  messageNumber: number;
  previousCounter: number;
}

const INFO_TEXT = 'DEFCOM-E2EE-V1';
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x01]);
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02]);

function bytesToBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function base64ToBytes(base64: string): Uint8Array {
  return sodium.from_base64(base64, sodium.base64_variants.ORIGINAL);
}

export function generateKeyPair(): KeyPair {
  const keyPair = sodium.crypto_kx_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

export function generateSignedPreKey(identityKeyPair: KeyPair): {
  preKey: KeyPair;
  signature: Uint8Array;
} {
  const preKey = generateKeyPair();
  const signature = sodium.crypto_sign_detached(preKey.publicKey, identityKeyPair.privateKey);

  return { preKey, signature };
}

export function verifyPreKeySignature(
  preKeyPublic: Uint8Array,
  signature: Uint8Array,
  identityKeyPublic: Uint8Array
): boolean {
  try {
    return sodium.crypto_sign_verify_detached(signature, preKeyPublic, identityKeyPublic);
  } catch {
    return false;
  }
}

export function generateOneTimePreKeys(count: number): KeyPair[] {
  const keys: KeyPair[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(generateKeyPair());
  }
  return keys;
}

function hkdf(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array,
  length: number
): Uint8Array {
  const actualSalt = salt || new Uint8Array(sodium.crypto_generichash_BYTES);
  const prk = sodium.crypto_generichash(sodium.crypto_generichash_BYTES, inputKeyMaterial, actualSalt);

  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;

  const okm = sodium.crypto_generichash(length, infoWithCounter, prk);
  return okm;
}

function dhExchange(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return sodium.crypto_scalarmult(privateKey, publicKey);
}

function kdfRootKey(rootKey: Uint8Array, dhOutput: Uint8Array): {
  newRootKey: Uint8Array;
  chainKey: Uint8Array;
} {
  const salt = rootKey;
  const ikm = dhOutput;
  const info = new TextEncoder().encode('DEFCOM-ROOT');

  const output = hkdf(ikm, salt, info, 64);

  return {
    newRootKey: output.slice(0, 32),
    chainKey: output.slice(32, 64),
  };
}

function kdfChainKey(chainKey: Uint8Array): {
  newChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const messageKey = sodium.crypto_generichash(32, MESSAGE_KEY_CONSTANT, chainKey);
  const newChainKey = sodium.crypto_generichash(32, CHAIN_KEY_CONSTANT, chainKey);

  return { newChainKey, messageKey };
}

export function x3dhInitiator(
  identityKeyPair: KeyPair,
  ephemeralKeyPair: KeyPair,
  recipientBundle: PreKeyBundle
): Uint8Array {
  const recipientIdentityKey = base64ToBytes(recipientBundle.identityKey);
  const recipientSignedPreKey = base64ToBytes(recipientBundle.signedPreKey);
  const recipientPreKeySignature = base64ToBytes(recipientBundle.preKeySignature);

  if (!verifyPreKeySignature(recipientSignedPreKey, recipientPreKeySignature, recipientIdentityKey)) {
    throw new Error('Invalid prekey signature');
  }

  const dh1 = dhExchange(identityKeyPair.privateKey, recipientSignedPreKey);
  const dh2 = dhExchange(ephemeralKeyPair.privateKey, recipientIdentityKey);
  const dh3 = dhExchange(ephemeralKeyPair.privateKey, recipientSignedPreKey);

  let dh4: Uint8Array | null = null;
  if (recipientBundle.oneTimePreKey) {
    const recipientOneTimePreKey = base64ToBytes(recipientBundle.oneTimePreKey);
    dh4 = dhExchange(ephemeralKeyPair.privateKey, recipientOneTimePreKey);
  }

  const dhCombined = new Uint8Array(
    dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0)
  );

  let offset = 0;
  dhCombined.set(dh1, offset);
  offset += dh1.length;
  dhCombined.set(dh2, offset);
  offset += dh2.length;
  dhCombined.set(dh3, offset);
  offset += dh3.length;

  if (dh4) {
    dhCombined.set(dh4, offset);
  }

  const info = new TextEncoder().encode(INFO_TEXT);
  const sharedSecret = hkdf(dhCombined, null, info, 32);

  return sharedSecret;
}

export function x3dhResponder(
  identityKeyPair: KeyPair,
  signedPreKeyPair: KeyPair,
  oneTimePreKeyPair: KeyPair | null,
  initiatorIdentityKey: Uint8Array,
  initiatorEphemeralKey: Uint8Array
): Uint8Array {
  const dh1 = dhExchange(signedPreKeyPair.privateKey, initiatorIdentityKey);
  const dh2 = dhExchange(identityKeyPair.privateKey, initiatorEphemeralKey);
  const dh3 = dhExchange(signedPreKeyPair.privateKey, initiatorEphemeralKey);

  let dh4: Uint8Array | null = null;
  if (oneTimePreKeyPair) {
    dh4 = dhExchange(oneTimePreKeyPair.privateKey, initiatorEphemeralKey);
  }

  const dhCombined = new Uint8Array(
    dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0)
  );

  let offset = 0;
  dhCombined.set(dh1, offset);
  offset += dh1.length;
  dhCombined.set(dh2, offset);
  offset += dh2.length;
  dhCombined.set(dh3, offset);
  offset += dh3.length;

  if (dh4) {
    dhCombined.set(dh4, offset);
  }

  const info = new TextEncoder().encode(INFO_TEXT);
  const sharedSecret = hkdf(dhCombined, null, info, 32);

  return sharedSecret;
}

export function initializeSession(sharedSecret: Uint8Array, initiatorDHKeyPair: KeyPair, responderDHPublicKey: Uint8Array): RatchetState {
  const info = new TextEncoder().encode('DEFCOM-INIT');
  const rootKey = hkdf(sharedSecret, null, info, 32);

  const dhOutput = dhExchange(initiatorDHKeyPair.privateKey, responderDHPublicKey);
  const { newRootKey, chainKey } = kdfRootKey(rootKey, dhOutput);

  return {
    rootKey: newRootKey,
    chainKeySend: chainKey,
    chainKeyReceive: new Uint8Array(32),
    dhSend: initiatorDHKeyPair,
    dhReceive: responderDHPublicKey,
    sendCounter: 0,
    receiveCounter: 0,
    previousCounter: 0,
  };
}

export function ratchetEncrypt(state: RatchetState, plaintext: string): {
  message: EncryptedMessage;
  newState: RatchetState;
} {
  const { newChainKey, messageKey } = kdfChainKey(state.chainKeySend);

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    null,
    null,
    nonce,
    messageKey
  );

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  const message: EncryptedMessage = {
    ciphertext: bytesToBase64(combined),
    ratchetKey: bytesToBase64(state.dhSend.publicKey),
    messageNumber: state.sendCounter,
    previousCounter: state.previousCounter,
  };

  const newState: RatchetState = {
    ...state,
    chainKeySend: newChainKey,
    sendCounter: state.sendCounter + 1,
  };

  return { message, newState };
}

export function ratchetDecrypt(state: RatchetState, message: EncryptedMessage): {
  plaintext: string;
  newState: RatchetState;
} {
  const ratchetKey = base64ToBytes(message.ratchetKey);

  let newState = { ...state };

  if (!sodium.memcmp(ratchetKey, state.dhReceive)) {
    const dhOutput = dhExchange(state.dhSend.privateKey, ratchetKey);
    const { newRootKey, chainKey: newChainKeyReceive } = kdfRootKey(state.rootKey, dhOutput);

    const newDHSend = generateKeyPair();
    const dhOutput2 = dhExchange(newDHSend.privateKey, ratchetKey);
    const { newRootKey: finalRootKey, chainKey: newChainKeySend } = kdfRootKey(newRootKey, dhOutput2);

    newState = {
      rootKey: finalRootKey,
      chainKeySend: newChainKeySend,
      chainKeyReceive: newChainKeyReceive,
      dhSend: newDHSend,
      dhReceive: ratchetKey,
      sendCounter: 0,
      receiveCounter: 0,
      previousCounter: state.sendCounter,
    };
  }

  let chainKey = newState.chainKeyReceive;
  for (let i = newState.receiveCounter; i < message.messageNumber; i++) {
    const { newChainKey } = kdfChainKey(chainKey);
    chainKey = newChainKey;
  }

  const { newChainKey, messageKey } = kdfChainKey(chainKey);

  const combined = base64ToBytes(message.ciphertext);
  const nonce = combined.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = combined.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    messageKey
  );

  const plaintext = new TextDecoder().decode(decrypted);

  newState.chainKeyReceive = newChainKey;
  newState.receiveCounter = message.messageNumber + 1;

  return { plaintext, newState };
}

export function serializeKeyPair(keyPair: KeyPair): string {
  const combined = new Uint8Array(keyPair.publicKey.length + keyPair.privateKey.length);
  combined.set(keyPair.publicKey);
  combined.set(keyPair.privateKey, keyPair.publicKey.length);
  return bytesToBase64(combined);
}

export function deserializeKeyPair(serialized: string): KeyPair {
  const combined = base64ToBytes(serialized);
  const publicKey = combined.slice(0, 32);
  const privateKey = combined.slice(32, 64);
  return { publicKey, privateKey };
}

export function serializeRatchetState(state: RatchetState): string {
  return JSON.stringify({
    rootKey: bytesToBase64(state.rootKey),
    chainKeySend: bytesToBase64(state.chainKeySend),
    chainKeyReceive: bytesToBase64(state.chainKeyReceive),
    dhSend: serializeKeyPair(state.dhSend),
    dhReceive: bytesToBase64(state.dhReceive),
    sendCounter: state.sendCounter,
    receiveCounter: state.receiveCounter,
    previousCounter: state.previousCounter,
  });
}

export function deserializeRatchetState(serialized: string): RatchetState {
  const parsed = JSON.parse(serialized);
  return {
    rootKey: base64ToBytes(parsed.rootKey),
    chainKeySend: base64ToBytes(parsed.chainKeySend),
    chainKeyReceive: base64ToBytes(parsed.chainKeyReceive),
    dhSend: deserializeKeyPair(parsed.dhSend),
    dhReceive: base64ToBytes(parsed.dhReceive),
    sendCounter: parsed.sendCounter,
    receiveCounter: parsed.receiveCounter,
    previousCounter: parsed.previousCounter,
  };
}
