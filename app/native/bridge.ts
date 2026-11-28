// The web app's door to the Android / iOS app shell (mobile/). In a browser every function here quietly does the
// browser's own version of the job (or nothing), so the same screens work everywhere.
//
// The shell loads this website inside a native container. The container injects `window.Capacitor`, and each native
// plugin is reached with `Capacitor.registerPlugin(name)`; no plugin package is bundled into the website.
// Which plugins exist is decided by mobile/package.json; a missing plugin simply makes the function return null.

type PluginProxy = Record<string, (...args: unknown[]) => Promise<unknown>>;
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => unknown;
};

export type NativePlatform = 'android' | 'ios';
export type Fix = {lat: number; lng: number; accuracyM: number};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as {Capacitor?: CapacitorGlobal}).Capacitor ?? null;
}

/** 'android' or 'ios' inside the app, null in a browser. */
export function nativePlatform(): NativePlatform | null {
  const cap = capacitor();
  if (!cap?.isNativePlatform?.()) return null;
  const platform = cap.getPlatform?.();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

/** The version the app announces in its user-agent ("KhotwaApp/1.2.0 (android)"), or '' in a browser. */
export function appVersion(): string {
  if (typeof navigator === 'undefined') return '';
  return /KhotwaApp\/(\d{1,3}(?:\.\d{1,3}){1,3}) \((?:android|ios)\)/.exec(navigator.userAgent)?.[1] ?? '';
}

const proxies = new Map<string, PluginProxy | null>();

/** A native plugin by name, or null when this is a browser or the app does not include it. */
export function plugin(name: string): PluginProxy | null {
  if (!nativePlatform()) return null;
  if (proxies.has(name)) return proxies.get(name) ?? null;
  let found: PluginProxy | null = null;
  try {
    found = (capacitor()?.registerPlugin?.(name) as PluginProxy | undefined) ?? null;
  } catch {
    found = null;
  }
  proxies.set(name, found);
  return found;
}

type BackgroundLocation = {latitude: number; longitude: number; accuracy: number; time?: number | null};

/**
 * Follow the phone's position and call `onFix` with each reading. Inside the app the position keeps arriving while the
 * app is in the background (a standing notification is shown by the operating system while it does); in a browser it
 * arrives only while the page is open. Nothing here stores or sends a position: the caller decides what to do with it.
 * Returns a function that stops following, or null when the position cannot be followed at all (no permission, no GPS).
 */
export async function watchPosition(
  onFix: (fix: Fix) => void,
  options: {backgroundTitle: string; backgroundMessage: string; onDenied?: () => void},
): Promise<(() => void) | null> {
  const background = plugin('BackgroundGeolocation');
  if (background) {
    try {
      const id = (await background.addWatcher(
        {requestPermissions: true, stale: false, distanceFilter: 25, backgroundTitle: options.backgroundTitle, backgroundMessage: options.backgroundMessage},
        (location?: BackgroundLocation, error?: {code?: string}) => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') options.onDenied?.();
            return;
          }
          if (location) onFix({lat: location.latitude, lng: location.longitude, accuracyM: location.accuracy});
        },
      )) as string;
      return () => {
        void background.removeWatcher({id});
      };
    } catch {
      // fall through to the browser's own geolocation
    }
  }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
  const handle = navigator.geolocation.watchPosition(
    (position) => onFix({lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy}),
    (error) => {
      if (error.code === error.PERMISSION_DENIED) options.onDenied?.();
    },
    {enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000},
  );
  return () => navigator.geolocation.clearWatch(handle);
}

// ---- the phone's own state (for diagnostics) -----------------------------------------------------------------------

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';
export type DeviceSnapshot = {
  osVersion: string;
  deviceModel: string;
  location: PermissionState;
  backgroundLocation: PermissionState;
  notifications: PermissionState;
  camera: PermissionState;
  batterySaver: 'on' | 'off' | 'unknown';
};

const toState = (value: unknown): PermissionState => (value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : value === 'prompt' || value === 'prompt-with-rationale' ? 'prompt' : 'unknown');

/** A native plugin's own answer to "may I?", or null when the plugin is not in the app. */
async function nativeState(name: string, key: string): Promise<PermissionState | null> {
  const found = plugin(name);
  if (!found || typeof found.checkPermissions !== 'function') return null;
  try {
    return toState(((await found.checkPermissions()) as Record<string, unknown> | undefined)?.[key]);
  } catch {
    return null;
  }
}

async function browserState(name: string): Promise<PermissionState> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
    return toState((await navigator.permissions.query({name: name as PermissionName})).state);
  } catch {
    return 'unsupported';
  }
}

/**
 * Whether the phone allows what the account needs, and which phone it is. No position is read, no photo is taken, and
 * nothing identifies the device: only the permission answers, the system version and the model name.
 * Background location and the battery saver are not readable from the web view, so they stay 'unknown' until the app
 * shell reports them.
 */
export async function deviceSnapshot(): Promise<DeviceSnapshot> {
  const info = (await plugin('Device')?.getInfo?.().catch(() => null)) as {model?: string; osVersion?: string; operatingSystem?: string} | null | undefined;
  const [location, camera, notifications] = await Promise.all([
    nativeState('Geolocation', 'location').then((state) => state ?? browserState('geolocation')),
    nativeState('BarcodeScanner', 'camera').then((state) => state ?? browserState('camera')),
    nativeState('LocalNotifications', 'display').then((state) => state ?? browserState('notifications')),
  ]);
  return {
    osVersion: info?.osVersion ? `${info.operatingSystem === 'ios' ? 'iOS' : 'Android'} ${info.osVersion}` : '',
    deviceModel: info?.model ?? '',
    location,
    backgroundLocation: 'unknown',
    notifications,
    camera,
    batterySaver: 'unknown',
  };
}

/** Opens an address outside the app (the store page, a download). Falls back to a new tab in a browser. */
export function openExternal(url: string): void {
  if (!/^https:\/\//i.test(url)) return;
  const browser = plugin('Browser');
  if (browser?.open) {
    void browser.open({url}).catch(() => window.open(url, '_blank', 'noopener'));
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * Starts the update. On Android from Google Play the update downloads and installs inside the app; on iOS, or when the app
 * was installed another way (a file), the store page or download address from the release is opened instead.
 */
export async function startNativeUpdate(storeUrl: string): Promise<void> {
  const updater = plugin('AppUpdate');
  if (updater) {
    try {
      if (nativePlatform() === 'android' && typeof updater.performImmediateUpdate === 'function') {
        await updater.performImmediateUpdate();
        return;
      }
      if (typeof updater.openAppStore === 'function') {
        await updater.openAppStore();
        return;
      }
    } catch {
      // not installed from the store, or the store has nothing newer yet: use the address the administrator gave
    }
  }
  if (storeUrl) openExternal(storeUrl);
}
