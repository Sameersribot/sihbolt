// import React, { useEffect, useState } from 'react';
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   TextInput,
//   Alert,
//   ActivityIndicator,
// } from 'react-native';
// import { useRouter } from 'expo-router';
// import { LogOut, User as UserIcon } from 'lucide-react-native';
// import { supabase } from '@/lib/supabase';
// import { useAuth } from '@/contexts/AuthContext';

// export default function ProfileScreen() {
//   const [displayName, setDisplayName] = useState('');
//   const [phoneNumber, setPhoneNumber] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const { session, signOut } = useAuth();
//   const router = useRouter();

//   useEffect(() => {
//     if (session?.user) {
//       loadProfile();
//     }
//   }, [session]);

//   const loadProfile = async () => {
//     if (!session?.user) return;

//     const { data } = await supabase
//       .from('profiles')
//       .select('*')
//       .eq('id', session.user.id)
//       .maybeSingle();

//     if (data) {
//       setDisplayName(data.display_name || '');
//       setPhoneNumber(data.phone_number || '');
//     }
//     setLoading(false);
//   };

//   const handleSaveProfile = async () => {
//     if (!displayName) {
//       Alert.alert('Error', 'Please enter a display name');
//       return;
//     }

//     setSaving(true);
//     const { error } = await supabase
//       .from('profiles')
//       .update({ display_name: displayName })
//       .eq('id', session?.user.id);

//     setSaving(false);

//     if (error) {
//       Alert.alert('Error', error.message);
//     } else {
//       Alert.alert('Success', 'Profile updated successfully');
//     }
//   };

//   const handleSignOut = async () => {
//     await signOut();
//     router.replace('/login');
//   };

//   if (loading) {
//     return (
//       <View style={styles.centered}>
//         <ActivityIndicator size="large" color="#007AFF" />
//       </View>
//     );
//   }

//   return (
//     <View style={styles.container}>
//       <View style={styles.header}>
//         <Text style={styles.headerTitle}>Profile</Text>
//         <TouchableOpacity
//           style={styles.signOutButton}
//           onPress={handleSignOut}
//         >
//           <LogOut size={24} color="#FF3B30" />
//         </TouchableOpacity>
//       </View>

//       <View style={styles.content}>
//         <View style={styles.avatarContainer}>
//           <View style={styles.avatar}>
//             <UserIcon size={48} color="#fff" />
//           </View>
//         </View>

//         <View style={styles.formContainer}>
//           <View style={styles.fieldContainer}>
//             <Text style={styles.label}>Display Name</Text>
//             <TextInput
//               style={styles.input}
//               value={displayName}
//               onChangeText={setDisplayName}
//               placeholder="Enter your display name"
//             />
//           </View>

//           <View style={styles.fieldContainer}>
//             <Text style={styles.label}>Phone Number</Text>
//             <TextInput
//               style={[styles.input, styles.inputDisabled]}
//               value={phoneNumber}
//               editable={false}
//             />
//           </View>

//           <TouchableOpacity
//             style={[styles.saveButton, saving && styles.buttonDisabled]}
//             onPress={handleSaveProfile}
//             disabled={saving}
//           >
//             {saving ? (
//               <ActivityIndicator color="#fff" />
//             ) : (
//               <Text style={styles.saveButtonText}>Save Changes</Text>
//             )}
//           </TouchableOpacity>
//         </View>
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#fff',
//   },
//   centered: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     backgroundColor: '#fff',
//   },
//   header: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingHorizontal: 20,
//     paddingTop: 60,
//     paddingBottom: 16,
//     backgroundColor: '#fff',
//     borderBottomWidth: 1,
//     borderBottomColor: '#e0e0e0',
//   },
//   headerTitle: {
//     fontSize: 32,
//     fontWeight: '700',
//     color: '#1a1a1a',
//   },
//   signOutButton: {
//     width: 40,
//     height: 40,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   content: {
//     flex: 1,
//   },
//   avatarContainer: {
//     alignItems: 'center',
//     paddingVertical: 32,
//   },
//   avatar: {
//     width: 100,
//     height: 100,
//     borderRadius: 50,
//     backgroundColor: '#007AFF',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   formContainer: {
//     paddingHorizontal: 20,
//   },
//   fieldContainer: {
//     marginBottom: 24,
//   },
//   label: {
//     fontSize: 14,
//     fontWeight: '600',
//     color: '#666',
//     marginBottom: 8,
//   },
//   input: {
//     height: 48,
//     borderWidth: 1,
//     borderColor: '#e0e0e0',
//     borderRadius: 8,
//     paddingHorizontal: 12,
//     fontSize: 16,
//     backgroundColor: '#fff',
//   },
//   inputDisabled: {
//     backgroundColor: '#f9f9f9',
//     color: '#999',
//   },
//   saveButton: {
//     height: 48,
//     backgroundColor: '#007AFF',
//     borderRadius: 8,
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginTop: 8,
//   },
//   buttonDisabled: {
//     opacity: 0.6,
//   },
//   saveButtonText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: '600',
//   },
// });


import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, User as UserIcon } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { session, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session?.user) {
      loadProfile();
    }
  }, [session]);

  const loadProfile = async () => {
    if (!session?.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (data) {
      setDisplayName(data.display_name || '');
      setPhoneNumber(data.phone || session.user.email || '');
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!displayName) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', session?.user.id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Profile updated successfully');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PROFILE</Text>
          <Text style={styles.teamBadge}>TEAM IIPE</Text>
        </View>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <LogOut size={24} color="#ff5252" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <UserIcon size={48} color="#fff" />
          </View>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={phoneNumber}
              editable={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#141824',
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 2,
  },
  teamBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7cb342',
    letterSpacing: 3,
    marginTop: 2,
  },
  signOutButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff5252',
  },
  content: {
    flex: 1,
  },
  avatarContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7cb342',
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7cb342',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 4,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#141824',
    color: '#e0e0e0',
  },
  inputDisabled: {
    backgroundColor: '#1a2332',
    color: '#7cb342',
  },
  saveButton: {
    height: 48,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#7cb342',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});