import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { readFileBase64 } from './readFileBase64';

// Photos are shrunk on the phone before upload: ~1024 px on the long side,
// JPEG ~60 % → usually 100–180 KB instead of 3–5 MB from the camera. Bills and
// labels stay readable; this keeps Supabase Storage (1 GB on the free plan) lasting.
const LONG_SIDE = 1024;
const TARGET_BYTES = 180 * 1024;
const MAX_PDF_BYTES = 2 * 1024 * 1024;

export interface PickedPhoto {
    uri: string;
    width?: number;
    height?: number;
}

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

export async function compressPhoto(photo: PickedPhoto): Promise<{ dataUri: string; previewUri: string; kb: number }> {
    const ctx = ImageManipulator.manipulate(photo.uri);
    const w = photo.width || 0;
    const h = photo.height || 0;
    if (w > LONG_SIDE || h > LONG_SIDE || !w || !h) {
        // Unknown size (some gallery picks): bound the width; a portrait shot
        // then ends a little over 1024 px tall, which is fine.
        ctx.resize(w >= h ? { width: LONG_SIDE } : { height: LONG_SIDE });
    }
    const image = await ctx.renderAsync();

    let saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) > TARGET_BYTES) {
        saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.45, base64: true });
    }
    if (!saved.base64) throw new Error('Could not read the photo');
    return {
        dataUri: `data:image/jpeg;base64,${saved.base64}`,
        previewUri: saved.uri,
        kb: Math.round(base64Bytes(saved.base64) / 1024),
    };
}

// PDFs can't be compressed here — they go up as is, max 2 MB.
export async function pdfToDataUri(uri: string): Promise<string> {
    const b64 = await readFileBase64(uri);
    if (base64Bytes(b64) > MAX_PDF_BYTES) {
        throw new Error('This PDF is larger than 2 MB. Please take a photo of the PO instead.');
    }
    return `data:application/pdf;base64,${b64}`;
}

// Only real uploads can be shown — older records may hold a phone's local
// file path that no other device can open.
export const isUploadedFile = (url?: string | null): url is string => !!url && /^https?:\/\//i.test(url);
export const isPdfUrl = (url?: string | null) => !!url && /\.pdf(\?|$)/i.test(url);
