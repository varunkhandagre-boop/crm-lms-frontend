import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { readFileBase64 } from './readFileBase64';

// Photos are shrunk on the phone before upload: ~1024 px on the long side.
// Phones save WebP (about a third smaller than JPEG at the same quality);
// the web app saves JPEG, which every browser can encode. Usually 60–120 KB
// instead of 3–5 MB from the camera — bills and labels stay readable, and
// Supabase Storage (1 GB on the free plan) lasts much longer.
const LONG_SIDE = 1024;
const TARGET_BYTES = 120 * 1024;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const USE_WEBP = Platform.OS !== 'web';
const FORMAT = USE_WEBP ? SaveFormat.WEBP : SaveFormat.JPEG;
const MIME = USE_WEBP ? 'image/webp' : 'image/jpeg';

export interface PickedPhoto {
    uri: string;
    width?: number;
    height?: number;
}

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

async function shrink(photo: PickedPhoto, longSide: number) {
    const ctx = ImageManipulator.manipulate(photo.uri);
    const w = photo.width || 0;
    const h = photo.height || 0;
    if (w > longSide || h > longSide || !w || !h) {
        // Unknown size (some gallery picks): bound the width; a portrait shot
        // then ends a little over the limit, which is fine.
        ctx.resize(w >= h ? { width: longSide } : { height: longSide });
    }
    return ctx.renderAsync();
}

export async function compressPhoto(photo: PickedPhoto): Promise<{ dataUri: string; previewUri: string; kb: number }> {
    const image = await shrink(photo, LONG_SIDE);
    let saved = await image.saveAsync({ format: FORMAT, compress: 0.6, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) > TARGET_BYTES) {
        saved = await image.saveAsync({ format: FORMAT, compress: 0.45, base64: true });
    }
    if (!saved.base64) throw new Error('Could not read the photo');
    return {
        dataUri: `data:${MIME};base64,${saved.base64}`,
        previewUri: saved.uri,
        kb: Math.round(base64Bytes(saved.base64) / 1024),
    };
}

// Label / card photos for text reading: bigger (1600 px) and JPEG so small
// print like serial numbers stays sharp; kept under ~900 KB for the OCR service.
export async function compressForOcr(photo: PickedPhoto): Promise<string> {
    const image = await shrink(photo, 1600);
    let saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) > 900 * 1024) {
        saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.5, base64: true });
    }
    if (!saved.base64) throw new Error('Could not read the photo');
    return saved.base64;
}

// Profile photo, logo, signature: kept small (they are stored with the record
// and printed on PDFs). JPEG, because every PDF viewer shows it.
export async function compressSmallImage(photo: PickedPhoto, longSide = 512): Promise<string> {
    const image = await shrink(photo, longSide);
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    if (!saved.base64) throw new Error('Could not read the photo');
    return `data:image/jpeg;base64,${saved.base64}`;
}

// Old records may still have a PDF. New uploads are photos only.
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
