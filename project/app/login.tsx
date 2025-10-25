// import React, { useState } from 'react';
// import {
//   View,
//   Text,
//   TextInput,
//   TouchableOpacity,
//   StyleSheet,
//   Alert,
//   ActivityIndicator,
// } from 'react-native';
// import { useRouter } from 'expo-router';
// import { useAuth } from '@/contexts/AuthContext';

// export default function LoginScreen() {
//   const [phone, setPhone] = useState('');
//   const [loading, setLoading] = useState(false);
//   const { signInWithPhone } = useAuth();
//   const router = useRouter();

//   const handleSendOtp = async () => {
//     if (!phone || phone.length < 10) {
//       Alert.alert('Error', 'Please enter a valid phone number');
//       return;
//     }

//     setLoading(true);
//     const { error } = await signInWithPhone(phone);
//     setLoading(false);

//     if (error) {
//       Alert.alert('Error', error.message);
//     } else {
//       router.push({ pathname: '/verify-otp', params: { phone } });
//     }
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.content}>
//         <Text style={styles.title}>Welcome to ChatApp</Text>
//         <Text style={styles.subtitle}>Enter your phone number to continue</Text>

//         <View style={styles.inputContainer}>
//           <TextInput
//             style={styles.input}
//             placeholder="Phone number (e.g., +1234567890)"
//             value={phone}
//             onChangeText={setPhone}
//             keyboardType="phone-pad"
//             autoComplete="tel"
//             editable={!loading}
//           />
//         </View>

//         <TouchableOpacity
//           style={[styles.button, loading && styles.buttonDisabled]}
//           onPress={handleSendOtp}
//           disabled={loading}
//         >
//           {loading ? (
//             <ActivityIndicator color="#fff" />
//           ) : (
//             <Text style={styles.buttonText}>Send OTP</Text>
//           )}
//         </TouchableOpacity>

//         <Text style={styles.infoText}>
//           You'll receive a verification code via SMS
//         </Text>
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#fff',
//   },
//   content: {
//     flex: 1,
//     justifyContent: 'center',
//     paddingHorizontal: 24,
//   },
//   title: {
//     fontSize: 32,
//     fontWeight: '700',
//     color: '#1a1a1a',
//     marginBottom: 8,
//     textAlign: 'center',
//   },
//   subtitle: {
//     fontSize: 16,
//     color: '#666',
//     marginBottom: 40,
//     textAlign: 'center',
//   },
//   inputContainer: {
//     marginBottom: 24,
//   },
//   input: {
//     height: 56,
//     borderWidth: 2,
//     borderColor: '#e0e0e0',
//     borderRadius: 12,
//     paddingHorizontal: 16,
//     fontSize: 16,
//     backgroundColor: '#f9f9f9',
//   },
//   button: {
//     height: 56,
//     backgroundColor: '#007AFF',
//     borderRadius: 12,
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginBottom: 16,
//   },
//   buttonDisabled: {
//     opacity: 0.6,
//   },
//   buttonText: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: '600',
//   },
//   infoText: {
//     fontSize: 14,
//     color: '#999',
//     textAlign: 'center',
//   },
// });


import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Mail } from 'lucide-react-native';
import { theme } from '@/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const { signInWithEmail } = useAuth();
  const router = useRouter();

  const handleSendOtp = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    const { error } = await signInWithEmail(email);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.push({ pathname: '/verify-otp', params: { email } });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Mail size={48} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue to your messages</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Email Address</Text>
          <View style={[
            styles.inputWrapper,
            focused && styles.inputWrapperFocused
          ]}>
            <Mail size={20} color={focused ? theme.colors.primary : theme.colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={theme.colors.textDisabled}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              editable={!loading}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.infoText}>
            We'll send you a verification code to your email
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  label: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  inputIcon: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
  },
  button: {
    height: 56,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...theme.typography.button,
    color: '#FFFFFF',
  },
  infoText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});