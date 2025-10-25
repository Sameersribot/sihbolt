import { supabase } from './supabase';
import * as SignalProtocol from './signal-protocol';
import { deviceManager } from './device-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class SessionManager {
  async getOrCreateSession(
    conversationId: string,
    recipientUserId: string
  ): Promise<{ sessionId: string; state: SignalProtocol.RatchetState }> {
    const deviceId = await deviceManager.getDeviceId();
    if (!deviceId) {
      throw new Error('Device not initialized');
    }

    const { data: recipientDevice } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', recipientUserId)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recipientDevice) {
      throw new Error('Recipient device not found');
    }

    const { data: existingSession } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('sender_device_id', deviceId)
      .eq('receiver_device_id', recipientDevice.id)
      .maybeSingle();

    if (existingSession) {
      const state = await this.loadSessionState(existingSession.id);
      return { sessionId: existingSession.id, state };
    }

    return await this.initializeNewSession(conversationId, deviceId, recipientUserId, recipientDevice.id);
  }

  private async initializeNewSession(
    conversationId: string,
    senderDeviceId: string,
    recipientUserId: string,
    recipientDeviceId: string
  ): Promise<{ sessionId: string; state: SignalProtocol.RatchetState }> {
    const identityKeyPair = await deviceManager.getIdentityKeyPair();
    const ephemeralKeyPair = SignalProtocol.generateKeyPair();

    const recipientBundle = await deviceManager.fetchRecipientPreKeyBundle(recipientUserId);

    const sharedSecret = SignalProtocol.x3dhInitiator(
      identityKeyPair,
      ephemeralKeyPair,
      recipientBundle
    );

    const initialDHKeyPair = SignalProtocol.generateKeyPair();
    const recipientSignedPreKeyPublic = SignalProtocol.deserializeKeyPair(
      recipientBundle.signedPreKey + 'AA=='
    ).publicKey;

    const initialState = SignalProtocol.initializeSession(
      sharedSecret,
      initialDHKeyPair,
      recipientSignedPreKeyPublic
    );

    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .insert({
        conversation_id: conversationId,
        sender_device_id: senderDeviceId,
        receiver_device_id: recipientDeviceId,
        root_key: SignalProtocol.serializeKeyPair({
          publicKey: initialState.rootKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        chain_key_send: SignalProtocol.serializeKeyPair({
          publicKey: initialState.chainKeySend,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        chain_key_receive: SignalProtocol.serializeKeyPair({
          publicKey: initialState.chainKeyReceive,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        send_counter: initialState.sendCounter,
        receive_counter: initialState.receiveCounter,
        previous_counter: initialState.previousCounter,
        dh_send_public: SignalProtocol.serializeKeyPair({
          publicKey: initialState.dhSend.publicKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        dh_send_private: SignalProtocol.serializeKeyPair(initialState.dhSend),
        dh_receive: SignalProtocol.serializeKeyPair({
          publicKey: initialState.dhReceive,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
      })
      .select()
      .single();

    if (error) throw error;

    await this.saveSessionState(session.id, initialState);

    return { sessionId: session.id, state: initialState };
  }

  async loadSessionState(sessionId: string): Promise<SignalProtocol.RatchetState> {
    const cachedState = await AsyncStorage.getItem(`session_${sessionId}`);
    if (cachedState) {
      return SignalProtocol.deserializeRatchetState(cachedState);
    }

    const { data: session, error } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found');
    }

    const dhSend = SignalProtocol.deserializeKeyPair(session.dh_send_private);
    const dhReceive = SignalProtocol.deserializeKeyPair(session.dh_receive + 'AA==').publicKey;

    const state: SignalProtocol.RatchetState = {
      rootKey: SignalProtocol.deserializeKeyPair(session.root_key + 'AA==').publicKey,
      chainKeySend: SignalProtocol.deserializeKeyPair(session.chain_key_send + 'AA==').publicKey,
      chainKeyReceive: SignalProtocol.deserializeKeyPair(session.chain_key_receive + 'AA==').publicKey,
      dhSend,
      dhReceive,
      sendCounter: session.send_counter,
      receiveCounter: session.receive_counter,
      previousCounter: session.previous_counter,
    };

    await this.saveSessionState(sessionId, state);

    return state;
  }

  async saveSessionState(sessionId: string, state: SignalProtocol.RatchetState): Promise<void> {
    const serialized = SignalProtocol.serializeRatchetState(state);
    await AsyncStorage.setItem(`session_${sessionId}`, serialized);

    await supabase
      .from('conversation_sessions')
      .update({
        root_key: SignalProtocol.serializeKeyPair({
          publicKey: state.rootKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        chain_key_send: SignalProtocol.serializeKeyPair({
          publicKey: state.chainKeySend,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        chain_key_receive: SignalProtocol.serializeKeyPair({
          publicKey: state.chainKeyReceive,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        send_counter: state.sendCounter,
        receive_counter: state.receiveCounter,
        previous_counter: state.previousCounter,
        dh_send_public: SignalProtocol.serializeKeyPair({
          publicKey: state.dhSend.publicKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        dh_send_private: SignalProtocol.serializeKeyPair(state.dhSend),
        dh_receive: SignalProtocol.serializeKeyPair({
          publicKey: state.dhReceive,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  async encryptMessage(
    conversationId: string,
    recipientUserId: string,
    plaintext: string
  ): Promise<SignalProtocol.EncryptedMessage> {
    const { sessionId, state } = await this.getOrCreateSession(conversationId, recipientUserId);

    const { message, newState } = SignalProtocol.ratchetEncrypt(state, plaintext);

    await this.saveSessionState(sessionId, newState);

    return message;
  }

  async decryptMessage(
    conversationId: string,
    senderUserId: string,
    encryptedMessage: SignalProtocol.EncryptedMessage
  ): Promise<string> {
    const deviceId = await deviceManager.getDeviceId();
    if (!deviceId) {
      throw new Error('Device not initialized');
    }

    const { data: senderDevice } = await supabase
      .from('user_devices')
      .select('id')
      .eq('user_id', senderUserId)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!senderDevice) {
      throw new Error('Sender device not found');
    }

    const { data: session } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('sender_device_id', senderDevice.id)
      .eq('receiver_device_id', deviceId)
      .maybeSingle();

    if (!session) {
      await this.handleFirstMessage(conversationId, senderUserId, senderDevice.id, deviceId);

      const { data: newSession } = await supabase
        .from('conversation_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('sender_device_id', senderDevice.id)
        .eq('receiver_device_id', deviceId)
        .single();

      if (!newSession) {
        throw new Error('Failed to create session');
      }
    }

    const state = await this.loadSessionState(session?.id || '');
    const { plaintext, newState } = SignalProtocol.ratchetDecrypt(state, encryptedMessage);

    await this.saveSessionState(session?.id || '', newState);

    return plaintext;
  }

  private async handleFirstMessage(
    conversationId: string,
    senderUserId: string,
    senderDeviceId: string,
    receiverDeviceId: string
  ): Promise<void> {
    throw new Error('Responder session initialization not yet implemented');
  }
}

export const sessionManager = new SessionManager();
