import CryptoJS from 'crypto-js';

const DEFAULT_SECRET_FALLBACK = 'sihbolt-default-secret';

const secret =
  process.env.EXPO_PUBLIC_MESSAGE_SECRET ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SECRET_FALLBACK;

export const encryptMessage = (message: string): string => {
  if (!message) return '';

  try {
    return CryptoJS.AES.encrypt(message, secret).toString();
  } catch (error) {
    console.warn('[encryption] Failed to encrypt message', error);
    return message;
  }
};

export const decryptMessage = (ciphertext: string): string => {
  if (!ciphertext) return '';

  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || ciphertext;
  } catch (error) {
    console.warn('[encryption] Failed to decrypt message', error);
    return ciphertext;
  }
};
