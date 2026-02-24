/**
 * Storage Security Rules Tests
 *
 * Run with: npm run test:rules
 * Requires Firestore + Storage emulators.
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const hasStorageEmulator = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const hasRequiredEmulators = hasFirestoreEmulator && hasStorageEmulator;
const rulesDescribe = hasRequiredEmulators ? describe : describe.skip;

const ADMIN_UID = 'admin-user-123';
const SUBADMIN_UID = 'subadmin-user-456';
const USER_UID = 'regular-user-abc';
const OTHER_USER_UID = 'other-user-xyz';

async function seedUsers() {
  if (!testEnv) return;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', ADMIN_UID), { role: 'admin', name: 'Admin' });
    await setDoc(doc(db, 'users', SUBADMIN_UID), { role: 'sub_admin', name: 'Sub Admin' });
    await setDoc(doc(db, 'users', USER_UID), { role: 'user', name: 'User' });
    await setDoc(doc(db, 'users', OTHER_USER_UID), { role: 'user', name: 'Other User' });
  });
}

async function seedKycObject(userId: string, fileName = 'doc.png') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    await uploadString(
      ref(storage, `kyc/${userId}/${fileName}`),
      'fake-image',
      'raw',
      { contentType: 'image/png' }
    );
  });
}

beforeAll(async () => {
  if (!hasRequiredEmulators) {
    console.warn(
      'Skipping Storage rules tests: FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST must be set. Use `npm run test:rules`.'
    );
    return;
  }

  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':');

  testEnv = await initializeTestEnvironment({
    projectId: 'thinkmart-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: firestoreHost,
      port: Number(firestorePort || 8080),
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: storageHost,
      port: Number(storagePort || 9199),
    },
  });

  await seedUsers();
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (!testEnv) return;
  await testEnv.clearStorage();
  await testEnv.clearFirestore();
  await seedUsers();
});

rulesDescribe('KYC Storage Rules', () => {
  test('user can upload own KYC image', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertSucceeds(
      uploadString(
        ref(storage, `kyc/${USER_UID}/front.png`),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });

  test('user CANNOT upload non-image/non-pdf KYC file', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, `kyc/${USER_UID}/malware.exe`),
        'fake-binary',
        'raw',
        { contentType: 'application/octet-stream' }
      )
    );
  });

  test('user can read own KYC file', async () => {
    await seedKycObject(USER_UID, 'self.png');
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertSucceeds(getBytes(ref(storage, `kyc/${USER_UID}/self.png`)));
  });

  test('user CANNOT read another user KYC file', async () => {
    await seedKycObject(USER_UID, 'private.png');
    const storage = testEnv.authenticatedContext(OTHER_USER_UID).storage();

    await assertFails(getBytes(ref(storage, `kyc/${USER_UID}/private.png`)));
  });

  test('admin can read any user KYC file', async () => {
    await seedKycObject(USER_UID, 'admin-read.png');
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();

    await assertSucceeds(getBytes(ref(storage, `kyc/${USER_UID}/admin-read.png`)));
  });

  test('sub_admin can read any user KYC file', async () => {
    await seedKycObject(USER_UID, 'subadmin-read.png');
    const storage = testEnv.authenticatedContext(SUBADMIN_UID).storage();

    await assertSucceeds(getBytes(ref(storage, `kyc/${USER_UID}/subadmin-read.png`)));
  });

  test('admin CANNOT upload KYC file for another user', async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, `kyc/${USER_UID}/admin-write.png`),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });
});

// ============================================================================
// PRODUCT IMAGES STORAGE TESTS
// ============================================================================

rulesDescribe('Product Images Storage Rules', () => {
  test('anyone can read product images', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = context.storage();
      await uploadString(
        ref(storage, 'products/product-1/main.png'),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      );
    });

    const storage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(storage, 'products/product-1/main.png')));
  });

  test('user CANNOT write to product images (server-only)', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, 'products/product-1/user-upload.png'),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });

  test('admin CANNOT write to product images (server-only)', async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, 'products/product-1/admin-upload.png'),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });
});

// ============================================================================
// USER PROFILE IMAGES STORAGE TESTS
// ============================================================================

rulesDescribe('User Profile Images Storage Rules', () => {
  test('user can upload image under own profile path', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertSucceeds(
      uploadString(
        ref(storage, `users/${USER_UID}/avatar.png`),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });

  test('user CANNOT upload under another user profile path', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, `users/${OTHER_USER_UID}/avatar.png`),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });

  test('user CANNOT upload non-image file to profile path', async () => {
    const storage = testEnv.authenticatedContext(USER_UID).storage();

    await assertFails(
      uploadString(
        ref(storage, `users/${USER_UID}/data.json`),
        '{"hack": true}',
        'raw',
        { contentType: 'application/json' }
      )
    );
  });

  test('unauthenticated user CANNOT upload profile image', async () => {
    const storage = testEnv.unauthenticatedContext().storage();

    await assertFails(
      uploadString(
        ref(storage, `users/${USER_UID}/avatar.png`),
        'fake-image',
        'raw',
        { contentType: 'image/png' }
      )
    );
  });
});

