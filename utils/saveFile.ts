import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

type SaveFileOptions = {
    /** Text (CSV) or base64 (xlsx, images) — set `base64: true` for the latter. */
    content: string;
    fileName: string;
    mimeType: string;
    base64?: boolean;
    dialogTitle?: string;
    UTI?: string;
};

/**
 * Phone: writes the file to the cache folder and opens the share sheet.
 * Web: the browser downloads the file (expo-file-system / expo-sharing do not work there).
 */
export async function saveAndShareFile({ content, fileName, mimeType, base64, dialogTitle, UTI }: SaveFileOptions): Promise<void> {
    if (Platform.OS === 'web') {
        downloadInBrowser(content, fileName, mimeType, base64);
        return;
    }
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: base64 ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI });
    } else {
        Alert.alert('Error', 'Sharing is not supported on this device.');
    }
}

function downloadInBrowser(content: string, fileName: string, mimeType: string, base64?: boolean) {
    let blob: Blob;
    if (base64) {
        const bin = atob(content);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: mimeType });
    } else {
        // BOM so Excel opens UTF-8 CSV (₹, Hindi names) correctly.
        blob = new Blob([mimeType === 'text/csv' && !content.startsWith('﻿') ? '﻿' + content : content], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
