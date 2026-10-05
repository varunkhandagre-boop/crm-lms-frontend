import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { compressPhoto, isUploadedFile } from '../utils/attachments';

interface Props {
    title: string;
    url?: string | null;
    canEdit: boolean;
    onUpload: (dataUri: string) => Promise<void>;
    onDelete: () => Promise<void>;
    addLabel?: string;
}

// Details-screen photo of a saved record: view (tap = full size), and for
// people allowed to edit: Add / Replace / Delete — each saved immediately.
export default function RecordPhotoSection({ title, url, canEdit, onUpload, onDelete, addLabel = 'Add Photo' }: Props) {
    const [busy, setBusy] = useState(false);
    const shown = isUploadedFile(url) ? url : null;

    if (!shown && !canEdit) return null;

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
            await onUpload(photo.dataUri);
        } catch (e: any) {
            Alert.alert('Upload failed', e?.message || 'Could not upload the photo. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const chooseSource = () => {
        Alert.alert(title, 'Choose source', [
            { text: 'Camera', onPress: () => pick(true) },
            { text: 'Gallery', onPress: () => pick(false) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const confirmDelete = () => {
        Alert.alert('Delete photo?', 'The photo will be removed from this record and from storage.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    setBusy(true);
                    try {
                        await onDelete();
                    } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Could not delete the photo.');
                    } finally {
                        setBusy(false);
                    }
                }
            },
        ]);
    };

    return (
        <View style={{ marginTop: 12 }}>
            <Text style={styles.title}>{title}</Text>
            {busy ? (
                <View style={styles.button}>
                    <ActivityIndicator color="#3b5998" />
                    <Text style={styles.buttonText}>Please wait...</Text>
                </View>
            ) : shown ? (
                <>
                    <TouchableOpacity onPress={() => Linking.openURL(shown)}>
                        <Image source={{ uri: shown }} style={styles.image} />
                    </TouchableOpacity>
                    {canEdit && (
                        <View style={{ flexDirection: 'row', marginTop: 8 }}>
                            <TouchableOpacity style={[styles.button, { flex: 1, marginRight: 5 }]} onPress={chooseSource}>
                                <Ionicons name="swap-horizontal" size={18} color="#3b5998" />
                                <Text style={styles.buttonText}>Replace</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, styles.danger, { flex: 1, marginLeft: 5 }]} onPress={confirmDelete}>
                                <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                                <Text style={[styles.buttonText, { color: '#d32f2f' }]}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </>
            ) : (
                <TouchableOpacity style={styles.button} onPress={chooseSource}>
                    <Ionicons name="camera-outline" size={18} color="#3b5998" />
                    <Text style={styles.buttonText}>{addLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 6, textTransform: 'uppercase' },
    image: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#eee', resizeMode: 'cover' },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#90caf9' },
    danger: { backgroundColor: '#ffebee', borderColor: '#ef9a9a' },
    buttonText: { marginLeft: 6, color: '#3b5998', fontWeight: 'bold' },
});
