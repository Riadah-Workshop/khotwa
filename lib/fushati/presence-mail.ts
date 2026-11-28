// E-mail to the cafeteria administrators who asked for it (presence_email = 1) when an agent arrives at or leaves
// one of their cafeterias. Best effort: the arrival is already recorded before this runs, and a mail that cannot be
// sent is logged without the address and never fails the agent's phone.
import {env} from 'cloudflare:workers';
import {db} from './core';
import {sendHostingerSmtp} from '../hostinger-smtp';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[char] || char);

type MailEnv = {KHOTWA_FROM_EMAIL?: string; KHOTWA_SMTP_HOST?: string; KHOTWA_SMTP_PORT?: string; KHOTWA_SMTP_USER?: string; KHOTWA_SMTP_PASSWORD?: string; KHOTWA_SMTP_RELAY_URL?: string; KHOTWA_SMTP_RELAY_TOKEN?: string};

/** The administrators of one cafeteria who asked to be e-mailed. */
export async function alertRecipients(cafeteriaId: string): Promise<{email: string; full_name: string}[]> {
  return (
    await db()
      .prepare("SELECT u.email,u.full_name FROM fushati_users u JOIN fushati_assignments a ON a.user_id=u.id WHERE a.cafeteria_id=? AND u.role='fushati_admin' AND u.active=1 AND u.presence_email=1 AND u.email<>''")
      .bind(cafeteriaId)
      .all<{email: string; full_name: string}>()
  ).results;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('ar-SA-u-ca-gregory-nu-latn', {timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit'});

export async function mailPresenceEvent(kind: 'arrived' | 'left', cafeteriaId: string, agentName: string, atIso: string): Promise<void> {
  try {
    const config = env as unknown as MailEnv;
    if (!config.KHOTWA_FROM_EMAIL || !config.KHOTWA_SMTP_USER || !config.KHOTWA_SMTP_PASSWORD) return;
    const recipients = await alertRecipients(cafeteriaId);
    if (!recipients.length) return;
    const cafeteria = await db().prepare('SELECT name,alias FROM fushati_cafeterias WHERE id=?').bind(cafeteriaId).first<{name: string; alias: string}>();
    const place = cafeteria ? (cafeteria.alias ? `${cafeteria.alias} (${cafeteria.name})` : cafeteria.name) : '';
    const verbAr = kind === 'arrived' ? 'وصل إلى' : 'غادر';
    const verbEn = kind === 'arrived' ? 'arrived at' : 'left';
    const time = clock(atIso);
    const subject = `فسحتي | ${agentName} ${verbAr} ${place} ${time}`;
    const text = `${agentName} ${verbAr} ${place} الساعة ${time}.\n${agentName} ${verbEn} ${place} at ${time} (Riyadh).\n\nلإيقاف هذه الرسائل: فسحتي ← الحضور ← إيقاف الإشعارات بالبريد.\nTo stop these e-mails: Fushati → Attendance → turn off e-mail alerts.`;
    const html = `<div dir="rtl" lang="ar"><p><strong>${escapeHtml(agentName)}</strong> ${verbAr} <strong>${escapeHtml(place)}</strong> الساعة ${time}.</p><p dir="ltr" lang="en">${escapeHtml(agentName)} ${verbEn} ${escapeHtml(place)} at ${time} (Riyadh).</p><p><small>لإيقاف هذه الرسائل: فسحتي ← الحضور ← إيقاف الإشعارات بالبريد.</small></p></div>`;
    for (const person of recipients) {
      try {
        await sendHostingerSmtp({host: config.KHOTWA_SMTP_HOST || 'smtp.hostinger.com', port: Number(config.KHOTWA_SMTP_PORT || 465), user: config.KHOTWA_SMTP_USER, password: config.KHOTWA_SMTP_PASSWORD, from: config.KHOTWA_FROM_EMAIL, relayUrl: config.KHOTWA_SMTP_RELAY_URL, relayToken: config.KHOTWA_SMTP_RELAY_TOKEN, to: person.email, subject, html, text});
      } catch (error) {
        console.error('fushati_presence_mail_failed', error instanceof Error ? error.name : 'unknown');
      }
    }
  } catch (error) {
    console.error('fushati_presence_mail_failed', error instanceof Error ? error.name : 'unknown');
  }
}
