const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'OpenAI-style API key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: 'GitHub token', pattern: /\bgh[opsu]_[A-Za-z0-9]{20,}\b/ },
  { label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'Bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  {
    label: 'credential assignment',
    pattern: /\b(?:api[_-]?key|access[_-]?token|secret|password|passwd)\s*[:=]\s*["']?[^\s"']{8,}/i,
  },
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

export interface SecretInspection {
  secret: boolean
  labels: string[]
}

export function inspectForSecrets(text: string): SecretInspection {
  const labels = SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label)
  return { secret: labels.length > 0, labels }
}

export function redactForLog(text: string, maxLength = 160): string {
  let value = text
  for (const { pattern } of SECRET_PATTERNS) {
    value = value.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '[REDACTED]')
  }
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}
