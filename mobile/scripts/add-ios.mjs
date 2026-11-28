// Creates the iOS project. `cap add ios` also runs `pod install`, which cannot succeed until the Podfile asks for an
// iOS version new enough for the scanner (scripts/prepare.mjs sets it). So that one failure is expected here: the
// project must exist afterwards, prepare.mjs patches it, and `cap sync ios` (next step) runs the install again.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => spawnSync('npx', args, {cwd: root, stdio: 'inherit', shell: process.platform === 'win32'});

if (!existsSync(join(root, 'ios/App/Podfile'))) {
  const added = run(['cap', 'add', 'ios', '--packagemanager', 'CocoaPods']);
  if (!existsSync(join(root, 'ios/App/Podfile'))) {
    console.error('`cap add ios` did not create the iOS project.');
    process.exit(added.status || 1);
  }
  if (added.status) console.log('\n(The pod install above is expected to fail on a new project: it is repeated after the next step.)\n');
}
const prepared = spawnSync(process.execPath, [join(root, 'scripts/prepare.mjs'), 'ios'], {cwd: root, stdio: 'inherit'});
process.exit(prepared.status ?? 1);
