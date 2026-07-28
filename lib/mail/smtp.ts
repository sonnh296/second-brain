import nodemailer from 'nodemailer'
import { logger } from '@/lib/logger'

function requireSmtpEnv() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '').trim()
  const port = Number(process.env.SMTP_PORT ?? 465)
  if (!host || !user || !pass) {
    throw new Error('SMTP chưa được cấu hình (SMTP_HOST / SMTP_USER / SMTP_PASS)')
  }
  return { host, user, pass, port }
}

export function getMailFrom(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    `Note Everything <${process.env.SMTP_USER?.trim() || 'noreply@localhost'}>`
  )
}

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const { host, user, pass, port } = requireSmtpEnv()
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  try {
    await transporter.sendMail({
      from: getMailFrom(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
  } catch (err) {
    logger.error('SMTP send failed', { err, to: opts.to, subject: opts.subject })
    throw new Error('Không gửi được email. Vui lòng thử lại sau.')
  }
}

export async function sendSignupConfirmationEmail(opts: {
  to: string
  username: string
  confirmUrl: string
}): Promise<void> {
  const subject = 'Xác nhận đăng ký Note Everything'
  const text = `Xin chào ${opts.username},\n\nNhấn link sau để xác nhận email và kích hoạt tài khoản:\n${opts.confirmUrl}\n\nLink hết hạn sau 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.`
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 12px">Xác nhận đăng ký</h1>
      <p style="margin:0 0 16px;line-height:1.5">Xin chào <strong>${opts.username}</strong>,</p>
      <p style="margin:0 0 20px;line-height:1.5">Nhấn nút bên dưới để xác nhận email và kích hoạt tài khoản Note Everything.</p>
      <p style="margin:0 0 24px">
        <a href="${opts.confirmUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
          Xác nhận email
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5">
        Link hết hạn sau 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.<br/>
        ${opts.confirmUrl}
      </p>
    </div>
  `
  await sendMail({ to: opts.to, subject, html, text })
}
