import { Platform } from 'react-native';

// Full-screen pick lists (organisation, product, receiver…) on a phone stay a
// full page. In a browser they open as a centred popup card over a dimmed
// page — the same look as the pickers in Add Order.
const isWeb = Platform.OS === 'web';

export const pickerModalProps = isWeb ? { transparent: true } : {};

export const pickerCardStyle: any = isWeb
    ? {
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
          marginVertical: 32,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
      }
    : {};
