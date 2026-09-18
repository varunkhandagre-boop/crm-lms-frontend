import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Shared convention for useCachedList's AsyncStorage keys.
//
// MULTI-TENANT SAFETY: every cache key below is namespaced by companyId, and
// clearAllListCaches() is called from DataContext's logout(). This matters
// because AsyncStorage is per-device, not per-session — without both of
// these, a second company logging into the same phone (a shared field
// device, or a tester switching between test accounts) could briefly see
// the previous company's cached list on screen before the network refresh
// replaces it. Scoping the key by companyId, plus wiping on logout, closes
// that gap. Any new screen adopting useCachedList should build its key with
// buildCacheKey() rather than hand-rolling one.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'listCache:';

/** e.g. buildCacheKey('leads', companyId) -> "listCache:leads:<companyId>" */
export function buildCacheKey(screen: string, companyId: string | null | undefined): string | null {
  if (!companyId) return null;
  return `${CACHE_PREFIX}${screen}:${companyId}`;
}

/** Call on logout. Removes every screen's cached list for every company
 *  that was ever cached on this device — cheap, and avoids needing to track
 *  a separate index of keys in use. */
export async function clearAllListCaches(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (e) {
    // Best-effort — a failed cache wipe shouldn't block logout itself.
    console.log('clearAllListCaches failed:', e);
  }
}
