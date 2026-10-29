export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Throws with a readable list of problems when a variable is missing.
    await import('./lib/env');
  }
}
