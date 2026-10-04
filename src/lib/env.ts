/**
 * Typed access to runtime configuration. Nothing in the application reads
 * process.env directly — this is the single place where defaults live, so a
 * missing variable fails loudly rather than silently changing behaviour.
 */
function str(key: string, fallback?: string): string {
  const value = process.env[key]
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required environment variable ${key}`)
  }
  return value
}

function numeric(key: string, fallback: number): number {
  const value = process.env[key]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const env = {
  get databaseUrl() {
    return str('DATABASE_URL')
  },
  get authSecret() {
    const secret = str('AUTH_SECRET', 'insecure-development-secret-change-me-now')
    if (secret.length < 32) {
      throw new Error('AUTH_SECRET must be at least 32 characters long.')
    }
    return secret
  },
  get sessionTtlHours() {
    return numeric('SESSION_TTL_HOURS', 12)
  },
  get platformName() {
    return str('PLATFORM_NAME', 'RentRewards')
  },
  get defaultCommissionRate() {
    return numeric('DEFAULT_COMMISSION_RATE', 1.0)
  },
  get currency() {
    return str('DEFAULT_CURRENCY', 'KES')
  },
  get timezone() {
    return str('DEFAULT_TIMEZONE', 'Africa/Nairobi')
  },
  get paymentsProvider() {
    return str('PAYMENTS_PROVIDER', 'mpesa-mock')
  },
  get taxProvider() {
    return str('TAX_PROVIDER', 'erits-mock')
  },
  get notificationsProvider() {
    return str('NOTIFICATIONS_PROVIDER', 'console')
  },
  get mpesa() {
    return {
      environment: str('MPESA_ENVIRONMENT', 'sandbox'),
      consumerKey: process.env.MPESA_CONSUMER_KEY ?? '',
      consumerSecret: process.env.MPESA_CONSUMER_SECRET ?? '',
      shortCode: str('MPESA_SHORTCODE', '400200'),
      passkey: process.env.MPESA_PASSKEY ?? '',
      callbackUrl: str('MPESA_CALLBACK_URL', 'http://localhost:3000/api/v1/webhooks/mpesa'),
      /** Shared secret Safaricom must echo back as ?token= on the callback URL. */
      webhookSecret: process.env.MPESA_WEBHOOK_SECRET ?? '',
    }
  },
  get erits() {
    return {
      environment: str('ERITS_ENVIRONMENT', 'mock'),
      baseUrl: process.env.ERITS_BASE_URL ?? '',
      clientId: process.env.ERITS_CLIENT_ID ?? '',
      clientSecret: process.env.ERITS_CLIENT_SECRET ?? '',
    }
  },
}
