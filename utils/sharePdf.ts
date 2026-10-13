import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// Builds a PDF from HTML and opens the share sheet.
// expo-print saves into its own cache folder, which Expo Go (SDK 57) won't let
// FileSystem or Sharing read ("isn't readable" / "Not allowed to read file").
// Asking expo-print for the bytes (base64) and writing them into our own cache
// folder works in Expo Go and in real builds alike, and gives a readable name.
export async function sharePdfFromHtml(
  html: string,
  fileName: string,
  dialogTitle?: string,
  pageSize?: { width?: number; height?: number },
): Promise<void> {
  // Web: expo-print ignores `html` on web and prints the current screen, so
  // print the PDF's own HTML from a hidden frame instead ("Save as PDF" there).
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html, fileName);
    return;
  }
  const { uri, base64 } = await Print.printToFileAsync({ html, base64: true, ...pageSize });
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

// Prints the given HTML document (not the app screen) in the browser.
function printHtmlOnWeb(html: string, fileName: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    const doc = win?.document;
    if (!win || !doc) { frame.remove(); resolve(); return; }
    doc.open();
    doc.write(html);
    doc.close();

    // Chrome's "Save as PDF" suggests the page title as the file name.
    const oldTitle = document.title;
    const title = fileName.replace(/\.pdf$/i, '');
    document.title = title;
    doc.title = title;

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      document.title = oldTitle;
      setTimeout(() => frame.remove(), 500);
      resolve();
    };

    // Wait for the logo / signature / QR images, at most 4 s.
    const images = Array.from(doc.images || []);
    const loaded = images.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => {
      img.addEventListener('load', () => r(), { once: true });
      img.addEventListener('error', () => r(), { once: true });
    })));
    const timeout = new Promise<void>((r) => setTimeout(r, 4000));
    Promise.race([Promise.all(loaded), timeout]).then(() => {
      win.addEventListener('afterprint', cleanup, { once: true });
      win.focus();
      win.print();
      // Some browsers never fire afterprint for frames; print() blocks until the dialog closes anyway.
      setTimeout(cleanup, 1000);
    });
  });
}
