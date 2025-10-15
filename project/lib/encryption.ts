import 'expo-standard-web-crypto';
import * as Crypto from 'expo-crypto';
import { fromByteArray, toByteArray } from 'base64-js';

const DEFAULT_SECRET_FALLBACK = 'sihbolt-default-secret';

const secret =
  process.env.EXPO_PUBLIC_MESSAGE_SECRET ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SECRET_FALLBACK;

const subtleCrypto = globalThis?.crypto?.subtle ?? null;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let derivedKeyPromise: Promise<CryptoKey | null> | null = null;

const deriveAesKey = (): Promise<CryptoKey | null> => {
  if (!subtleCrypto) {
    console.warn(
      '[encryption] WebCrypto API is unavailable; messages will be stored in plaintext.'
    );
    return Promise.resolve(null);
  }

  if (!derivedKeyPromise) {
    derivedKeyPromise = (async () => {
      try {
        const digestBase64 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          secret,
          { encoding: Crypto.CryptoEncoding.BASE64 }
        );
        const keyBytes = toByteArray(digestBase64).slice(0, 32);
        const keyBuffer = toArrayBuffer(keyBytes);
        return await subtleCrypto.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      } catch (error) {
        console.warn('[encryption] Failed to derive AES key', error);
        return null;
      }
    })();
  }

  return derivedKeyPromise;
};

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
};

const concatBuffers = (iv: Uint8Array, payload: ArrayBuffer): Uint8Array => {
  const cipherArray = new Uint8Array(payload);
  const combined = new Uint8Array(iv.length + cipherArray.length);
  combined.set(iv, 0);
  combined.set(cipherArray, iv.length);
  return combined;
};

export const encryptMessage = async (message: string): Promise<string> => {
  if (!message) return '';

  const key = await deriveAesKey();
  if (!key || !subtleCrypto) {
    return message;
  }

  try {
    const iv = Crypto.getRandomBytes(12);
    const ivBuffer = toArrayBuffer(iv);
    const plaintext = textEncoder.encode(message);
    const plaintextBuffer = toArrayBuffer(plaintext);
    const cipherBuffer = await subtleCrypto.encrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      plaintextBuffer
    );

    const combined = concatBuffers(iv, cipherBuffer);
    return fromByteArray(combined);
  } catch (error) {
    console.warn('[encryption] Failed to encrypt message', error);
    return message;
  }
};

const splitIvAndCiphertext = (
  combined: Uint8Array
): { iv: Uint8Array; payload: Uint8Array } => {
  const iv = combined.slice(0, 12);
  const payload = combined.slice(12);
  return { iv, payload };
};

export const decryptMessage = async (ciphertext: string): Promise<string> => {
  if (!ciphertext) return '';

  const key = await deriveAesKey();
  if (!key || !subtleCrypto) {
    return ciphertext;
  }

  try {
    const rawBytes = toByteArray(ciphertext);
    if (rawBytes.length < 13) {
      return ciphertext;
    }

    const { iv, payload } = splitIvAndCiphertext(rawBytes);
    const ivBuffer = toArrayBuffer(iv);
    const payloadBuffer = toArrayBuffer(payload);
    const decryptedBuffer = await subtleCrypto.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      payloadBuffer
    );

    return textDecoder.decode(decryptedBuffer);
  } catch (error) {
    console.warn('[encryption] Failed to decrypt message', error);
    return ciphertext;
  }
};
