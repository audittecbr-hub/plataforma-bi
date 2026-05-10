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

export const getWelcomeEmailTemplate = (name: string, setupLink: string, email: string) => `
    <div style="font-family: sans-serif; color: #EBEBEB; background-color: #322E2B; max-width: 600px; margin: 0 auto; padding: 40px; border-radius: 8px;">
        <h2 style="color: #D5AE77; text-align: center; font-size: 24px; margin-bottom: 30px;">Bem-vindo ao Portal Grupo Studio</h2>
        <p style="font-size: 16px; line-height: 1.5;">Olá, ${name}!</p>
        <p style="font-size: 16px; line-height: 1.5;">Sua conta foi criada com sucesso. Clique no botão abaixo para definir sua senha e acessar o portal:</p>
        <div style="background: #1c1917; padding: 20px; border-radius: 4px; border-left: 4px solid #D5AE77; margin: 25px 0;">
            <p style="margin: 5px 0;"><strong>Usuário:</strong> ${email}</p>
        </div>
        <p style="text-align: center; margin-top: 40px;">
            <a href="${setupLink}" style="background-color: #D5AE77; color: #1c1917; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Definir Minha Senha</a>
        </p>
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 40px; border-top: 1px solid #444; padding-top: 20px;">
            Este link é de uso único e expira em 24 horas. Se você não esperava este e-mail, ignore-o.
        </p>
    </div>
`;

export const getResetPasswordTemplate = (link: string) => `
    <div style="font-family: sans-serif; color: #EBEBEB; background-color: #322E2B; max-width: 600px; margin: 0 auto; padding: 40px; border-radius: 8px;">
        <h2 style="color: #D5AE77; text-align: center; font-size: 24px; margin-bottom: 30px;">Recuperação de Senha</h2>
        <p style="font-size: 16px; line-height: 1.5;">Recebemos uma solicitação para redefinir sua senha.</p>
        <p style="text-align: center; margin-top: 40px;">
            <a href="${link}" style="background-color: #D5AE77; color: #1c1917; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Redefinir Minha Senha</a>
        </p>
        <p style="font-size: 14px; margin-top: 30px; color: #CDCDCD;">Se você não solicitou isso, pode ignorar este e-mail.</p>
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 40px; border-top: 1px solid #444; padding-top: 20px;">
            Este link expira em breve.
        </p>
    </div>
`;
