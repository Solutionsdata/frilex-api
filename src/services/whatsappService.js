const axios = require('axios');

const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY  = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'frilex';
const APP_URL  = process.env.FRONTEND_URL || 'https://frilex-web.vercel.app';

function enabled() {
  return !!(BASE_URL && API_KEY);
}

function fmtPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Add Brazil country code if missing
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits.length >= 12 ? digits : null;
}

async function send(phone, text) {
  if (!enabled()) return;
  const number = fmtPhone(phone);
  if (!number) return;

  try {
    await axios.post(
      `${BASE_URL}/message/sendText/${INSTANCE}`,
      { number, text },
      { headers: { apikey: API_KEY }, timeout: 8000 }
    );
  } catch (err) {
    // Never break the main flow — log and continue
    console.warn('[WhatsApp] Failed to send to', number, '—', err?.response?.data?.message || err.message);
  }
}

// ── Notification templates ────────────────────────────────────────────────────

const WhatsApp = {
  // Client receives a new proposal on their job
  async newProposal(clientPhone, { clientName, jobTitle, professionalName, proposedPrice, priceType }) {
    const priceLabels = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };
    const priceText = proposedPrice
      ? `R$ ${Number(proposedPrice).toFixed(2)} ${priceLabels[priceType] || ''}`.trim()
      : 'valor a combinar';
    await send(clientPhone, [
      `🔔 *Frilex — Nova Proposta Recebida!*`,
      ``,
      `Olá, ${clientName}!`,
      ``,
      `O profissional *${professionalName}* enviou uma proposta para a sua oportunidade:`,
      `📋 *${jobTitle}*`,
      `💰 ${priceText}`,
      ``,
      `Acesse a plataforma para ver os detalhes e aceitar:`,
      `${APP_URL}/jobs`,
    ].join('\n'));
  },

  // Professional: client accepted their proposal / direct acceptance
  async proposalAccepted(professionalPhone, { professionalName, jobTitle, clientName, price, priceType }) {
    const priceLabels = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };
    const priceText = price
      ? `R$ ${Number(price).toFixed(2)} ${priceLabels[priceType] || ''}`.trim()
      : 'A combinar no chat';
    await send(professionalPhone, [
      `✅ *Frilex — Proposta Aceita!*`,
      ``,
      `Parabéns, ${professionalName}!`,
      ``,
      `O cliente *${clientName}* aceitou sua proposta para:`,
      `📋 *${jobTitle}*`,
      `💰 ${priceText}`,
      ``,
      `Abra o chat para alinhar os detalhes e iniciar o serviço:`,
      `${APP_URL}/chat`,
    ].join('\n'));
  },

  // Client: professional marked job as completed
  async jobCompletedByProfessional(clientPhone, { clientName, jobTitle, professionalName, completionNote }) {
    await send(clientPhone, [
      `🏁 *Frilex — Serviço Concluído!*`,
      ``,
      `Olá, ${clientName}!`,
      ``,
      `O profissional *${professionalName}* marcou o serviço como concluído:`,
      `📋 *${jobTitle}*`,
      completionNote ? `📝 "${completionNote}"` : '',
      ``,
      `Acesse a plataforma para confirmar a conclusão e liberar o pagamento:`,
      `${APP_URL}/jobs`,
    ].filter((l) => l !== '').join('\n'));
  },

  // Professional: client confirmed completion (payment released)
  async paymentReleased(professionalPhone, { professionalName, jobTitle, price, priceType }) {
    const priceLabels = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };
    const priceText = price
      ? `R$ ${Number(price).toFixed(2)} ${priceLabels[priceType] || ''}`.trim()
      : '';
    await send(professionalPhone, [
      `💸 *Frilex — Pagamento Liberado!*`,
      ``,
      `Parabéns, ${professionalName}!`,
      ``,
      `O cliente confirmou a conclusão do serviço:`,
      `📋 *${jobTitle}*`,
      priceText ? `💰 ${priceText}` : '',
      ``,
      `O pagamento foi liberado. Obrigado por usar o Frilex! 🙌`,
    ].filter((l) => l !== '').join('\n'));
  },

  // New message received in chat
  async newChatMessage(receiverPhone, { receiverName, senderName, preview }) {
    await send(receiverPhone, [
      `💬 *Frilex — Nova Mensagem*`,
      ``,
      `${receiverName}, você recebeu uma mensagem de *${senderName}*:`,
      ``,
      `"${preview.length > 100 ? preview.substring(0, 100) + '…' : preview}"`,
      ``,
      `Responda pelo app: ${APP_URL}/chat`,
    ].join('\n'));
  },

  // Welcome message on registration
  async welcome(phone, { name, role }) {
    const roleText = role === 'professional' ? 'profissional' : 'cliente';
    await send(phone, [
      `👋 *Bem-vindo ao Frilex!*`,
      ``,
      `Olá, ${name}! Sua conta de ${roleText} foi criada com sucesso.`,
      ``,
      `Acesse agora: ${APP_URL}`,
      ``,
      `Em caso de dúvidas, responda esta mensagem. 😊`,
    ].join('\n'));
  },

  // Admin sets new password for user
  async passwordReset(phone, { name, newPassword }) {
    await send(phone, [
      `🔑 *Frilex — Nova Senha Definida*`,
      ``,
      `Olá, ${name}!`,
      ``,
      `O administrador definiu uma nova senha para sua conta:`,
      `🔐 Senha: *${newPassword}*`,
      ``,
      `Acesse e altere sua senha assim que possível:`,
      `${APP_URL}/login`,
    ].join('\n'));
  },
};

module.exports = WhatsApp;
