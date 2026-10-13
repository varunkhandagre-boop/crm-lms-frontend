import * as FileSystem from 'expo-file-system/legacy';

// Reads a picked file (DocumentPicker / ImagePicker URI) as base64.
// Expo Go keeps picked files outside the app's own folder, so expo-file-system
// refuses them ("… isn't readable"); React Native's fetch has no such rule,
// so it is the fallback. Real builds normally succeed on the first try.
export async function readFileBase64(uri: string): Promise<string> {
    try {
        return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (fsError) {
        try {
            const blob = await (await fetch(uri)).blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
                reader.readAsDataURL(blob);
            });
            const comma = dataUrl.indexOf(',');
            if (comma === -1) throw new Error('Could not read the file');
            return dataUrl.slice(comma + 1);
        } catch {
            throw fsError;
        }
    }
}
