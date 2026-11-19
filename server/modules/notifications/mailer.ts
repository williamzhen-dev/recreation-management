import nodemailer from 'nodemailer'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
}

export interface Mailer {
  send: (message: EmailMessage) => Promise<{ messageId: string }>
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
}

/** SMTP everywhere: Resend's SMTP in production, Mailpit locally (D32). */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.pass }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return {
    async send(message) {
      const info = await transport.sendMail({ from: config.from, ...message })
      return { messageId: info.messageId }
    },
  }
}

/** Captures messages in memory; used by tests and as a fallback when SMTP isn't configured. */
export function createMemoryMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    sent,
    async send(message) {
      sent.push(message)
      return { messageId: `memory-${sent.length}` }
    },
  }
}
