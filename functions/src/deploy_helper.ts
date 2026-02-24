
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Re-export specific updated functions to ensure latest code is deployed
export { getVendorDashboardStats } from './vendor/vendor';

// Ensure region is set to us-central1 (or matching project region) to avoid CORS issues
// if the client expects a specific region.
// Also increasing memory for heavier functions.
export const runtimeOpts = {
    timeoutSeconds: 300,
    memory: '256MB' as const
};
