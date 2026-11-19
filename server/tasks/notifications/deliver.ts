import { useDb, useMailer } from '../../http/context'
import { deliverOutbox } from '../../modules/notifications/outbox'

/** Runs every minute (nuxt.config scheduledTasks). Safe to run on several instances at once. */
export default defineTask({
  meta: {
    name: 'notifications:deliver',
    description: 'Send due emails from the notification outbox',
  },
  async run() {
    const result = await deliverOutbox({
      db: useDb(),
      mailer: useMailer(),
      now: () => new Date(),
    }, { limit: 50 })
    for (const failure of result.errors)
      console.warn(`[outbox] delivery failed id=${failure.id}: ${failure.error}`)
    return {
      result: { sent: result.sent, retried: result.retried, dead: result.dead },
    }
  },
})
