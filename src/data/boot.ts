export async function prepareDevice(): Promise<void> {
  // Kondisi ditulis langsung di sini agar bundler membuang file data contoh dari build produksi.
  if (import.meta.env.VITE_DEMO_DATA === 'true') {
    const { seedIfEmpty } = await import('./seed')
    await seedIfEmpty()
  }
}
