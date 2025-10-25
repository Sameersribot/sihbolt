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
import { ArrowLeft, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { encryptMessage, decryptMessage } from '@/lib/encryption';
import { useAuth } from '@/contexts/AuthContext';
import { theme } from '@/constants/theme';

interface Message {
  id: string;
  content: string;
  ciphertext?: string | null;
  sender_id: string;
  created_at: string;
  read: boolean;
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
    keyboardVisible ? 12 : safeAreaBottom > 0 ? safeAreaBottom : 12;
  const listBottomPadding = 16 + (!keyboardVisible ? safeAreaBottom : 0);
  const keyboardVerticalOffset = Platform.OS === 'ios' ? headerHeight : 0;

  const handleHeaderLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { height } = nativeEvent.layout;
      setHeaderHeight(height);
    },
    []
  );

  useEffect(() => {
    const showSub = Keyboard.addListener(keyboardShowEvent, () => {
      setKeyboardVisible(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(keyboardHideEvent, () => {
      setKeyboardVisible(false);
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

            const newMsg = {
              ...incoming,
              content: decryptedContent,
            };

            setMessages((prev) => [...prev, newMsg]);

            if (incoming.sender_id !== session.user.id && !incoming.read) {
              await supabase
                .from('messages')
                .update({ read: true })
                .eq('id', incoming.id);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${id}`,
          },
          (payload) => {
            const updated = payload.new as Message;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === updated.id ? { ...msg, read: updated.read } : msg
              )
            );
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

      const unreadMessages = decrypted.filter(
        (msg) => msg.sender_id !== session.user.id && !msg.read
      );

      if (unreadMessages.length > 0) {
        await supabase
          .from('messages')
          .update({ read: true })
          .in(
            'id',
            unreadMessages.map((m) => m.id)
          );
      }
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

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id);
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
          <View style={styles.messageFooter}>
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
            {isOwnMessage && (
              <Text style={styles.readIndicator}>{item.read ? '✓✓' : '✓'}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
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
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={theme.colors.text} />
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
        <View style={styles.headerSpacer} />
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
            <Text style={styles.emptySubtext}>Start the conversation</Text>
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
          placeholderTextColor={theme.colors.textDisabled}
          multiline
          maxLength={1000}
          onFocus={() =>
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
          }
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.colors.surface} />
          ) : (
            <Send size={20} color={theme.colors.surface} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 60,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    ...theme.shadows.sm,
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
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  headerAvatarText: {
    ...theme.typography.body,
    color: theme.colors.surface,
    fontWeight: '600',
  },
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  messagesList: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  messagesWrapper: {
    flex: 1,
  },
  messageContainer: {
    marginBottom: theme.spacing.md,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  ownBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  otherBubble: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.sm,
  },
  messageText: {
    ...theme.typography.body,
    marginBottom: theme.spacing.xs,
  },
  ownText: {
    color: theme.colors.surface,
  },
  otherText: {
    color: theme.colors.text,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  messageTime: {
    ...theme.typography.caption,
  },
  ownTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  otherTime: {
    color: theme.colors.textSecondary,
  },
  readIndicator: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing.sm,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
    marginBottom: 1,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...theme.typography.h3,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
});
