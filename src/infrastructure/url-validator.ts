const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',                    // IPv6 loopback
  '169.254.169.254',        // AWS metadata
  'metadata.google.internal',  // GCP metadata
  '100.100.100.200',        // Alibaba metadata
  'kubernetes.default.svc', // K8s internal DNS
];

const BLOCKED_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
];

/** Decode hex-encoded suffix from IPv4-mapped IPv6 (::ffff:aabb:ccdd → a.bb.cc.dd) */
function decodeMappedV4(hexA: string, hexB: string): string | null {
  try {
    const a = parseInt(hexA.padStart(4, '0').slice(0, 2), 16);
    const b = parseInt(hexA.padStart(4, '0').slice(2, 4), 16);
    const c = parseInt(hexB.padStart(4, '0').slice(0, 2), 16);
    const d = parseInt(hexB.padStart(4, '0').slice(2, 4), 16);
    if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) return null;
    return `${a}.${b}.${c}.${d}`;
  } catch {
    return null;
  }
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only http/https protocols allowed' };
    }

    // Normalize hostname: strip IPv6 brackets
    const raw = parsed.hostname;
    const hostname = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;

    // Check exact blocked hosts
    if (BLOCKED_HOSTS.includes(hostname)) {
      return { valid: false, error: 'Blocked host' };
    }

    // Check IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    if (hostname.startsWith('::ffff:')) {
      const suffix = hostname.slice(7); // '::ffff:7f00:1' → '7f00:1'
      const parts = suffix.split(':');
      if (parts.length === 2) {
        const decoded = decodeMappedV4(parts[0], parts[1]);
        if (decoded) {
          // Check decoded IP against blocked ranges
          if (BLOCKED_HOSTS.includes(decoded)) {
            return { valid: false, error: 'Blocked IPv4-mapped IPv6 host' };
          }
          for (const range of BLOCKED_IP_RANGES) {
            if (range.test(decoded)) {
              return { valid: false, error: 'Blocked IPv4-mapped IPv6 range' };
            }
          }
        }
      }
    }

    // Check IP ranges on plain hostname
    for (const range of BLOCKED_IP_RANGES) {
      if (range.test(hostname)) {
        return { valid: false, error: 'Blocked IP range' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}
