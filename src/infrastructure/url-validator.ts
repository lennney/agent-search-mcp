const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254',  // AWS metadata
  'metadata.google.internal',  // GCP metadata
];

const BLOCKED_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
];

export function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only http/https protocols allowed' };
    }

    if (BLOCKED_HOSTS.includes(parsed.hostname)) {
      return { valid: false, error: 'Blocked host' };
    }

    for (const range of BLOCKED_IP_RANGES) {
      if (range.test(parsed.hostname)) {
        return { valid: false, error: 'Blocked IP range' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}
