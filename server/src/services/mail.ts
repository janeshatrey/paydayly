/** HTTPS delivery works on hosts that block outbound SMTP. No SDK or browser key. */
export function resetMailerFromEnv(env: NodeJS.ProcessEnv, send: typeof fetch = fetch) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.PUBLIC_URL) return undefined
  const origin = new URL(env.PUBLIC_URL)
  if (origin.protocol !== "https:" && env.NODE_ENV === "production") throw new Error("PUBLIC_URL must use HTTPS in production")
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid PUBLIC_URL protocol")
  return async (email: string, token: string): Promise<void> => {
    const url = new URL("/reset", origin)
    url.searchParams.set("token", token)
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: "Reset your Paydayly password",
        text: `Use this link to reset your Paydayly password. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, ignore this email.`,
      }),
    })
    if (!response.ok) throw new Error("Password reset delivery failed")
  }
}
