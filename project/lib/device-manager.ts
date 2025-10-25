import { supabase } from './supabase';
import * as SignalProtocol from './signal-protocol';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'device_id';
const IDENTITY_KEYPAIR_KEY = 'identity_keypair';

interface Device {
  id: string;
  userId: string;
  deviceName: string;
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
  oneTimePreKeys: string[];
}

export class DeviceManager {
  private deviceId: string | null = null;
  private identityKeyPair: SignalProtocol.KeyPair | null = null;

  async initialize(userId: string): Promise<void> {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    let identityKeyPairStr = await AsyncStorage.getItem(IDENTITY_KEYPAIR_KEY);

    if (!identityKeyPairStr) {
      this.identityKeyPair = SignalProtocol.generateKeyPair();
      identityKeyPairStr = SignalProtocol.serializeKeyPair(this.identityKeyPair);
      await AsyncStorage.setItem(IDENTITY_KEYPAIR_KEY, identityKeyPairStr);
    } else {
      this.identityKeyPair = SignalProtocol.deserializeKeyPair(identityKeyPairStr);
    }

    if (!deviceId) {
      const device = await this.registerDevice(userId);
      deviceId = device.id;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    this.deviceId = deviceId;

    await this.updateLastActive();
  }

  private async registerDevice(userId: string): Promise<Device> {
    if (!this.identityKeyPair) {
      throw new Error('Identity key pair not initialized');
    }

    const { preKey: signedPreKey, signature } = SignalProtocol.generateSignedPreKey(
      this.identityKeyPair
    );

    const oneTimePreKeys = SignalProtocol.generateOneTimePreKeys(100);

    const deviceName = 'Mobile Device';

    const { data, error } = await supabase
      .from('user_devices')
      .insert({
        user_id: userId,
        device_name: deviceName,
        identity_key: SignalProtocol.serializeKeyPair({
          publicKey: this.identityKeyPair.publicKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        signed_prekey: SignalProtocol.serializeKeyPair({
          publicKey: signedPreKey.publicKey,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        prekey_signature: SignalProtocol.serializeKeyPair({
          publicKey: signature,
          privateKey: new Uint8Array(0),
        }).split('=')[0] + '==',
        one_time_prekeys: oneTimePreKeys.map((key) =>
          SignalProtocol.serializeKeyPair({
            publicKey: key.publicKey,
            privateKey: new Uint8Array(0),
          }).split('=')[0] + '=='
        ),
      })
      .select()
      .single();

    if (error) throw error;

    const signedPreKeyStr = SignalProtocol.serializeKeyPair(signedPreKey);
    await AsyncStorage.setItem(`signed_prekey_${data.id}`, signedPreKeyStr);

    for (let i = 0; i < oneTimePreKeys.length; i++) {
      const keyStr = SignalProtocol.serializeKeyPair(oneTimePreKeys[i]);
      await AsyncStorage.setItem(`one_time_prekey_${data.id}_${i}`, keyStr);
    }

    return data;
  }

  async getDeviceId(): Promise<string | null> {
    if (!this.deviceId) {
      this.deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    }
    return this.deviceId;
  }

  async getIdentityKeyPair(): Promise<SignalProtocol.KeyPair> {
    if (!this.identityKeyPair) {
      const identityKeyPairStr = await AsyncStorage.getItem(IDENTITY_KEYPAIR_KEY);
      if (!identityKeyPairStr) {
        throw new Error('Identity key pair not found');
      }
      this.identityKeyPair = SignalProtocol.deserializeKeyPair(identityKeyPairStr);
    }
    return this.identityKeyPair;
  }

  async getSignedPreKey(deviceId: string): Promise<SignalProtocol.KeyPair> {
    const keyStr = await AsyncStorage.getItem(`signed_prekey_${deviceId}`);
    if (!keyStr) {
      throw new Error('Signed prekey not found');
    }
    return SignalProtocol.deserializeKeyPair(keyStr);
  }

  async consumeOneTimePreKey(deviceId: string, index: number): Promise<SignalProtocol.KeyPair | null> {
    const keyStr = await AsyncStorage.getItem(`one_time_prekey_${deviceId}_${index}`);
    if (!keyStr) {
      return null;
    }

    await AsyncStorage.removeItem(`one_time_prekey_${deviceId}_${index}`);

    const { error } = await supabase
      .from('user_devices')
      .update({
        one_time_prekeys: supabase.rpc('array_remove_element', {
          arr: [],
          elem: index,
        }),
      })
      .eq('id', deviceId);

    if (error) {
      console.error('Failed to remove one-time prekey from database:', error);
    }

    return SignalProtocol.deserializeKeyPair(keyStr);
  }

  async fetchRecipientPreKeyBundle(recipientUserId: string): Promise<SignalProtocol.PreKeyBundle> {
    const { data: devices, error: devicesError } = await supabase
      .from('user_devices')
      .select('*')
      .eq('user_id', recipientUserId)
      .order('last_active', { ascending: false })
      .limit(1);

    if (devicesError || !devices || devices.length === 0) {
      throw new Error('Recipient device not found');
    }

    const device = devices[0];

    const oneTimePreKeys = device.one_time_prekeys as string[];
    let oneTimePreKey: string | undefined = undefined;

    if (oneTimePreKeys && oneTimePreKeys.length > 0) {
      oneTimePreKey = oneTimePreKeys[0];

      const updatedKeys = oneTimePreKeys.slice(1);
      await supabase
        .from('user_devices')
        .update({ one_time_prekeys: updatedKeys })
        .eq('id', device.id);
    }

    return {
      identityKey: device.identity_key,
      signedPreKey: device.signed_prekey,
      preKeySignature: device.prekey_signature,
      oneTimePreKey,
    };
  }

  async updateLastActive(): Promise<void> {
    if (!this.deviceId) return;

    await supabase
      .from('user_devices')
      .update({ last_active: new Date().toISOString() })
      .eq('id', this.deviceId);
  }
}

export const deviceManager = new DeviceManager();
