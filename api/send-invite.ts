import nodemailer from "nodemailer";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, link } = req.body;
  if (!email || !link) return res.status(400).json({ error: "Email and link are required" });

  try {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn("SMTP credentials not configured. Email will not be sent, but link is generated:", link);
      return res.status(200).json({ success: true, message: "Link generated (email not sent due to missing SMTP config)", link });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"GuiaMX Admin" <${smtpUser}>`,
      to: email,
      subject: "Verifica tu cuenta en GuiaMX",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #2563eb;">Bienvenido a GuiaMX</h2>
          <p>Has sido invitado a unirte como conductor. Para activar tu cuenta y establecer tu contraseña, haz clic en el siguiente botón:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verificar mi cuenta</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="color: #6b7280; font-size: 14px; word-break: break-all;">${link}</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Este enlace expirará en 24 horas.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: "Email sent successfully" });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
