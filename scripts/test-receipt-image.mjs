// Pure rules behind the parent's phone-friendly top-up and daily-limit controls:
//   - which receipt files are kept, shrunk or refused before upload (app/parent/receipt-image.ts)
//   - how a typed or tapped daily limit is read (app/parent/limit-input.ts)
import assert from 'node:assert/strict';
import {MAX_RECEIPT_BYTES, MAX_SIDE, planReceipt, RECEIPT_TYPES, sizeLabel, SHRINK_ABOVE_BYTES} from '../app/parent/receipt-image.ts';
import {clampSar, MAX_SAR, parseSar, PRESETS} from '../app/parent/limit-input.ts';

const MB = 1_000_000;
// ---- receipts ---------------------------------------------------------------------------------------------------------
assert.deepEqual(RECEIPT_TYPES, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], 'the same four formats the server accepts');
assert.equal(MAX_RECEIPT_BYTES, 4 * 1024 * 1024, 'the same 4 MB limit as the server');
assert.deepEqual(planReceipt({type: 'image/png', size: 300_000}, {width: 1080, height: 2340}), {action: 'keep'}, 'a phone screenshot (tall, but light) is sent as it is');
assert.deepEqual(planReceipt({type: 'image/jpeg', size: 6 * MB}, {width: 4000, height: 3000}), {action: 'shrink', scale: MAX_SIDE / 4000}, 'a 6 MB photo is shrunk to a 1800 px longest side');
assert.deepEqual(planReceipt({type: 'image/jpeg', size: 2 * MB}, {width: 1200, height: 900}), {action: 'shrink', scale: 1}, 'a heavy but small-dimension picture is re-encoded, not enlarged or cropped');
assert.deepEqual(planReceipt({type: 'image/png', size: 900_000}, {width: 3000, height: 1200}), {action: 'keep'}, 'a light file is kept however many pixels it has: small text must stay sharp');
assert.deepEqual(planReceipt({type: 'image/png', size: 2 * MB}, {width: 3000, height: 1200}), {action: 'shrink', scale: 0.6}, 'a heavy file with many pixels is shrunk');
assert.deepEqual(planReceipt({type: 'image/webp', size: SHRINK_ABOVE_BYTES}, {width: MAX_SIDE, height: 600}), {action: 'keep'}, 'at the limits it is kept');
assert.deepEqual(planReceipt({type: 'application/pdf', size: 3 * MB}), {action: 'keep'}, 'a PDF is never touched');
assert.deepEqual(planReceipt({type: 'application/pdf', size: 5 * MB}), {action: 'refuse', reason: 'size'}, 'a PDF over 4 MB cannot be shrunk');
assert.deepEqual(planReceipt({type: 'image/gif', size: 1000}), {action: 'refuse', reason: 'type'});
assert.deepEqual(planReceipt({type: 'text/html', size: 1000}), {action: 'refuse', reason: 'type'});
assert.deepEqual(planReceipt({type: 'image/heic', size: 1000}), {action: 'refuse', reason: 'type'}, 'a format the server cannot read is refused here, with a message, not after the upload');
assert.deepEqual(planReceipt({type: '', size: 500_000}), {action: 'keep'}, 'an unknown type (some Android pickers) is left to the server, which checks the real bytes');
assert.deepEqual(planReceipt({type: '', size: 5 * MB}), {action: 'refuse', reason: 'size'});
assert.deepEqual(planReceipt({type: 'image/jpeg', size: 3 * MB}), {action: 'keep'}, 'if the picture cannot be read, a file under the limit is still sent');
assert.equal(sizeLabel(820_000), '820 KB');
assert.equal(sizeLabel(1_400_000), '1.4 MB');
assert.equal(sizeLabel(10), '1 KB');

// ---- the daily limit --------------------------------------------------------------------------------------------------
assert.equal(parseSar('10'), 10);
assert.equal(parseSar('7.5'), 7.5);
assert.equal(parseSar('7,5'), 7.5, 'a comma is accepted');
assert.equal(parseSar(' 12 '), 12);
assert.equal(parseSar('١٥'), 15, 'Arabic-Indic digits are read');
assert.equal(parseSar('٧٫٥'), 7.5, 'and the Arabic decimal mark');
assert.equal(parseSar('0'), 0, 'zero is a valid limit (no purchases)');
assert.equal(parseSar('007'), 7);
for (const bad of ['', 'abc', '-3', '1e3', '7.555', '1.2.3', '١٢٣٤', '12 SAR', '--', '.5']) assert.equal(parseSar(bad), null, `not a limit: "${bad}"`);
assert.equal(parseSar('150'), 150, 'a number over the maximum is read (and then refused with a message, not silently cut)');
assert.equal(clampSar(150), MAX_SAR);
assert.equal(clampSar(-4), 0);
assert.equal(clampSar(7.456), 7.46);
assert.equal(MAX_SAR, 100, 'the server refuses more than SAR 100 a day');
assert.ok(PRESETS.every((p) => p >= 0 && p <= MAX_SAR) && PRESETS.includes(0) && PRESETS.includes(5) && PRESETS.includes(10), 'common amounts are offered');

console.log('Parent receipt and limit rules passed: screenshots are kept, big photos shrunk, unusable files refused before upload; daily limits are read from digits, commas and Arabic numerals.');
