export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright-core') throw new Error('controlled playwright import failure')
  return nextResolve(specifier, context)
}
