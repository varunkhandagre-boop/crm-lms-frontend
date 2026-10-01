import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Builds a PDF from HTML and opens the share sheet.
// expo-print saves into its own cache folder, which Expo Go (SDK 57) won't let
// FileSystem or Sharing read ("isn't readable" / "Not allowed to read file").
// Asking expo-print for the bytes (base64) and writing them into our own cache
// folder works in Expo Go and in real builds alike, and gives a readable name.
export async function sharePdfFromHtml(
  html: string,
  fileName: string,
  dialogTitle?: string,
): Promise<void> {
  const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });
  const safeName = fileName.replace(/[^\w.-]+/g, '_').replace(/\.pdf$/i, '') + '.pdf';
  const target = `${FileSystem.cacheDirectory}${safeName}`;
  try {
    if (!base64) throw new Error('expo-print returned no base64 data');
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(target, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle });
  } catch (writeError) {
    console.log('PDF write failed, sharing original file:', writeError);
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle });
  }
}
