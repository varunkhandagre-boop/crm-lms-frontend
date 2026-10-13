import { Alert, AlertButton, Platform } from 'react-native';

/**
 * React Native Web's Alert.alert does nothing, so on the web build every
 * message and Yes / No question would silently disappear. Replace it with the
 * browser's own alert / confirm boxes (imported once from app/_layout.tsx).
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
    Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
        const text = [title, message].filter(Boolean).join('\n\n');
        if (!buttons || buttons.length <= 1) {
            window.alert(text);
            buttons?.[0]?.onPress?.();
            return;
        }
        const cancel = buttons.find((b) => b.style === 'cancel');
        const actions = buttons.filter((b) => b !== cancel);
        if (actions.length === 1) {
            if (window.confirm(text)) actions[0].onPress?.();
            else cancel?.onPress?.();
            return;
        }
        // Three or more choices: offer them one by one.
        for (const b of actions) {
            if (window.confirm(`${text}\n\n${b.text}?`)) {
                b.onPress?.();
                return;
            }
        }
        cancel?.onPress?.();
    };
}
