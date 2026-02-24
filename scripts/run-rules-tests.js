/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function hasJava() {
  const check = spawnSync('java', ['-version'], {
    stdio: 'pipe',
    shell: true,
  });
  if (check.error) {
    return false;
  }
  return check.status === 0;
}

function run() {
  console.log('[test:rules] Starting Firestore rules test runner...');
  if (!hasJava()) {
    console.error('Firestore rules tests require Java (for Firebase Emulator).');
    console.error('Install Java and ensure `java` is available on PATH, then rerun `npm run test:rules`.');
    process.exit(1);
  }

  const workspaceRoot = process.cwd();
  const configHome = path.join(workspaceRoot, '.firebase-config');
  fs.mkdirSync(configHome, { recursive: true });

  const env = {
    ...process.env,
    FIREBASE_TOOLS_DISABLE_UPDATE_CHECK: '1',
    CI: '1',
    XDG_CONFIG_HOME: configHome,
    HOME: workspaceRoot,
    USERPROFILE: workspaceRoot,
  };

  const firebaseBin = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
  const baseArgs = [
    'emulators:exec',
    '--only',
    'firestore,storage',
    'npm test -- --runInBand --testPathPattern=tests/(firestore|storage).rules.test.ts',
  ];

  const firebaseCheck = spawnSync(firebaseBin, ['--version'], {
    stdio: 'pipe',
    shell: true,
    env,
  });

  const useNpxFallback = firebaseCheck.status !== 0;
  const command = useNpxFallback ? 'npx' : firebaseBin;
  const args = useNpxFallback ? ['firebase-tools', ...baseArgs] : baseArgs;

  if (useNpxFallback) {
    console.warn('[test:rules] Firebase CLI not found on PATH. Falling back to `npx firebase-tools`.');
  }

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    env,
  });

  if (result.error) {
    console.error('[test:rules] Failed to spawn Firebase CLI:', result.error.message);
    process.exit(1);
  }

  process.exit(result.status || 1);
}

run();
