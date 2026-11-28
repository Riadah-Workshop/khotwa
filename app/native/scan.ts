// Scans a product barcode with the phone's own scanner (the app shell includes Google's ML Kit scanner on Android and
// Apple's camera framework on iOS). In a browser, or in an app build without the scanner, the answer is "unavailable"
// and the screen keeps using the website's own camera reader, a scanner device, or typing.
import {nativePlatform, plugin} from './bridge';
import {SCAN_FORMATS, classifyScanError, firstBarcode} from '../../lib/fushati/native-scan';
import type {NativeScanOutcome} from '../../lib/fushati/native-scan';

/** True inside the app when the scanner plugin is part of it. */
export function nativeScanAvailable(): boolean {
  return nativePlatform() !== null && plugin('BarcodeScanner') !== null;
}

/**
 * Opens the phone's scanner once and returns the first product barcode it reads. Asks for the camera the first time.
 * The scanner shows its own full-screen camera and closes itself when it has a code, so there is nothing to stop.
 */
export async function scanWithPhone(): Promise<NativeScanOutcome> {
  const scanner = plugin('BarcodeScanner');
  if (!scanner) return {kind: 'unavailable'};
  try {
    let camera = ((await scanner.checkPermissions?.()) as {camera?: string} | undefined)?.camera;
    if (camera !== 'granted') camera = ((await scanner.requestPermissions?.()) as {camera?: string} | undefined)?.camera;
    if (camera !== 'granted') return {kind: 'denied'};

    // On Android the scanner comes from Google Play services. It is normally fetched when the app is installed; if the
    // phone has not done that yet, ask for it now and let the person try again in a moment.
    if (nativePlatform() === 'android' && typeof scanner.isGoogleBarcodeScannerModuleAvailable === 'function') {
      const ready = ((await scanner.isGoogleBarcodeScannerModuleAvailable()) as {available?: boolean} | undefined)?.available;
      if (ready === false) {
        void scanner.installGoogleBarcodeScannerModule?.().catch(() => undefined);
        return {kind: 'preparing'};
      }
    }

    const code = firstBarcode(await scanner.scan?.({formats: [...SCAN_FORMATS]}));
    return code ? {kind: 'code', code} : {kind: 'cancelled'};
  } catch (error) {
    const kind = classifyScanError(error);
    return {kind};
  }
}
