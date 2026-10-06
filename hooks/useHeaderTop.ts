import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Top padding for a screen header: this phone's real status-bar height + a small gap.
 * Replaces the old fixed `paddingTop: 50`, which was too much on some phones and too
 * little on others. Where the app is not drawn under the status bar the inset is 0,
 * so the header just gets the gap.
 *
 * Usage: `<View style={[styles.header, { paddingTop: headerTop }]}>`
 * (don't put paddingTop in the StyleSheet header style).
 */
export function useHeaderTop(gap = 10): number {
    return useSafeAreaInsets().top + gap;
}
