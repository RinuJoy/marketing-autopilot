// Sends an email through Brevo (free: 300 a day). BREVO_API_KEY plus a sender address verified in Brevo (MAIL_FROM).
// attachments: [{ name, content }] with content as text or a Buffer.
export async function send({ to, subject, text, attachments = [], env = process.env }) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM || !to) return { sent: false, why: "BREVO_API_KEY, MAIL_FROM or the address not set" };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: "Marketing autopilot" }, to: [{ email: to }], subject, textContent: text,
      ...(attachments.length ? { attachment: attachments.map(a => ({ name: a.name, content: Buffer.from(a.content).toString("base64") })) } : {}) }),
  });
  return res.ok ? { sent: true } : { sent: false, why: `Brevo HTTP ${res.status}` };
}
