import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { getServerUrl, setServerUrl } from '../api';
import { colors, spacing, fonts, radius } from '../theme';

export default function LoginScreen() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [serverAddr, setServerAddr] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showServer, setShowServer] = useState(false);

    // Load the current server URL on first show
    React.useEffect(() => {
        getServerUrl().then(setServerAddr);
    }, []);

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Błąd', 'Wpisz email i hasło');
            return;
        }
        setIsLoading(true);
        try {
            // Save server address if changed
            if (serverAddr.trim()) {
                await setServerUrl(serverAddr.trim());
            }
            await login(email.trim(), password.trim());
        } catch (err: any) {
            Alert.alert(
                'Nie udało się zalogować',
                err.message || 'Sprawdź czy serwer jest dostępny w sieci WiFi',
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                <Text style={styles.logo}>⚓</Text>
                <Text style={styles.title}>Tramwaje Wodne</Text>
                <Text style={styles.subtitle}>Zaloguj się do systemu</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.textDim}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Hasło"
                    placeholderTextColor={colors.textDim}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
                    onPress={handleLogin}
                    disabled={isLoading}
                    activeOpacity={0.8}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.loginBtnText}>Zaloguj</Text>
                    )}
                </TouchableOpacity>

                {/* Server address toggle */}
                <TouchableOpacity
                    onPress={() => setShowServer(s => !s)}
                    style={styles.serverToggle}
                >
                    <Text style={styles.serverToggleText}>
                        {showServer ? '▼' : '▶'} Adres serwera
                    </Text>
                </TouchableOpacity>

                {showServer && (
                    <TextInput
                        style={styles.input}
                        placeholder="http://192.168.1.100:3001"
                        placeholderTextColor={colors.textDim}
                        value={serverAddr}
                        onChangeText={setServerAddr}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />
                )}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        padding: spacing.xl,
    },
    logo: {
        fontSize: 64,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: fonts.title,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    subtitle: {
        fontSize: fonts.md,
        color: colors.textMuted,
        textAlign: 'center',
        marginBottom: spacing.xxl,
    },
    input: {
        backgroundColor: colors.bgInput,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        fontSize: fonts.lg,
        color: colors.text,
        marginBottom: spacing.md,
    },
    loginBtn: {
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        padding: spacing.lg,
        alignItems: 'center',
        marginTop: spacing.sm,
    },
    loginBtnDisabled: {
        opacity: 0.6,
    },
    loginBtnText: {
        color: '#fff',
        fontSize: fonts.lg,
        fontWeight: '600',
    },
    serverToggle: {
        marginTop: spacing.xl,
        alignItems: 'center',
    },
    serverToggleText: {
        color: colors.textDim,
        fontSize: fonts.sm,
    },
});
