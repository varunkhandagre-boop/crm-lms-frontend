import { Platform, useWindowDimensions } from 'react-native';

/** Web on a laptop / desktop screen (≥ 1024 px wide). Always false in the phone app. */
export function useIsDesktop(): boolean {
    const { width } = useWindowDimensions();
    return Platform.OS === 'web' && width >= 1024;
}
