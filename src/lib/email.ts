// import { Resend } from 'resend'; 
// const resendApiKey = process.env.RESEND_API_KEY;
// const resend = resendApiKey ? new Resend(resendApiKey) : null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resend: any = null;

export async function sendEmail({ to, subject, html }: { to: string, subject: string, html: string }) {
    if (!resend) {
        console.log("------------------------------------------");
        console.log("PARAMETERIZED EMAIL (Mock - No API Key per user request)");
        console.log(`TO: ${to}`);
        console.log(`SUBJECT: ${subject}`);
        console.log("--- HTML CONTENT ---");
        console.log(html);
        console.log("------------------------------------------");
        return { success: true, id: 'mock-id' };
    }

    try {
        const data = await resend.emails.send({
            from: 'Inteligência - Grupo Studio <bi@grupostudio.tec.br>', // Atualizar de acordo com o domínio do email
            to: [to],
            subject: subject,
            html: html,
        });
        return { success: true, id: data.data?.id };
    } catch (error) {
        console.error("Resend Email Error:", error);
        return { success: false, error };
    }
}

/*
 * Templates de e-mail no Design System do Grupo Studio: faixa em preto premium
 * com o logo oficial, filete dourado, título em Codec Pro (com fallbacks
 * seguros para clientes de e-mail) e botão de 4px. Tabelas e estilos inline
 * porque é o que os clientes de e-mail entendem.
 */

const EMAIL_FONT = "'Codec Pro', 'Hanken Grotesk', 'Segoe UI', Helvetica, Arial, sans-serif"

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Logo oficial (V1 branco) quando o site tem URL pública; senão, o nome em texto. */
function emailHeader() {
    const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    const brand = site
        ? `<img src="${site}/brand/grupo-studio-horizontal-branco.png" width="132" height="40" alt="Grupo Studio" style="display:block;border:0;height:40px;width:132px;" />`
        : `<span style="font-family:${EMAIL_FONT};font-size:18px;font-weight:700;letter-spacing:0.08em;color:#ffffff;">GRUPO STUDIO</span>`
    return `<tr><td style="background-color:#1f1f1f;padding:28px 40px;border-radius:8px 8px 0 0;">${brand}</td></tr>`
}

function emailLayout({ eyebrow, title, body, cta, footnote }: { eyebrow: string; title: string; body: string; cta?: { href: string; label: string }; footnote: string }) {
    const button = cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 8px;">
             <tr><td style="background-color:#927245;border-radius:4px;">
               <a href="${cta.href}" style="display:inline-block;padding:14px 28px;font-family:${EMAIL_FONT};font-size:15px;font-weight:600;letter-spacing:0.01em;color:#ffffff;text-decoration:none;border-radius:4px;">${cta.label}</a>
             </td></tr>
           </table>`
        : ''

    return `
<div style="margin:0;padding:0;background-color:#f6f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f6f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #d8d8d8;border-radius:8px;">
        ${emailHeader()}
        <tr><td style="padding:40px 40px 32px;font-family:${EMAIL_FONT};color:#1f1f1f;">
          <div style="width:40px;height:3px;background-color:#927245;margin:0 0 20px;"></div>
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#7c6038;">${eyebrow}</p>
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;color:#1f1f1f;">${title}</h1>
          ${body}
          ${button}
        </td></tr>
        <tr><td style="padding:24px 40px 32px;border-top:1px solid #ebebeb;font-family:${EMAIL_FONT};">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b6b6b;">${footnote}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b6b;">Grupo Studio · soluções corporativas inteligentes</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`
}

const paragraph = (text: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#5c5c5c;">${text}</p>`

export const getWelcomeEmailTemplate = (name: string, setupLink: string, email: string) =>
    emailLayout({
        eyebrow: 'Portal de inteligência',
        title: 'Boas-vindas ao Portal Grupo Studio',
        body: `
          ${paragraph(`Olá, ${escapeHtml(name)}.`)}
          ${paragraph('Sua conta foi criada. Defina sua senha para acessar os dashboards e relatórios da sua área.')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background-color:#f6f6f6;border-left:3px solid #927245;">
            <tr><td style="padding:16px 20px;font-family:${EMAIL_FONT};">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b6b6b;">Usuário</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#1f1f1f;">${escapeHtml(email)}</p>
            </td></tr>
          </table>`,
        cta: { href: setupLink, label: 'Definir minha senha' },
        footnote: 'Este link é de uso único e expira em 24 horas. Se você não esperava este e-mail, pode ignorá-lo.',
    })

export const getResetPasswordTemplate = (link: string) =>
    emailLayout({
        eyebrow: 'Segurança da conta',
        title: 'Redefinição de senha',
        body: `
          ${paragraph('Recebemos uma solicitação para redefinir a senha da sua conta no Portal Grupo Studio.')}
          ${paragraph('Se foi você, use o botão abaixo para criar uma nova senha.')}`,
        cta: { href: link, label: 'Redefinir minha senha' },
        footnote: 'Este link expira em breve. Se você não fez esta solicitação, ignore este e-mail; sua senha continua a mesma.',
    })
