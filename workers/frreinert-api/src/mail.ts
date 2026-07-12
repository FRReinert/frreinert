export interface MailEnv {
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  SITE_URL: string;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Abstração de envio — hoje Resend; trocável por Cloudflare Email Sending depois. */
export async function sendMail(env: MailEnv, message: MailMessage): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.FROM_EMAIL || 'onboarding@resend.dev';
  if (!apiKey) {
    console.warn('RESEND_API_KEY não configurado — e-mail não enviado', message.subject);
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Resend send failed', res.status, body);
    return false;
  }

  return true;
}

export function siteBase(env: MailEnv) {
  return (env.SITE_URL || 'https://frreinert.com.br').replace(/\/$/, '');
}

export function orderApprovedEmail(env: MailEnv, email: string, ref: string) {
  const site = siteBase(env);
  const pedidoUrl = `${site}/pedido/?ref=${encodeURIComponent(ref)}&status=success`;
  const minhasUrl = `${site}/minhas-fotos/`;

  const subject = 'Pagamento confirmado — suas fotos';
  const text = [
    'Pagamento confirmado.',
    '',
    `Acesse seu pedido: ${pedidoUrl}`,
    `Ou veja todas as suas fotos: ${minhasUrl}`,
    '',
    'Fabricio Roberto Reinert',
  ].join('\n');

  const html = `
    <p>Pagamento confirmado.</p>
    <p><a href="${pedidoUrl}">Abrir este pedido</a></p>
    <p>Ou acesse <a href="${minhasUrl}">Minhas fotos</a> a qualquer momento com este e-mail.</p>
    <p>Fabricio Roberto Reinert</p>
  `.trim();

  return { to: email, subject, text, html };
}

export function magicLinkEmail(env: MailEnv, email: string, token: string) {
  const site = siteBase(env);
  const url = `${site}/minhas-fotos/acesso/?token=${encodeURIComponent(token)}`;

  const subject = 'Acesse suas fotos';
  const text = [
    'Use o link abaixo para acessar suas fotos compradas (válido por 15 minutos):',
    '',
    url,
    '',
    'Se você não pediu este acesso, ignore este e-mail.',
    '',
    'Fabricio Roberto Reinert',
  ].join('\n');

  const html = `
    <p>Use o link abaixo para acessar suas fotos compradas (válido por 15 minutos):</p>
    <p><a href="${url}">Acessar minhas fotos</a></p>
    <p>Se você não pediu este acesso, ignore este e-mail.</p>
    <p>Fabricio Roberto Reinert</p>
  `.trim();

  return { to: email, subject, text, html };
}

export function emailOtpEmail(email: string, code: string) {
  const subject = 'Seu código de verificação';
  const text = [
    `Seu código de verificação é: ${code}`,
    '',
    'Ele vale por 10 minutos. Se você não pediu este código, ignore este e-mail.',
    '',
    'Fabricio Roberto Reinert',
  ].join('\n');

  const html = `
    <p>Seu código de verificação é:</p>
    <p style="font-size:24px;letter-spacing:0.2em;font-weight:600">${code}</p>
    <p>Ele vale por 10 minutos. Se você não pediu este código, ignore este e-mail.</p>
    <p>Fabricio Roberto Reinert</p>
  `.trim();

  return { to: email, subject, text, html };
}
