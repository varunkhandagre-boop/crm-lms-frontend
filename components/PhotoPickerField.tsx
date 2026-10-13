import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { compressPhoto } from '../utils/attachments';

export interface PendingPhoto {
    uri: string;      // compressed preview on the phone
    dataUri: string;  // ready to upload after the record is saved
    kb: number;
}

interface Props {
    value: PendingPhoto | null;
    onChange: (photo: PendingPhoto | null) => void;
    onBusyChange?: (busy: boolean) => void;
    buttonLabel?: string;
}

// Form photo: camera or gallery → compressed on the phone. The screen uploads
// `value.dataUri` right after it creates the record.
export default function PhotoPickerField({ value, onChange, onBusyChange, buttonLabel = 'Take Photo' }: Props) {
    const [busy, setBusyState] = useState(false);
    const setBusy = (b: boolean) => { setBusyState(b); onBusyChange?.(b); };

    const pick = async (fromCamera: boolean) => {
        const perm = fromCamera
            ? await ImagePicker.requestCameraPermissionsAsync()
            : Platform.OS === 'ios' ? await ImagePicker.requestMediaLibraryPermissionsAsync() : { status: 'granted' };
        if (perm.status !== 'granted') return Alert.alert('Permission Denied');
        const result = fromCamera
            ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled) return;
        setBusy(true);
        try {
            const photo = await compressPhoto(result.assets[0]);
            onChange({ uri: photo.previewUri, dataUri: photo.dataUri, kb: photo.kb });
        } catch {
            Alert.alert('Photo', 'Could not prepare this photo. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const chooseSource = () => {
        Alert.alert('Photo', 'Choose source', [
            { text: 'Camera', onPress: () => pick(true) },
            { text: 'Gallery', onPress: () => pick(false) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    if (busy) {
        return (
            <View style={styles.button}>
                <ActivityIndicator color="#3b5998" />
                <Text style={styles.buttonText}>Preparing photo...</Text>
            </View>
        );
    }
    if (!value) {
        return (
            <TouchableOpacity style={styles.button} onPress={chooseSource}>
                <Ionicons name="camera" size={22} color="#3b5998" />
                <Text style={styles.buttonText}>{buttonLabel}</Text>
            </TouchableOpacity>
        );
    }
    return (
        <View>
            <Image source={{ uri: value.uri }} style={styles.preview} />
            <View style={styles.row}>
                <Text style={styles.hint}>{value.kb} KB • uploads when you save</Text>
                <TouchableOpacity onPress={chooseSource} style={styles.link}>
                    <Ionicons name="swap-horizontal" size={16} color="#3b5998" />
                    <Text style={[styles.linkText, { color: '#3b5998' }]}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onChange(null)} style={styles.link}>
                    <Ionicons name="trash-outline" size={16} color="#d32f2f" />
                    <Text style={[styles.linkText, { color: '#d32f2f' }]}>Remove</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#90caf9', borderStyle: 'dashed' },
    buttonText: { marginLeft: 8, color: '#3b5998', fontWeight: 'bold' },
    preview: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#eee' },
    row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    hint: { flex: 1, fontSize: 11, color: 'gray' },
    link: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 },
    linkText: { marginLeft: 3, fontSize: 12, fontWeight: 'bold' },
});
