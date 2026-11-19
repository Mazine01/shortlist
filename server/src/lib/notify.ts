import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';

type Kind = 'APPLICATION_RECEIVED' | 'STATUS_CHANGED' | 'JOB_HIDDEN';

/** In-app notifications. Email could hang off this same call later. */
export async function notify(userId: number, kind: Kind, text: string, link: string) {
  await db.insert(notifications).values({ userId, kind, text, link });
}
