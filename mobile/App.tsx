import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from './src/AuthContext';
import { colors } from './src/theme';
import { setupNotifications } from './src/notifications';
import { startConnectionMonitor, stopConnectionMonitor } from './src/sync/serverDiscovery';

// Screens — Worker
import LoginScreen from './src/screens/LoginScreen';
import TasksScreen from './src/screens/TasksScreen';
import TaskDetailScreen from './src/screens/TaskDetailScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AiChatScreen from './src/screens/AiChatScreen';
import ReportProblemScreen from './src/screens/ReportProblemScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

// Screens — Admin
import AdminDashScreen from './src/screens/AdminDashScreen';
import AdminTasksScreen from './src/screens/AdminTasksScreen';

// Navigation
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
    headerStyle: { backgroundColor: colors.bgCard },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700' as const },
};

// Dark maritime theme
const DarkTheme = {
    ...DefaultTheme,
    dark: true,
    colors: {
        ...DefaultTheme.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.bgCard,
        text: colors.text,
        border: colors.border,
        notification: colors.accentRed,
    },
};

// ====== Worker Stacks ======

function WorkerTasksStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="TasksList" component={TasksScreen} options={{ title: 'Moje zadania' }} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Szczegóły' }} />
            <Stack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ title: 'Zgłoś problem' }} />
        </Stack.Navigator>
    );
}

// ====== Admin Stacks ======

function AdminDashStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="AdminDashHome" component={AdminDashScreen} options={{ title: 'Panel admina' }} />
            <Stack.Screen name="AdminTasks" component={AdminTasksScreen} options={{ title: 'Zadania' }} />
            <Stack.Screen name="AdminTaskDetail" component={TaskDetailScreen} options={{ title: 'Szczegóły' }} />
        </Stack.Navigator>
    );
}

// ====== Tab config ======

const tabBarStyle = {
    backgroundColor: colors.bgCard,
    borderTopColor: colors.border,
    height: 60,
    paddingBottom: 8,
};

const tabBarOptions = {
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textDim,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
    tabBarStyle,
};

// Worker bottom tabs
function WorkerTabs() {
    return (
        <Tab.Navigator screenOptions={tabBarOptions}>
            <Tab.Screen name="Zadania" component={WorkerTasksStack}
                options={{
                    headerShown: false,
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📋</Text>,
                }}
            />
            <Tab.Screen name="AI Czat" component={AiChatScreen}
                options={{
                    headerShown: false,
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🤖</Text>,
                }}
            />
            <Tab.Screen name="Magazyn" component={InventoryScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📦</Text>,
                    ...screenOptions,
                }}
            />
            <Tab.Screen name="Alerty" component={NotificationsScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🔔</Text>,
                    ...screenOptions,
                }}
            />
            <Tab.Screen name="Profil" component={SettingsScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>⚙️</Text>,
                    ...screenOptions,
                }}
            />
        </Tab.Navigator>
    );
}

// Admin bottom tabs
function AdminTabs() {
    return (
        <Tab.Navigator screenOptions={tabBarOptions}>
            <Tab.Screen name="Dashboard" component={AdminDashStack}
                options={{
                    headerShown: false,
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📊</Text>,
                }}
            />
            <Tab.Screen name="AI Czat" component={AiChatScreen}
                options={{
                    headerShown: false,
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🤖</Text>,
                }}
            />
            <Tab.Screen name="Magazyn" component={InventoryScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📦</Text>,
                    ...screenOptions,
                }}
            />
            <Tab.Screen name="Alerty" component={NotificationsScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🔔</Text>,
                    ...screenOptions,
                }}
            />
            <Tab.Screen name="Profil" component={SettingsScreen}
                options={{
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>⚙️</Text>,
                    ...screenOptions,
                }}
            />
        </Tab.Navigator>
    );
}

// ====== Root ======

function RootNavigator() {
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (user) {
            setupNotifications();
            startConnectionMonitor(30000); // Check every 30s
        }
        return () => stopConnectionMonitor();
    }, [user]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {user ? (
                user.role === 'admin' ? (
                    <Stack.Screen name="AdminMain" component={AdminTabs} />
                ) : (
                    <Stack.Screen name="WorkerMain" component={WorkerTabs} />
                )
            ) : (
                <Stack.Screen name="Login" component={LoginScreen} />
            )}
        </Stack.Navigator>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <NavigationContainer theme={DarkTheme}>
                <StatusBar style="light" />
                <RootNavigator />
            </NavigationContainer>
        </AuthProvider>
    );
}
