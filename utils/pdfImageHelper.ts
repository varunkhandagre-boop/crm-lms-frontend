import * as FileSystem from 'expo-file-system/legacy';

/**
 * Downloads a remote image (Supabase Storage logo/signature URL, etc.) and
 * converts it to a base64 data-URI. expo-print's PDF rendering doesn't
 * reliably load remote <img src="https://..."> URLs (no network wait, so
 * the image is often just missing from the generated PDF) — embedding the
 * image directly as base64 sidesteps that entirely.
 *
 * Returns null (never throws) on any failure — callers should fall back to
 * a text-only header in that case, same as when there's simply no logo set.
 */
export async function urlToBase64Image(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  // Already a data-URI (e.g. a legacy base64 value that was never migrated
  // to Storage) — nothing to convert.
  if (url.startsWith('data:')) return url;

  try {
    const extMatch = url.split('?')[0].match(/\.(\w+)$/);
    const ext = (extMatch?.[1] || 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';

    const localPath = `${(FileSystem as any).cacheDirectory}pdf_img_${Date.now()}.${ext}`;
    const { uri } = await FileSystem.downloadAsync(url, localPath);
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.log('urlToBase64Image failed, PDF will fall back to text header:', e);
    return null;
  }
}
