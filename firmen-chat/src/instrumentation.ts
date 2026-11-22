// Wird einmal beim Serverstart ausgeführt.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // Nicht während "next build" ausführen – sonst entstünde die Datenbank im Build-Verzeichnis
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const { enforceRetention } = await import("./server/db")
  const { bootstrapAdmin } = await import("./server/services")
  bootstrapAdmin()
  enforceRetention()
  setInterval(enforceRetention, 3600000).unref()
}
