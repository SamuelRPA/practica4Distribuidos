import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme';

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <StatusBar style="light" />
            <View style={StyleSheet.absoluteFillObject}>
                <LinearGradient
                    colors={[colors.bgDeep, colors.bgMid]}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            </View>
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: 'transparent' },
                    headerTintColor: colors.textPrimary,
                    headerShadowVisible: false,
                    headerTransparent: true,
                    contentStyle: { backgroundColor: 'transparent' },
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="captura" options={{ title: 'Capturar acta' }} />
                <Stack.Screen name="historial" options={{ title: 'Historial' }} />
                <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
            </Stack>
        </SafeAreaProvider>
    );
}
