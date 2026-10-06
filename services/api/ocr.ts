import { apiClient } from './client';

/**
 * Reads the text in a photo (visiting card, letterhead, machine label).
 * The photo goes to our backend, which calls ocr.space with the company key —
 * the key is never in the app.
 */
export async function scanTextFromImage(imageBase64: string): Promise<string> {
    const res = await apiClient.post<{ data: { text: string } }>('/ocr', { imageBase64 });
    return res.data.text;
}
