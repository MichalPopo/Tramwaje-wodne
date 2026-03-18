import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { colors, spacing, fonts, radius } from '../theme';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

// AI API — goes through LTE directly to the server
async function sendAiMessage(
    serverUrl: string,
    token: string,
    message: string,
    conversationId?: number,
): Promise<{ conversation_id: number; message: { content: string } }> {
    const res = await fetch(`${serverUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message, conversation_id: conversationId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export default function AiChatScreen() {
    const { token } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<number | undefined>();
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<FlatList>(null);

    // Import server URL dynamically
    const getServer = useCallback(async () => {
        const { getServerUrl } = await import('../api');
        return getServerUrl();
    }, []);

    const send = useCallback(async () => {
        if (!input.trim() || !token || isLoading) return;
        const userMsg = input.trim();
        setInput('');
        setError(null);

        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            const serverUrl = await getServer();
            const result = await sendAiMessage(serverUrl, token, userMsg, conversationId);
            setConversationId(result.conversation_id);
            setMessages(prev => [...prev, { role: 'model', text: result.message.content }]);
        } catch (err: any) {
            setError(err.message || 'Błąd połączenia z AI');
            setMessages(prev => [...prev, { role: 'model', text: `❌ ${err.message || 'Błąd komunikacji z AI'}` }]);
        } finally {
            setIsLoading(false);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
    }, [input, token, conversationId, isLoading, getServer]);

    const newConversation = () => {
        setMessages([]);
        setConversationId(undefined);
        setError(null);
    };

    const renderMessage = ({ item }: { item: ChatMessage }) => {
        const isUser = item.role === 'user';
        return (
            <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAi]}>
                <View style={[styles.msgBubble, isUser ? styles.msgBubbleUser : styles.msgBubbleAi]}>
                    {!isUser && <Text style={styles.msgSender}>🤖 AI Asystent</Text>}
                    <Text style={[styles.msgText, isUser && styles.msgTextUser]}>{item.text}</Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={90}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>🤖 AI Asystent</Text>
                <TouchableOpacity onPress={newConversation} style={styles.newBtn}>
                    <Text style={styles.newBtnText}>+ Nowa</Text>
                </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(_, i) => String(i)}
                renderItem={renderMessage}
                contentContainerStyle={styles.msgList}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>⚓</Text>
                        <Text style={styles.emptyTitle}>Asystent Tramwajów Wodnych</Text>
                        <Text style={styles.emptyText}>
                            Zapytaj o cokolwiek — zadania, pogodę, instrukcje serwisowe,
                            stan magazynu, planowanie dnia...
                        </Text>
                        <View style={styles.suggestions}>
                            {['Co robić dzisiaj?', 'Jaka pogoda w Tolkmicku?', 'Stan magazynu farby'].map(s => (
                                <TouchableOpacity
                                    key={s}
                                    style={styles.suggestion}
                                    onPress={() => { setInput(s); }}
                                >
                                    <Text style={styles.suggestionText}>{s}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                }
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            />

            {/* Error banner */}
            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
            )}

            {/* Input bar */}
            <View style={styles.inputBar}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Napisz wiadomość..."
                    placeholderTextColor={colors.textDim}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    maxLength={2000}
                    editable={!isLoading}
                    onSubmitEditing={send}
                    blurOnSubmit={false}
                />
                <TouchableOpacity
                    style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
                    onPress={send}
                    disabled={!input.trim() || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.sendBtnText}>➤</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.bgCard,
    },
    headerTitle: { fontSize: fonts.lg, fontWeight: '700', color: colors.text },
    newBtn: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    newBtnText: { color: colors.primary, fontSize: fonts.sm, fontWeight: '600' },

    msgList: { padding: spacing.md, paddingBottom: spacing.xxl },

    msgRow: { marginBottom: spacing.md },
    msgRowUser: { alignItems: 'flex-end' },
    msgRowAi: { alignItems: 'flex-start' },

    msgBubble: {
        maxWidth: '85%',
        borderRadius: radius.lg,
        padding: spacing.md,
    },
    msgBubbleUser: {
        backgroundColor: colors.primary,
        borderBottomRightRadius: radius.sm,
    },
    msgBubbleAi: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderBottomLeftRadius: radius.sm,
    },
    msgSender: {
        fontSize: fonts.sm,
        color: colors.textMuted,
        marginBottom: 4,
        fontWeight: '600',
    },
    msgText: { fontSize: fonts.md, color: colors.text, lineHeight: 22 },
    msgTextUser: { color: '#fff' },

    emptyContainer: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: { fontSize: fonts.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    emptyText: {
        fontSize: fonts.md, color: colors.textMuted, textAlign: 'center',
        paddingHorizontal: spacing.xxl, lineHeight: 22,
    },
    suggestions: { marginTop: spacing.xl, gap: spacing.sm },
    suggestion: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.full,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },
    suggestionText: { color: colors.textMuted, fontSize: fonts.sm },

    errorBanner: {
        backgroundColor: colors.accentRed + '22',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    errorText: { color: colors.accentRed, fontSize: fonts.sm },

    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bgCard,
        gap: spacing.sm,
    },
    textInput: {
        flex: 1,
        backgroundColor: colors.bgInput,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        fontSize: fonts.md,
        color: colors.text,
        maxHeight: 100,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendBtnText: { fontSize: 20, color: '#fff' },
});
