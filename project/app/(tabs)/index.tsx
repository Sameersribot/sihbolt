import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Search, X, MessageCircle } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { theme } from '@/constants/theme';

interface Conversation {
  id: string;
  updated_at: string;
  other_user: {
    id: string;
    display_name: string;
    phone: string;
  };
  last_message?: {
    content: string;
    created_at: string;
  };
}

export default function ChatsScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatIdentifier, setNewChatIdentifier] = useState('');
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.user) {
      loadConversations();

      const channel = supabase
        .channel('conversations')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
          },
          () => {
            loadConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session]);

  const loadConversations = async () => {
    if (!session?.user) return;

    const { data: participantData } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', session.user.id);

    if (!participantData || participantData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = participantData.map((p) => p.conversation_id);

    const { data: conversationsData } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (!conversationsData) {
      setLoading(false);
      return;
    }

    const conversationsWithDetails = await Promise.all(
      conversationsData.map(async (conv) => {
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', session.user.id)
          .limit(1)
          .maybeSingle();

        if (!participants) return null;

        const { data: otherUser } = await supabase
          .from('profiles')
          .select('id, display_name, phone')
          .eq('id', participants.user_id)
          .single();

        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          id: conv.id,
          updated_at: conv.updated_at,
          other_user: otherUser,
          last_message: lastMessage || undefined,
        };
      })
    );

    setConversations(
      conversationsWithDetails.filter((c) => c !== null) as Conversation[]
    );
    setLoading(false);
  };

  const escapeForILike = (value: string) =>
    value.replace(/[%_\\]/g, (char) => `\\${char}`);

  const createNewChat = async () => {
    const searchValue = newChatIdentifier.trim();

    if (!searchValue) {
      Alert.alert('Error', 'Please enter an email or username');
      return;
    }

    if (!session?.user) {
      Alert.alert('Error', 'You need to be signed in to start a chat');
      return;
    }

    if (
      session.user.email &&
      session.user.email.toLowerCase() === searchValue.toLowerCase()
    ) {
      Alert.alert('Error', 'You cannot start a chat with yourself');
      return;
    }

    type ProfileSearchCandidate = {
      column: 'phone' | 'display_name';
      value: string;
      operator: 'eq' | 'ilike';
    };

    const searchCandidates: ProfileSearchCandidate[] = [];
    const sanitizedValue = escapeForILike(searchValue);

    if (searchValue.includes('@')) {
      const normalizedEmail = searchValue.toLowerCase();
      searchCandidates.push({
        column: 'phone',
        value: normalizedEmail,
        operator: 'eq',
      });

      if (normalizedEmail !== searchValue) {
        searchCandidates.push({
          column: 'phone',
          value: searchValue,
          operator: 'eq',
        });
      }

      searchCandidates.push({
        column: 'phone',
        value: sanitizedValue,
        operator: 'ilike',
      });
    }

    searchCandidates.push(
      {
        column: 'display_name',
        value: searchValue,
        operator: 'eq',
      },
      {
        column: 'display_name',
        value: sanitizedValue,
        operator: 'ilike',
      },
      {
        column: 'display_name',
        value: `%${sanitizedValue}%`,
        operator: 'ilike',
      }
    );

    let matchedUser: { id: string } | null = null;
    let searchErrorMessage: string | null = null;

    for (const candidate of searchCandidates) {
      const baseQuery = supabase
        .from('profiles')
        .select('id')
        .neq('id', session.user.id);

      const query =
        candidate.operator === 'eq'
          ? baseQuery.eq(candidate.column, candidate.value)
          : baseQuery.ilike(candidate.column, candidate.value);

      const { data, error } = await query.maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          searchErrorMessage =
            'Multiple users match that search. Please enter the exact email or username.';
        } else {
          searchErrorMessage = error.message;
        }
        break;
      }

      if (data) {
        matchedUser = data;
        break;
      }
    }

    if (searchErrorMessage) {
      Alert.alert('Error', searchErrorMessage);
      return;
    }

    if (!matchedUser) {
      Alert.alert('Error', 'User not found');
      return;
    }

    const {
      data: existingConv,
      error: existingConvError,
    } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', session.user.id);

    if (existingConvError) {
      Alert.alert('Error', existingConvError.message);
      return;
    }

    if (existingConv) {
      for (const conv of existingConv) {
        const {
          data: otherParticipant,
          error: otherParticipantError,
        } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.conversation_id)
          .eq('user_id', matchedUser.id)
          .maybeSingle();

        if (otherParticipantError) {
          Alert.alert('Error', otherParticipantError.message);
          return;
        }

        if (otherParticipant) {
          setShowNewChat(false);
          setNewChatIdentifier('');
          router.push({
            pathname: '/chat/[id]',
            params: { id: conv.conversation_id },
          });
          return;
        }
      }
    }

    const { data: newConv, error: newConvError } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single();

    if (newConvError || !newConv) {
      Alert.alert(
        'Error',
        newConvError?.message || 'Could not create a new conversation.'
      );
      return;
    }

    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: newConv.id, user_id: session.user.id },
        { conversation_id: newConv.id, user_id: matchedUser.id },
      ]);

    if (participantsError) {
      Alert.alert('Error', participantsError.message);
      return;
    }

    setShowNewChat(false);
    setNewChatIdentifier('');
    router.push({
      pathname: '/chat/[id]',
      params: { id: newConv.id },
    });
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() =>
        router.push({
          pathname: '/chat/[id]',
          params: { id: item.id },
        })
      }
      activeOpacity={0.7}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.other_user.display_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName}>
            {item.other_user.display_name}
          </Text>
          {item.last_message && (
            <Text style={styles.conversationTime}>
              {new Date(item.last_message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>
        {item.last_message ? (
          <Text style={styles.conversationMessage} numberOfLines={1}>
            {item.last_message.content}
          </Text>
        ) : (
          <Text style={styles.conversationPlaceholder}>No messages yet</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={() => setShowNewChat(true)}
          activeOpacity={0.7}
        >
          <Plus size={24} color={theme.colors.surface} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations"
          placeholderTextColor={theme.colors.textDisabled}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageCircle size={64} color={theme.colors.textDisabled} />
          <Text style={styles.emptyText}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>
            Tap the + button to start a new chat
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations.filter((conv) =>
            conv.other_user.display_name
              .toLowerCase()
              .includes(searchQuery.toLowerCase())
          )}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={showNewChat}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewChat(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowNewChat(false);
                  setNewChatIdentifier('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Email or Username</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter email or username"
              placeholderTextColor={theme.colors.textDisabled}
              value={newChatIdentifier}
              onChangeText={setNewChatIdentifier}
              autoCapitalize="none"
              autoFocus
            />

            <TouchableOpacity
              style={styles.modalButton}
              onPress={createNewChat}
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Start Chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 60,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    ...theme.shadows.sm,
  },
  headerTitle: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  newChatButton: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
  },
  listContent: {
    paddingVertical: theme.spacing.sm,
  },
  conversationItem: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginVertical: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  avatarText: {
    ...theme.typography.h2,
    color: theme.colors.surface,
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  conversationName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  conversationTime: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  conversationMessage: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  conversationPlaceholder: {
    ...theme.typography.bodySmall,
    color: theme.colors.textDisabled,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyText: {
    ...theme.typography.h3,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptySubtext: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  modalLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  modalInput: {
    height: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.lg,
  },
  modalButton: {
    height: 56,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  modalButtonText: {
    ...theme.typography.button,
    color: theme.colors.surface,
  },
});
