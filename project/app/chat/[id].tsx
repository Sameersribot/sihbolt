// import React, { useEffect, useState, useRef, useCallback } from 'react';
// import {
//   View,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   FlatList,
//   StyleSheet,
//   KeyboardAvoidingView,
//   Platform,
//   ActivityIndicator,
//   Alert,
//   Keyboard,
// } from 'react-native';
// import type { KeyboardEventName, LayoutChangeEvent } from 'react-native';
// import { useLocalSearchParams, useRouter } from 'expo-router';
// import { ArrowLeft, Phone, Video, Send, Check } from 'lucide-react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import { supabase } from '@/lib/supabase';
// import { encryptMessage, decryptMessage } from '@/lib/encryption';
// import { useAuth } from '@/contexts/AuthContext';

// interface Message {
//   id: string;
//   content: string;
//   ciphertext?: string | null;
//   sender_id: string;
//   created_at: string;
//   read: boolean;
// }

// export default function ChatScreen() {
//   const { id } = useLocalSearchParams<{ id: string }>();
//   const [messages, setMessages] = useState<Message[]>([]);
//   const [newMessage, setNewMessage] = useState('');
//   const [otherUser, setOtherUser] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [sending, setSending] = useState(false);
//   const [keyboardVisible, setKeyboardVisible] = useState(false);
//   const [headerHeight, setHeaderHeight] = useState(0);
//   const { session } = useAuth();
//   const router = useRouter();
//   const flatListRef = useRef<FlatList>(null);
//   const insets = useSafeAreaInsets();
//   const keyboardShowEvent: KeyboardEventName =
//     Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
//   const keyboardHideEvent: KeyboardEventName =
//     Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
//   const safeAreaBottom = insets.bottom;
//   const inputPaddingBottom =
//     keyboardVisible
//       ? 12
//       : safeAreaBottom > 0
//         ? safeAreaBottom
//         : 0;
//   const listBottomPadding = 16 + (!keyboardVisible ? safeAreaBottom : 0);
//   const keyboardVerticalOffset =
//     Platform.OS === 'ios' ? headerHeight : 0;
//   const markMessagesAsRead = useCallback(async (messageIds: string[]) => {
//     const uniqueUnreadIds = Array.from(new Set(messageIds)).filter(Boolean);

//     if (!uniqueUnreadIds.length) {
//       return;
//     }

//     let stateChanged = false;

//     setMessages((prev) =>
//       prev.map((message) => {
//         if (uniqueUnreadIds.includes(message.id) && !message.read) {
//           stateChanged = true;
//           return { ...message, read: true };
//         }

//         return message;
//       })
//     );

//     if (!stateChanged) {
//       return;
//     }

//     try {
//       await supabase
//         .from('messages')
//         .update({ read: true })
//         .in('id', uniqueUnreadIds);
//     } catch (error) {
//       console.error('Failed to mark messages as read', error);
//     }
//   }, []);
//   const handleHeaderLayout = useCallback(
//     ({ nativeEvent }: LayoutChangeEvent) => {
//       const { height } = nativeEvent.layout;
//       setHeaderHeight((current) =>
//         Math.abs(current - height) < 1 ? height : height
//       );
//     },
//     []
//   );

//   useEffect(() => {
//     const showSub = Keyboard.addListener(keyboardShowEvent, () => {
//       setKeyboardVisible(true);
//       requestAnimationFrame(() =>
//         flatListRef.current?.scrollToEnd({ animated: true })
//       );
//     });
//     const hideSub = Keyboard.addListener(keyboardHideEvent, () => {
//       setKeyboardVisible(false);
//       requestAnimationFrame(() =>
//         flatListRef.current?.scrollToEnd({ animated: true })
//       );
//     });

//     return () => {
//       showSub.remove();
//       hideSub.remove();
//     };
//   }, [keyboardShowEvent, keyboardHideEvent]);

//   useEffect(() => {
//     if (session?.user && id) {
//       loadChatData();

//       const channel = supabase
//         .channel(`messages:${id}`)
//         .on(
//           'postgres_changes',
//           {
//             event: 'INSERT',
//             schema: 'public',
//             table: 'messages',
//             filter: `conversation_id=eq.${id}`,
//           },
//           async (payload) => {
//             const incoming = payload.new as Message;
//             const decryptedContent = await decryptMessage(
//               incoming.ciphertext || incoming.content
//             );

//             setMessages((prev) => [
//               ...prev,
//               {
//                 ...incoming,
//                 read: !!incoming.read,
//                 content: decryptedContent,
//               },
//             ]);
//           }
//         )
//         .on(
//           'postgres_changes',
//           {
//             event: 'UPDATE',
//             schema: 'public',
//             table: 'messages',
//             filter: `conversation_id=eq.${id}`,
//           },
//           (payload) => {
//             const updated = payload.new as Message;
//             setMessages((prev) =>
//               prev.map((message) =>
//                 message.id === updated.id
//                   ? { ...message, read: updated.read }
//                   : message
//               )
//             );
//           }
//         )
//         .subscribe();

//       return () => {
//         supabase.removeChannel(channel);
//       };
//     }
//   }, [session, id]);

//   useEffect(() => {
//     if (!session?.user?.id) {
//       return;
//     }

//     const unreadIds = messages
//       .filter(
//         (message) =>
//           message.sender_id !== session.user.id && !message.read
//       )
//       .map((message) => message.id);

//     if (unreadIds.length) {
//       markMessagesAsRead(unreadIds);
//     }
//   }, [messages, session?.user?.id, markMessagesAsRead]);

//   const loadChatData = async () => {
//     if (!session?.user || !id) return;

//     const { data: participants } = await supabase
//       .from('conversation_participants')
//       .select('user_id')
//       .eq('conversation_id', id)
//       .neq('user_id', session.user.id)
//       .limit(1)
//       .maybeSingle();

//     if (participants) {
//       const { data: user } = await supabase
//         .from('profiles')
//         .select('*')
//         .eq('id', participants.user_id)
//         .single();

//       setOtherUser(user);
//     }

//     const { data: messagesData } = await supabase
//       .from('messages')
//       .select('*')
//       .eq('conversation_id', id)
//       .order('created_at', { ascending: true });

//     if (messagesData) {
//       const decrypted = await Promise.all(
//         (messagesData as any[]).map(async (raw) => {
//           const ciphertext =
//             typeof raw?.ciphertext === 'string' && raw.ciphertext.length > 0
//               ? raw.ciphertext
//               : raw?.content ?? '';
//           return {
//             ...(raw as Message),
//             read: !!raw.read,
//             content: await decryptMessage(ciphertext),
//           } as Message;
//         })
//       );
//       setMessages(decrypted);
//     }

//     setLoading(false);
//   };

//   const sendMessage = async () => {
//     if (!newMessage.trim() || !session?.user || !id) return;

//     if (!otherUser?.id) {
//       await loadChatData();
//     }

//     if (!otherUser?.id) {
//       Alert.alert('Error', 'Unable to determine the recipient for this chat.');
//       return;
//     }

//     setSending(true);
//     const messageContent = newMessage.trim();
//     setNewMessage('');
//     const encryptedContent = await encryptMessage(messageContent);

//     const baseMessagePayload: Record<string, any> = {
//       conversation_id: id,
//       sender_id: session.user.id,
//       content: '[encrypted]',
//       ciphertext: encryptedContent,
//       read: false,
//     };

//     try {
//       const attemptInsert = async (payload: Record<string, any>) => {
//         const { error } = await supabase.from('messages').insert(payload);
//         if (error) {
//           throw error;
//         }
//       };

//       const payloadAttempts: Record<string, any>[] = [
//         {
//           ...baseMessagePayload,
//           sender: session.user.id,
//           recipient: otherUser.id,
//         },
//         { ...baseMessagePayload },
//         (() => {
//           const fallbackPayload: Record<string, any> = {
//             ...baseMessagePayload,
//             content: encryptedContent,
//           };
//           delete fallbackPayload.ciphertext;
//           return fallbackPayload;
//         })(),
//       ];

//       let lastError: any = null;
//       let sent = false;

//       for (const payload of payloadAttempts) {
//         try {
//           await attemptInsert(payload);
//           sent = true;
//           break;
//         } catch (error) {
//           lastError = error;
//         }
//       }

//       if (!sent && lastError) {
//         throw lastError;
//       }

//       const { error: updateError } = await supabase
//         .from('conversations')
//         .update({ updated_at: new Date().toISOString() })
//         .eq('id', id);

//       if (updateError) {
//         throw updateError;
//       }
//     } catch (error: any) {
//       setNewMessage(messageContent);
//       Alert.alert(
//         'Error',
//         error?.message || 'Failed to send message. Please try again.'
//       );
//     } finally {
//       setSending(false);
//     }
//   };

//   const renderMessage = ({ item }: { item: Message }) => {
//     const isOwnMessage = item.sender_id === session?.user.id;

//     return (
//       <View
//         style={[
//           styles.messageContainer,
//           isOwnMessage ? styles.ownMessage : styles.otherMessage,
//         ]}
//       >
//         <View
//           style={[
//             styles.messageBubble,
//             isOwnMessage ? styles.ownBubble : styles.otherBubble,
//           ]}
//         >
//           <Text
//             style={[
//               styles.messageText,
//               isOwnMessage ? styles.ownText : styles.otherText,
//             ]}
//           >
//             {item.content}
//           </Text>
//           <View
//             style={[
//               styles.messageMeta,
//               isOwnMessage ? styles.ownMeta : styles.otherMeta,
//             ]}
//           >
//             <Text
//               style={[
//                 styles.messageTime,
//                 isOwnMessage ? styles.ownTime : styles.otherTime,
//               ]}
//             >
//               {new Date(item.created_at).toLocaleTimeString([], {
//                 hour: '2-digit',
//                 minute: '2-digit',
//               })}
//             </Text>
//             {isOwnMessage && item.read && (
//               <Check
//                 size={14}
//                 color="rgba(255, 255, 255, 0.85)"
//                 style={styles.messageStatusIcon}
//               />
//             )}
//           </View>
//         </View>
//       </View>
//     );
//   };

//   if (loading) {
//     return (
//       <View style={styles.centered}>
//         <ActivityIndicator size="large" color="#007AFF" />
//       </View>
//     );
//   }

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
//       keyboardVerticalOffset={keyboardVerticalOffset}
//     >
//       <View style={styles.header} onLayout={handleHeaderLayout}>
//         <TouchableOpacity
//           style={styles.backButton}
//           onPress={() => router.back()}
//         >
//           <ArrowLeft size={24} color="#007AFF" />
//         </TouchableOpacity>
//         <View style={styles.headerInfo}>
//           <View style={styles.headerAvatar}>
//             <Text style={styles.headerAvatarText}>
//               {otherUser?.display_name?.charAt(0).toUpperCase() || '?'}
//             </Text>
//           </View>
//           <Text style={styles.headerTitle}>
//             {otherUser?.display_name || 'Chat'}
//           </Text>
//         </View>
//         <View style={styles.headerActions}>
//           <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
//             <Phone size={22} color="#007AFF" />
//           </TouchableOpacity>
//           <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
//             <Video size={22} color="#007AFF" />
//           </TouchableOpacity>
//         </View>
//       </View>

//       <FlatList
//         ref={flatListRef}
//         data={messages}
//         renderItem={renderMessage}
//         keyExtractor={(item) => item.id}
//         style={styles.messagesWrapper}
//         contentContainerStyle={[
//           styles.messagesList,
//           { paddingBottom: listBottomPadding },
//         ]}
//         onContentSizeChange={() =>
//           flatListRef.current?.scrollToEnd({ animated: true })
//         }
//         keyboardShouldPersistTaps="handled"
//         ListEmptyComponent={
//           <View style={styles.emptyContainer}>
//             <Text style={styles.emptyText}>No messages yet</Text>
//             <Text style={styles.emptySubtext}>Start the conversation!</Text>
//           </View>
//         }
//       />

//       <View
//         style={[
//           styles.inputContainer,
//           { paddingBottom: inputPaddingBottom },
//         ]}
//       >
//         <TextInput
//           style={styles.input}
//           value={newMessage}
//           onChangeText={setNewMessage}
//           placeholder="Type a message..."
//           multiline
//           maxLength={1000}
//           onFocus={() => flatListRef.current?.scrollToEnd({ animated: true })}
//         />
//         <TouchableOpacity
//           style={[
//             styles.sendButton,
//             (!newMessage.trim() || sending) && styles.sendButtonDisabled,
//           ]}
//           onPress={sendMessage}
//           disabled={!newMessage.trim() || sending}
//         >
//           {sending ? (
//             <ActivityIndicator size="small" color="#fff" />
//           ) : (
//             <Send size={20} color="#fff" />
//           )}
//         </TouchableOpacity>
//       </View>
//     </KeyboardAvoidingView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#f9fafb',
//   },
//   centered: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     backgroundColor: '#fff',
//   },
//   header: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingHorizontal: 16,
//     paddingTop: 60,
//     paddingBottom: 12,
//     backgroundColor: '#fff',
//     borderBottomWidth: 1,
//     borderBottomColor: '#e5e7eb',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.05,
//     shadowRadius: 2,
//     elevation: 2,
//   },
//   backButton: {
//     width: 40,
//     height: 40,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   headerInfo: {
//     flex: 1,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   headerAvatar: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     backgroundColor: '#007AFF',
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginRight: 8,
//   },
//   headerAvatarText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: '600',
//   },
//   headerTitle: {
//     fontSize: 18,
//     fontWeight: '600',
//     color: '#1a1a1a',
//   },
//   headerActions: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
//   iconButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#f0f4ff',
//   },
//   messagesList: {
//     flexGrow: 1,
//     paddingHorizontal: 16,
//     paddingTop: 16,
//     paddingBottom: 16,
//   },
//   messagesWrapper: {
//     flex: 1,
//   },
//   messageContainer: {
//     marginBottom: 12,
//   },
//   ownMessage: {
//     alignItems: 'flex-end',
//   },
//   otherMessage: {
//     alignItems: 'flex-start',
//   },
//   messageBubble: {
//     maxWidth: '75%',
//     paddingHorizontal: 14,
//     paddingVertical: 10,
//     borderRadius: 18,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.1,
//     shadowRadius: 2,
//     elevation: 1,
//   },
//   ownBubble: {
//     backgroundColor: '#007AFF',
//     borderBottomRightRadius: 6,
//   },
//   otherBubble: {
//     backgroundColor: '#fff',
//     borderBottomLeftRadius: 6,
//     borderWidth: 1,
//     borderColor: '#e5e7eb',
//   },
//   messageText: {
//     fontSize: 16,
//     lineHeight: 20,
//     marginBottom: 4,
//   },
//   ownText: {
//     color: '#fff',
//   },
//   otherText: {
//     color: '#1a1a1a',
//   },
//   messageTime: {
//     fontSize: 11,
//   },
//   ownTime: {
//     color: 'rgba(255, 255, 255, 0.7)',
//   },
//   otherTime: {
//     color: '#999',
//   },
//   messageMeta: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginTop: 2,
//   },
//   ownMeta: {
//     justifyContent: 'flex-end',
//     alignSelf: 'flex-end',
//   },
//   otherMeta: {
//     justifyContent: 'flex-start',
//     alignSelf: 'flex-start',
//   },
//   messageStatusIcon: {
//     marginLeft: 6,
//   },
//   inputContainer: {
//     flexDirection: 'row',
//     alignItems: 'flex-end',
//     paddingHorizontal: 16,
//     paddingTop: 12,
//     paddingBottom: 12,
//     backgroundColor: '#fff',
//     borderTopWidth: 1,
//     borderTopColor: '#e5e7eb',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: -1 },
//     shadowOpacity: 0.05,
//     shadowRadius: 2,
//     elevation: 3,
//   },
//   input: {
//     flex: 1,
//     minHeight: 42,
//     maxHeight: 100,
//     borderWidth: 1,
//     borderColor: '#e5e7eb',
//     borderRadius: 22,
//     paddingHorizontal: 18,
//     paddingVertical: 11,
//     fontSize: 16,
//     backgroundColor: '#fff',
//     marginRight: 10,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.05,
//     shadowRadius: 2,
//     elevation: 1,
//   },
//   sendButton: {
//     width: 42,
//     height: 42,
//     borderRadius: 21,
//     backgroundColor: '#007AFF',
//     justifyContent: 'center',
//     alignItems: 'center',
//     shadowColor: '#007AFF',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.3,
//     shadowRadius: 3,
//     elevation: 3,
//   },
//   sendButtonDisabled: {
//     opacity: 0.4,
//   },
//   emptyContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     paddingVertical: 60,
//   },
//   emptyText: {
//     fontSize: 18,
//     fontWeight: '600',
//     color: '#999',
//     marginBottom: 4,
//   },
//   emptySubtext: {
//     fontSize: 14,
//     color: '#999',
//   },
// });

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
  Animated,
} from 'react-native';
import type { KeyboardEventName, LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone, Video, Send } from 'lucide-react-native';
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
  read: boolean;
}

const AnimatedMessage = ({ item, isOwnMessage, session }: { item: Message; isOwnMessage: boolean; session: any }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.messageContainer,
        isOwnMessage ? styles.ownMessage : styles.otherMessage,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownBubble : styles.otherBubble,
          {
            shadowOpacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 0.4],
            }),
          },
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
      </Animated.View>
    </Animated.View>
  );
};

const AnimatedButton = ({ children, style, onPress, disabled }: any) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={1}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

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
  const inputBorderPulse = useRef(new Animated.Value(0)).current;
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
    if (newMessage.trim()) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(inputBorderPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(inputBorderPulse, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      inputBorderPulse.setValue(0);
    }
  }, [newMessage]);

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
              prev.map((msg) => (msg.id === updated.id ? { ...msg, read: updated.read } : msg))
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
      <AnimatedMessage
        item={item}
        isOwnMessage={isOwnMessage}
        session={session}
      />
    );
  };

  const LoadingAnimation = () => {
    const pulse1 = useRef(new Animated.Value(0.3)).current;
    const pulse2 = useRef(new Animated.Value(0.3)).current;
    const pulse3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      const createPulse = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        );
      };

      Animated.parallel([
        createPulse(pulse1, 0),
        createPulse(pulse2, 200),
        createPulse(pulse3, 400),
      ]).start();
    }, []);

    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingDots}>
          <Animated.View style={[styles.loadingDot, { opacity: pulse1 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: pulse2 }]} />
          <Animated.View style={[styles.loadingDot, { opacity: pulse3 }]} />
        </View>
        <Text style={styles.loadingText}>ESTABLISHING SECURE CONNECTION</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <LoadingAnimation />
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
        <AnimatedButton style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#4CAF50" />
        </AnimatedButton>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {otherUser?.display_name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.headerTitle}>
            {otherUser?.display_name || 'SECURE CHANNEL'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <AnimatedButton style={styles.iconButton} onPress={() => {}}>
            <Phone size={22} color="#4CAF50" />
          </AnimatedButton>
          <AnimatedButton style={styles.iconButton} onPress={() => {}}>
            <Video size={22} color="#4CAF50" />
          </AnimatedButton>
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
        <Animated.View
          style={[
            styles.inputWrapper,
            {
              borderColor: inputBorderPulse.interpolate({
                inputRange: [0, 1],
                outputRange: ['#4CAF50', '#7cb342'],
              }),
              shadowOpacity: inputBorderPulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.6],
              }),
            },
          ]}
        >
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#7cb342"
            multiline
            maxLength={1000}
            onFocus={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        </Animated.View>
        <AnimatedButton
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Send size={20} color="#000" />
          )}
        </AnimatedButton>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0e1a',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7cb342',
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: '#141824',
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
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
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#7cb342',
  },
  headerAvatarText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: '#4CAF50',
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  ownBubble: {
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: '#7cb342',
  },
  otherBubble: {
    backgroundColor: '#141824',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  ownText: {
    color: '#000',
    fontWeight: '600',
  },
  otherText: {
    color: '#e0e0e0',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messageTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  ownTime: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  otherTime: {
    color: '#7cb342',
  },
  readIndicator: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.6)',
    marginLeft: 2,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#141824',
    borderTopWidth: 2,
    borderTopColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  inputWrapper: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 4,
    backgroundColor: '#1a2332',
    marginRight: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    minHeight: 42,
    maxHeight: 100,
    paddingHorizontal: 18,
    paddingVertical: 11,
    fontSize: 16,
    color: '#e0e0e0',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7cb342',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
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
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
    letterSpacing: 1,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#7cb342',
  },
});

