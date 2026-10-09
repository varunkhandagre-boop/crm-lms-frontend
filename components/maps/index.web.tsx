import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Web build: a plain box instead of the map. Lists next to the map still work
// (and their "open in Google Maps" long-press opens a browser tab).
const MapView = forwardRef<any, any>(function MapView({ style }, ref) {
    useImperativeHandle(ref, () => ({ fitToCoordinates: () => {}, animateToRegion: () => {} }), []);
    return (
        <View style={[style, styles.box]}>
            <Text style={styles.text}>The map is shown in the phone app. Use the list below.</Text>
        </View>
    );
});

export default MapView;
export const Marker = (_: any) => null;
export const Polyline = (_: any) => null;
export const PROVIDER_GOOGLE = undefined;

const styles = StyleSheet.create({
    box: { backgroundColor: '#eef1f5', alignItems: 'center', justifyContent: 'center', padding: 16 },
    text: { color: '#607d8b', fontSize: 13, textAlign: 'center' },
});
