import { sessionManager } from './session-manager';
import { deviceManager } from './device-manager';
import { encryptMessage as fallbackEncrypt, decryptMessage as fallbackDecrypt } from './encryption';

export interface SecureMessage {
  ciphertext: string;
  ratchetKey?: string;
  messageNumber?: number;
  previousCounter?: number;
  deviceId?: string;
}

let isSignalReady = false;

export async function initializeSecureMessaging(userId: string): Promise<void> {
  try {
    await deviceManager.initialize(userId);
    isSignalReady = true;
    console.log('[SecureMessaging] Signal protocol initialized');
  } catch (error) {
    console.error('[SecureMessaging] Failed to initialize Signal protocol:', error);
    isSignalReady = false;
  }
}

export async function encryptSecureMessage(
  conversationId: string,
  recipientUserId: string,
  plaintext: string
): Promise<SecureMessage> {
  if (!isSignalReady) {
    console.warn('[SecureMessaging] Signal protocol not ready, using fallback encryption');
    const ciphertext = await fallbackEncrypt(plaintext);
    return { ciphertext };
  }

  try {
    const encryptedMessage = await sessionManager.encryptMessage(
      conversationId,
      recipientUserId,
      plaintext
    );

    const deviceId = await deviceManager.getDeviceId();

    return {
      ciphertext: encryptedMessage.ciphertext,
      ratchetKey: encryptedMessage.ratchetKey,
      messageNumber: encryptedMessage.messageNumber,
      previousCounter: encryptedMessage.previousCounter,
      deviceId: deviceId || undefined,
    };
  } catch (error) {
    console.error('[SecureMessaging] Signal encryption failed, using fallback:', error);
    const ciphertext = await fallbackEncrypt(plaintext);
    return { ciphertext };
  }
}

export async function decryptSecureMessage(
  conversationId: string,
  senderUserId: string,
  secureMessage: SecureMessage
): Promise<string> {
  if (!secureMessage.ratchetKey || !secureMessage.messageNumber === undefined) {
    console.log('[SecureMessaging] No Signal metadata, using fallback decryption');
    return await fallbackDecrypt(secureMessage.ciphertext);
  }

  if (!isSignalReady) {
    console.warn('[SecureMessaging] Signal protocol not ready, using fallback decryption');
    return await fallbackDecrypt(secureMessage.ciphertext);
  }

  try {
    const plaintext = await sessionManager.decryptMessage(
      conversationId,
      senderUserId,
      {
        ciphertext: secureMessage.ciphertext,
        ratchetKey: secureMessage.ratchetKey,
        messageNumber: secureMessage.messageNumber!,
        previousCounter: secureMessage.previousCounter || 0,
      }
    );

    return plaintext;
  } catch (error) {
    console.error('[SecureMessaging] Signal decryption failed, trying fallback:', error);
    return await fallbackDecrypt(secureMessage.ciphertext);
  }
}

export function isSignalProtocolReady(): boolean {
  return isSignalReady;
}
