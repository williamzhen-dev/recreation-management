import type { EmailMessage } from './mailer'

type Rendered = Pick<EmailMessage, 'subject' | 'text' | 'html'>

interface TemplateDefinition<P> {
  render: (payload: P) => Rendered
  /** Payload keys holding secrets (e.g. token links); stripped once the email is sent. */
  sensitiveKeys?: readonly (keyof P & string)[]
}

export interface SetupPayload {
  name: string
  organizationName: string | null
  role: string | null
  link: string
  expiresAt: string
}

export interface ResetPayload {
  name: string
  link: string
  expiresAt: string
}

export interface AddedToOrgPayload {
  name: string
  organizationName: string
  role: string
  loginUrl: string
}

function define<P>(definition: TemplateDefinition<P>): TemplateDefinition<P> {
  return definition
}

export const templates = {
  'auth.setup': define<SetupPayload>({
    sensitiveKeys: ['link'],
    render: (p) => {
      const subject = p.organizationName
        ? `Set up your ${p.organizationName} account`
        : 'Set up your account'
      const intro = p.organizationName
        ? `You've been added to ${p.organizationName}${p.role
          ? ` as ${p.role}`
          : ''}.`
        : 'An account has been created for you.'
      return layout(subject, [
        `Hi ${p.name},`,
        intro,
        'Choose a password to finish setting up your account:',
        { link: p.link, label: 'Set up my account' },
        `This link expires on ${formatInstant(p.expiresAt)} and can only be used once.`,
      ])
    },
  }),

  'auth.reset': define<ResetPayload>({
    sensitiveKeys: ['link'],
    render: p => layout('Reset your password', [
      `Hi ${p.name},`,
      'We received a request to reset your password. Choose a new one here:',
      { link: p.link, label: 'Reset my password' },
      `This link expires on ${formatInstant(p.expiresAt)}. If you didn't ask for this, you can ignore this email.`,
    ]),
  }),

  'auth.added_to_org': define<AddedToOrgPayload>({
    render: p => layout(`You've been added to ${p.organizationName}`, [
      `Hi ${p.name},`,
      `You've been added to ${p.organizationName} as ${p.role}. Sign in with your existing account to get started:`,
      { link: p.loginUrl, label: 'Sign in' },
    ]),
  }),
} as const

export type NotificationType = keyof typeof templates
export type PayloadFor<T extends NotificationType> = (typeof templates)[T] extends TemplateDefinition<infer P> ? P : never

export function isNotificationType(type: string): type is NotificationType {
  return Object.hasOwn(templates, type)
}

export function renderNotification(type: string, payload: Record<string, unknown>): Rendered {
  if (!isNotificationType(type))
    throw new Error(`Unknown notification type: ${type}`)
  return (templates[type] as TemplateDefinition<unknown>).render(payload)
}

export function sensitiveKeysFor(type: string): readonly string[] {
  return isNotificationType(type)
    ? (templates[type] as TemplateDefinition<unknown>).sensitiveKeys ?? []
    : []
}

// ---------------------------------------------------------------------------

type Block = string | { link: string, label: string }

function layout(subject: string, blocks: Block[]): Rendered {
  const text = blocks
    .map(block => (typeof block === 'string'
      ? block
      : `${block.label}: ${block.link}`))
    .join('\n\n')

  const body = blocks
    .map(block => typeof block === 'string'
      ? `<p style="margin:0 0 16px">${escapeHtml(block)}</p>`
      : `<p style="margin:0 0 16px"><a href="${escapeHtml(block.link)}" style="display:inline-block;padding:10px 18px;background:#171717;color:#ffffff;border-radius:6px;text-decoration:none">${escapeHtml(block.label)}</a></p>`)
    .join('\n')

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#171717;max-width:560px;margin:0 auto;padding:24px">${body}</body></html>`
  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

/** Account emails aren't tied to a facility, so show Toronto time with an explicit zone label. */
function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    // dateStyle/timeStyle can't be combined with timeZoneName, so spell the fields out.
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Toronto',
    timeZoneName: 'short',
  }).format(new Date(iso))
}
