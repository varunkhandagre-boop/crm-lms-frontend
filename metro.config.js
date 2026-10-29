const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// The date/time picker package draws nothing on the web; use our browser
// version there (phones keep the real one).
const webDatePicker = path.resolve(__dirname, 'components/WebDateTimePicker.tsx');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@react-native-community/datetimepicker') {
    return { type: 'sourceFile', filePath: webDatePicker };
  }
  return (defaultResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
