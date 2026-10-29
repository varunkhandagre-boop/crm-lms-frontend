import { Platform } from 'react-native';

// Web only: browsers draw a thick black focus ring around text boxes, on top
// of the app's own box border (looked broken in the search pickers).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = 'input:focus, textarea:focus { outline: none; }';
    document.head.appendChild(style);
}
