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
// import { useRouter, useLocalSearchParams } from 'expo-router';
// import { useAuth } from '@/contexts/AuthContext';

// export default function VerifyOtpScreen() {
//   const [otp, setOtp] = useState('');
//   const [loading, setLoading] = useState(false);
//   const { verifyOtp, signInWithPhone } = useAuth();
//   const router = useRouter();
//   const { phone } = useLocalSearchParams<{ phone: string }>();

//   const handleVerifyOtp = async () => {
//     if (!otp || otp.length < 6) {
//       Alert.alert('Error', 'Please enter a valid OTP');
//       return;
//     }

//     setLoading(true);
//     const { error } = await verifyOtp(phone, otp);
//     setLoading(false);

//     if (error) {
//       Alert.alert('Error', error.message);
//     } else {
//       router.replace('/(tabs)');
//     }
//   };

//   const handleResendOtp = async () => {
//     setLoading(true);
//     const { error } = await signInWithPhone(phone);
//     setLoading(false);

//     if (error) {
//       Alert.alert('Error', error.message);
//     } else {
//       Alert.alert('Success', 'OTP resent successfully');
//     }
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.content}>
//         <Text style={styles.title}>Verify OTP</Text>
//         <Text style={styles.subtitle}>
//           Enter the code sent to {phone}
//         </Text>

//         <View style={styles.inputContainer}>
//           <TextInput
//             style={styles.input}
//             placeholder="Enter 6-digit OTP"
//             value={otp}
//             onChangeText={setOtp}
//             keyboardType="number-pad"
//             maxLength={6}
//             editable={!loading}
//             autoFocus
//           />
//         </View>

//         <TouchableOpacity
//           style={[styles.button, loading && styles.buttonDisabled]}
//           onPress={handleVerifyOtp}
//           disabled={loading}
//         >
//           {loading ? (
//             <ActivityIndicator color="#fff" />
//           ) : (
//             <Text style={styles.buttonText}>Verify</Text>
//           )}
//         </TouchableOpacity>

//         <TouchableOpacity
//           style={styles.resendButton}
//           onPress={handleResendOtp}
//           disabled={loading}
//         >
//           <Text style={styles.resendText}>Resend OTP</Text>
//         </TouchableOpacity>
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
//     fontSize: 24,
//     backgroundColor: '#f9f9f9',
//     textAlign: 'center',
//     letterSpacing: 8,
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
//   resendButton: {
//     padding: 12,
//     alignItems: 'center',
//   },
//   resendText: {
//     color: '#007AFF',
//     fontSize: 16,
//     fontWeight: '600',
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Mail } from 'lucide-react-native';
import { theme } from '@/constants/theme';

export default function VerifyOtpScreen() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { verifyOtp, signInWithEmail } = useAuth();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) {
      Alert.alert('Error', 'Please enter a valid OTP');
      return;
    }

    setLoading(true);
    const { error } = await verifyOtp(email, otp);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    const { error } = await signInWithEmail(email);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'OTP resent successfully');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Mail size={48} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We sent a code to {email}
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Enter Code</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor={theme.colors.textDisabled}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyOtp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Verify Code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleResendOtp}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.resendText}>Resend Code</Text>
          </TouchableOpacity>
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
    textAlign: 'center',
  },
  input: {
    height: 64,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: 28,
    fontWeight: '600',
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
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
    color: theme.colors.surface,
  },
  resendButton: {
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  resendText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});