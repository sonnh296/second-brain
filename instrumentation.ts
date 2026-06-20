export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerEnv } = await import('./lib/env')
    const { initSentry } = await import('./lib/sentry')
    validateServerEnv()
    initSentry()
  }
}
