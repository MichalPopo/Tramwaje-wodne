import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../AuthContext';
import { getServerUrl } from '../api';
import { addToSyncQueue, addProblemReport } from '../db/localDb';
import { sendInstantNotification } from '../notifications';
import { colors, spacing, fonts, radius } from '../theme';

interface Props {
    navigation: any;
    route?: any;
}

export default function ReportProblemScreen({ navigation, route }: Props) {
    const { token } = useAuth();
    const taskId = route?.params?.taskId;
    const taskTitle = route?.params?.taskTitle;

    const [title, setTitle] = useState(taskTitle ? `Problem: ${taskTitle}` : '');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'critical' | 'high' | 'medium'>('high');
    const [photo, setPhoto] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const pickPhoto = async () => {
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: true,
        });
        if (!result.canceled && result.assets[0]) {
            setPhoto(result.assets[0].uri);
        }
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: true,
        });
        if (!result.canceled && result.assets[0]) {
            setPhoto(result.assets[0].uri);
        }
    };

    const submit = async () => {
        if (!title.trim()) {
            Alert.alert('Błąd', 'Wpisz tytuł zgłoszenia');
            return;
        }
        if (!description.trim()) {
            Alert.alert('Błąd', 'Opisz problem');
            return;
        }

        setIsSending(true);

        try {
            // Save report locally
            await addProblemReport({
                task_id: taskId,
                title: title.trim(),
                description: description.trim(),
                photo_uri: photo || undefined,
                priority,
            });

            // Try to send to server immediately
            const serverUrl = await getServerUrl();
            try {
                const res = await fetch(`${serverUrl}/api/tasks`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        title: `🚨 ${title.trim()}`,
                        description: `**Zgłoszenie problemu**\n\n${description.trim()}${taskId ? `\n\nDotyczy zadania #${taskId}` : ''}`,
                        priority,
                        category: 'naprawa',
                        status: 'pending',
                    }),
                });

                if (res.ok) {
                    await sendInstantNotification(
                        '✅ Zgłoszenie wysłane',
                        title.trim(),
                    );
                } else {
                    throw new Error('Server error');
                }
            } catch {
                // Offline — queue for later sync
                await addToSyncQueue(
                    'report_problem',
                    '/api/tasks',
                    'POST',
                    {
                        title: `🚨 ${title.trim()}`,
                        description: `**Zgłoszenie problemu**\n\n${description.trim()}`,
                        priority,
                        category: 'naprawa',
                        status: 'pending',
                    },
                );

                await sendInstantNotification(
                    '📤 Zgłoszenie w kolejce',
                    'Zostanie wysłane po połączeniu z serwerem',
                );
            }

            Alert.alert(
                '✅ Zgłoszenie zapisane',
                'Admin zostanie powiadomiony.',
                [{ text: 'OK', onPress: () => navigation.goBack() }],
            );
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        } finally {
            setIsSending(false);
        }
    };

    const priorities = [
        { key: 'critical' as const, label: '🔴 Krytyczny', desc: 'Blokuje pracę' },
        { key: 'high' as const, label: '🟠 Wysoki', desc: 'Wymaga szybkiej reakcji' },
        { key: 'medium' as const, label: '🟡 Średni', desc: 'Do rozwiązania' },
    ];

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.header}>🚨 Zgłoś problem</Text>
            {taskTitle && (
                <Text style={styles.taskRef}>Dotyczy: {taskTitle}</Text>
            )}

            {/* Title */}
            <Text style={styles.label}>Tytuł *</Text>
            <TextInput
                style={styles.input}
                placeholder="Np. Uszkodzony silnik na Zefirze"
                placeholderTextColor={colors.textDim}
                value={title}
                onChangeText={setTitle}
            />

            {/* Description */}
            <Text style={styles.label}>Opis problemu *</Text>
            <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Opisz dokładnie co się stało..."
                placeholderTextColor={colors.textDim}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
            />

            {/* Priority */}
            <Text style={styles.label}>Priorytet</Text>
            <View style={styles.priorityRow}>
                {priorities.map(p => (
                    <TouchableOpacity
                        key={p.key}
                        style={[styles.priorityBtn, priority === p.key && styles.priorityActive]}
                        onPress={() => setPriority(p.key)}
                    >
                        <Text style={[styles.priorityLabel, priority === p.key && styles.priorityLabelActive]}>
                            {p.label}
                        </Text>
                        <Text style={styles.priorityDesc}>{p.desc}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Photo */}
            <Text style={styles.label}>Zdjęcie (opcjonalnie)</Text>
            <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
                    <Text style={styles.photoBtnText}>📷 Zrób zdjęcie</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery}>
                    <Text style={styles.photoBtnText}>🖼️ Z galerii</Text>
                </TouchableOpacity>
            </View>
            {photo && (
                <View style={styles.previewContainer}>
                    <Image source={{ uri: photo }} style={styles.preview} />
                    <TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)}>
                        <Text style={styles.removePhotoText}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Submit */}
            <TouchableOpacity
                style={[styles.submitBtn, isSending && styles.submitBtnDisabled]}
                onPress={submit}
                disabled={isSending}
            >
                {isSending ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.submitBtnText}>📤 Wyślij zgłoszenie</Text>
                )}
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
    header: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
    taskRef: { fontSize: fonts.md, color: colors.primary, marginBottom: spacing.lg },
    label: { fontSize: fonts.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.lg },
    input: {
        backgroundColor: colors.bgInput,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        fontSize: fonts.md,
        color: colors.text,
    },
    textArea: { minHeight: 120 },
    priorityRow: { gap: spacing.sm },
    priorityBtn: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    priorityActive: { borderColor: colors.primary, backgroundColor: colors.primary + '11' },
    priorityLabel: { fontSize: fonts.md, fontWeight: '600', color: colors.text },
    priorityLabelActive: { color: colors.primary },
    priorityDesc: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 2 },
    photoRow: { flexDirection: 'row', gap: spacing.sm },
    photoBtn: {
        flex: 1,
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        alignItems: 'center',
    },
    photoBtnText: { color: colors.text, fontSize: fonts.md },
    previewContainer: { marginTop: spacing.md, position: 'relative' },
    preview: { width: '100%', height: 200, borderRadius: radius.md },
    removePhoto: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removePhotoText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    submitBtn: {
        backgroundColor: colors.accentRed,
        borderRadius: radius.md,
        padding: spacing.lg,
        alignItems: 'center',
        marginTop: spacing.xl,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: fonts.lg, fontWeight: '700' },
});
