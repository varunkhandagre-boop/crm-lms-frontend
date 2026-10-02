// @react-native-community/datetimepicker v9 (Expo SDK 57) deprecated `onChange`
// in favour of `onValueChange` + `onDismiss`. Our screens' handlers were all
// written for the old (event, date?) callback, so this adapts them unchanged:
// a picked date arrives as before, and a cancel arrives as (dismissed, undefined).
// Usage: <DateTimePicker value={d} {...pickerHandlers(onDateChange)} />
type LegacyOnChange = (event: any, date?: Date) => void;

export function pickerHandlers(onChange: LegacyOnChange) {
  return {
    onValueChange: (event: any, date: Date) => onChange({ ...event, type: 'set' }, date),
    onDismiss: () => onChange({ type: 'dismissed', nativeEvent: {} }, undefined),
  };
}
