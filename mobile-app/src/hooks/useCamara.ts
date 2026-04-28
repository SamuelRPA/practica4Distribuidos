// Hook que envuelve expo-image-picker.
// Pide permisos al usuario y devuelve la URI del archivo capturado.
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert } from 'react-native';

export function useCamara() {
    const [cargando, setCargando] = useState(false);

    async function pedirPermisoCamara(): Promise<boolean> {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
                'Permiso de cámara',
                'Necesitamos acceso a la cámara para fotografiar las actas. Activa el permiso en Configuración.',
            );
            return false;
        }
        return true;
    }

    async function pedirPermisoGaleria(): Promise<boolean> {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso de galería', 'No se pudo acceder a tus fotos.');
            return false;
        }
        return true;
    }

    async function tomarFoto(): Promise<ImagePicker.ImagePickerAsset | null> {
        if (!(await pedirPermisoCamara())) return null;
        setCargando(true);
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [3, 4],
                quality: 0.85, // balance calidad / tamaño para subir más rápido
                exif: false,
            });
            if (result.canceled || !result.assets?.[0]) return null;
            return result.assets[0];
        } finally {
            setCargando(false);
        }
    }

    async function elegirDeGaleria(): Promise<ImagePicker.ImagePickerAsset | null> {
        if (!(await pedirPermisoGaleria())) return null;
        setCargando(true);
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [3, 4],
                quality: 0.85,
            });
            if (result.canceled || !result.assets?.[0]) return null;
            return result.assets[0];
        } finally {
            setCargando(false);
        }
    }

    return { tomarFoto, elegirDeGaleria, cargando };
}
