import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import type { KeyboardEventName, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { encryptMessage, decryptMessage } from '@/lib/encryption';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  id: string;
  content: string;
  ciphertext?: string | null;
  sender_id: string;
  created_at: string;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const { session } = useAuth();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const keyboardShowEvent: KeyboardEventName =
    Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const keyboardHideEvent: KeyboardEventName =
    Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  const safeAreaBottom = insets.bottom;
  const inputPaddingBottom =
    keyboardVisible
      ? 12
      : safeAreaBottom > 0
        ? safeAreaBottom
        : 0;
  const listBottomPadding = 16 + (!keyboardVisible ? safeAreaBottom : 0);
  const keyboardVerticalOffset =
    Platform.OS === 'ios' ? headerHeight : 0;
  const handleHeaderLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { height } = nativeEvent.layout;
      setHeaderHeight((current) =>
        Math.abs(current - height) < 1 ? height : height
      );
    },
    []
  );

  useEffect(() => {
    const showSub = Keyboard.addListener(keyboardShowEvent, () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() =>
        flatListRef.current?.scrollToEnd({ animated: true })
      );
    });
    const hideSub = Keyboard.addListener(keyboardHideEvent, () => {
      setKeyboardVisible(false);
      requestAnimationFrame(() =>
        flatListRef.current?.scrollToEnd({ animated: true })
      );
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardShowEvent, keyboardHideEvent]);

  useEffect(() => {
    if (session?.user && id) {
      loadChatData();

      const channel = supabase
        .channel(`messages:${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${id}`,
          },
          async (payload) => {
            const incoming = payload.new as Message;
            const decryptedContent = await decryptMessage(
              incoming.ciphertext || incoming.content
            );

            setMessages((prev) => [
              ...prev,
              {
                ...incoming,
                content: decryptedContent,
              },
            ]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session, id]);

  const loadChatData = async () => {
    if (!session?.user || !id) return;

    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', id)
      .neq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    if (participants) {
      const { data: user } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', participants.user_id)
        .single();

      setOtherUser(user);
    }

    const { data: messagesData } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (messagesData) {
      const decrypted = await Promise.all(
        (messagesData as any[]).map(async (raw) => {
          const ciphertext =
            typeof raw?.ciphertext === 'string' && raw.ciphertext.length > 0
              ? raw.ciphertext
              : raw?.content ?? '';
          return {
            ...(raw as Message),
            content: await decryptMessage(ciphertext),
          } as Message;
        })
      );
      setMessages(decrypted);
    }

    setLoading(false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !session?.user || !id) return;

    if (!otherUser?.id) {
      await loadChatData();
    }

    if (!otherUser?.id) {
      Alert.alert('Error', 'Unable to determine the recipient for this chat.');
      return;
    }

    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage('');
    const encryptedContent = await encryptMessage(messageContent);

    const baseMessagePayload: Record<string, any> = {
      conversation_id: id,
      sender_id: session.user.id,
      content: '[encrypted]',
      ciphertext: encryptedContent,
      read: false,
    };

    try {
      const attemptInsert = async (payload: Record<string, any>) => {
        const { error } = await supabase.from('messages').insert(payload);
        if (error) {
          throw error;
        }
      };

      const payloadAttempts: Record<string, any>[] = [
        {
          ...baseMessagePayload,
          sender: session.user.id,
          recipient: otherUser.id,
        },
        { ...baseMessagePayload },
        (() => {
          const fallbackPayload: Record<string, any> = {
            ...baseMessagePayload,
            content: encryptedContent,
          };
          delete fallbackPayload.ciphertext;
          return fallbackPayload;
        })(),
      ];

      let lastError: any = null;
      let sent = false;

      for (const payload of payloadAttempts) {
        try {
          await attemptInsert(payload);
          sent = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!sent && lastError) {
        throw lastError;
      }

      const { error: updateError } = await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }
    } catch (error: any) {
      setNewMessage(messageContent);
      Alert.alert(
        'Error',
        error?.message || 'Failed to send message. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.sender_id === session?.user.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownBubble : styles.otherBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isOwnMessage ? styles.ownText : styles.otherText,
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isOwnMessage ? styles.ownTime : styles.otherTime,
            ]}
          >
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <View style={styles.header} onLayout={handleHeaderLayout}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {otherUser?.display_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.headerTitle}>
            {otherUser?.display_name || 'Chat'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
            <Phone size={22} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesWrapper}
        contentContainerStyle={[
          styles.messagesList,
          { paddingBottom: listBottomPadding },
        ]}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation!</Text>
          </View>
        }
      />

      <View
        style={[
          styles.inputContainer,
          { paddingBottom: inputPaddingBottom },
        ]}
      >
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          multiline
          maxLength={1000}
          onFocus={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Send size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  headerActions: {
    width: 40,
    alignItems: 'flex-end',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4ff',
  },
  messagesList: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  messagesWrapper: {
    flex: 1,
  },
  messageContainer: {
    marginBottom: 12,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#e9e9eb',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  ownText: {
    color: '#fff',
  },
  otherText: {
    color: '#1a1a1a',
  },
  messageTime: {
    fontSize: 11,
  },
  ownTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherTime: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
});
