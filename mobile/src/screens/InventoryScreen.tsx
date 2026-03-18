import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { inventoryApi, type InventoryItem } from '../api';
import { colors, spacing, fonts, radius } from '../theme';

export default function InventoryScreen() {
    const { token } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustReason, setAdjustReason] = useState('');

    const loadItems = useCallback(async () => {
        if (!token) return;
        try {
            const data = await inventoryApi.list(token);
            setItems(data.items);
        } catch {
            // offline — use cached data in the future
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => { loadItems(); }, [loadItems]);

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        loadItems();
    }, [loadItems]);

    const handleAdjust = async (delta: number) => {
        if (!token || !adjustItem) return;
        try {
            await inventoryApi.adjustQuantity(
                token, adjustItem.id, delta,
                adjustReason.trim() || undefined,
            );
            setAdjustItem(null);
            setAdjustQty('');
            setAdjustReason('');
            loadItems();
        } catch (err: any) {
            Alert.alert('Błąd', err.message);
        }
    };

    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase())
    );

    const isLow = (item: InventoryItem) => item.quantity <= item.min_quantity;

    return (
        <View style={styles.container}>
            {/* Search */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="🔍 Szukaj w magazynie..."
                    placeholderTextColor={colors.textDim}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            <FlatList
                data={filtered}
                keyExtractor={i => String(i.id)}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.itemCard, isLow(item) && styles.itemLow]}
                        onPress={() => { setAdjustItem(item); setAdjustQty(''); setAdjustReason(''); }}
                        activeOpacity={0.7}
                    >
                        <View style={styles.itemLeft}>
                            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.itemCategory}>{item.category}</Text>
                        </View>
                        <View style={styles.itemRight}>
                            <Text style={[styles.itemQty, isLow(item) && styles.itemQtyLow]}>
                                {item.quantity} {item.unit}
                            </Text>
                            {isLow(item) && (
                                <Text style={styles.lowBadge}>⚠️ Niski stan</Text>
                            )}
                        </View>
                    </TouchableOpacity>
                )}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>
                            {isLoading ? '⏳ Ładowanie...' : '📦 Brak pozycji magazynowych'}
                        </Text>
                    </View>
                }
            />

            {/* Adjust quantity modal */}
            <Modal
                visible={!!adjustItem}
                transparent
                animationType="slide"
                onRequestClose={() => setAdjustItem(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{adjustItem?.name}</Text>
                        <Text style={styles.modalSubtitle}>
                            Aktualnie: {adjustItem?.quantity} {adjustItem?.unit}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Ilość (+/- np. 5 lub -3)"
                            placeholderTextColor={colors.textDim}
                            value={adjustQty}
                            onChangeText={setAdjustQty}
                            keyboardType="numeric"
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Powód (opcjonalnie)"
                            placeholderTextColor={colors.textDim}
                            value={adjustReason}
                            onChangeText={setAdjustReason}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.cancelBtn}
                                onPress={() => setAdjustItem(null)}
                            >
                                <Text style={styles.cancelBtnText}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.removeBtn}
                                onPress={() => {
                                    const qty = parseInt(adjustQty);
                                    if (!isNaN(qty) && qty > 0) handleAdjust(-qty);
                                    else Alert.alert('Błąd', 'Wpisz poprawną liczbę');
                                }}
                            >
                                <Text style={styles.removeBtnText}>− Wydaj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.addBtn}
                                onPress={() => {
                                    const qty = parseInt(adjustQty);
                                    if (!isNaN(qty) && qty > 0) handleAdjust(qty);
                                    else Alert.alert('Błąd', 'Wpisz poprawną liczbę');
                                }}
                            >
                                <Text style={styles.addBtnText}>+ Przyjmij</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    searchContainer: { padding: spacing.md },
    searchInput: {
        backgroundColor: colors.bgInput,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        fontSize: fonts.md,
        color: colors.text,
    },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
    itemCard: {
        backgroundColor: colors.bgCard,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemLow: { borderColor: colors.accentRed + '66' },
    itemLeft: { flex: 1 },
    itemName: { fontSize: fonts.md, fontWeight: '600', color: colors.text },
    itemCategory: { fontSize: fonts.sm, color: colors.textMuted, marginTop: 2 },
    itemRight: { alignItems: 'flex-end' },
    itemQty: { fontSize: fonts.lg, fontWeight: '700', color: colors.text },
    itemQtyLow: { color: colors.accentRed },
    lowBadge: { fontSize: 10, color: colors.accentRed, marginTop: 2 },
    empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2 },
    emptyText: { fontSize: fonts.lg, color: colors.textMuted },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.bgCard,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: spacing.xl,
    },
    modalTitle: { fontSize: fonts.xl, fontWeight: '700', color: colors.text },
    modalSubtitle: { fontSize: fonts.md, color: colors.textMuted, marginBottom: spacing.lg },
    input: {
        backgroundColor: colors.bgInput,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        fontSize: fonts.md,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    modalButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    cancelBtn: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    cancelBtnText: { color: colors.textMuted },
    removeBtn: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.accentRed,
        alignItems: 'center',
    },
    removeBtnText: { color: '#fff', fontWeight: '600' },
    addBtn: {
        flex: 1,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.accentGreen,
        alignItems: 'center',
    },
    addBtnText: { color: '#fff', fontWeight: '600' },
});
