const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';

function normalizeCode(value: string): string {
  const code = value.trim().toLowerCase();
  return code.startsWith('functions/') ? code : `functions/${code}`;
}

export function formatCallableError(
  error: unknown,
  fallback: string,
  callableName?: string
): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code)
      : '';

  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
      ? String((error as { message: string }).message)
      : '';

  const callableLabel = callableName ? `"${callableName}"` : 'the callable';
  const normalizedCode = code ? normalizeCode(code) : '';

  if (normalizedCode === 'functions/not-found') {
    return `Callable ${callableLabel} is not deployed in ${functionsRegion}.`;
  }
  if (normalizedCode === 'functions/permission-denied') {
    return message || `Permission denied calling ${callableLabel}.`;
  }
  if (normalizedCode === 'functions/unauthenticated') {
    return message || `You must be signed in to call ${callableLabel}.`;
  }
  if (normalizedCode === 'functions/internal') {
    if (/cors|preflight|access-control-allow-origin|err_failed/i.test(message)) {
      return `${fallback}. Callable transport was blocked by CORS/network policy for ${callableLabel}.`;
    }
    return `${fallback}. Server returned an internal error for ${callableLabel}.`;
  }

  return message || fallback;
}
