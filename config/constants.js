export const DEDOS_BRAND = {
  COLOR: 0x5000ab,
  AUTHOR: {
    name: '.gg/dedos',
    iconURL:
      'https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg',
  },
  FOOTER_TEXT: 'Dedos Shop - Seguridad en cada trade',
  GIF_NAME: 'dedosgif.gif',
};

export const COMMAND_PREFIX = ';';

export const INTERACTION_IDS = {
  MIDDLEMAN_MENU: 'middleman:menu',
  MIDDLEMAN_MODAL_PARTNER: 'middleman:partnerModal',
  MIDDLEMAN_MODAL_TRADE: 'middleman:tradeModal',
  MIDDLEMAN_BUTTON_DATA: 'middleman:data',
  MIDDLEMAN_BUTTON_CONFIRM: 'middleman:confirm',
  MIDDLEMAN_BUTTON_HELP: 'middleman:help',
  MIDDLEMAN_BUTTON_CLAIM: 'middleman:claim',
  MIDDLEMAN_BUTTON_OPEN_REVIEW: 'middleman:openReview',
  MIDDLEMAN_BUTTON_FINAL_CONFIRM: 'middleman:finalConfirm',
  MIDDLEMAN_MODAL_REVIEW: 'middleman:reviewModal',
  TICKET_MENU: 'ticket:menu',
  WARN_MODAL_REASON: 'warn:modal',
};

export const TICKET_TYPES = {
  BUY: 'buy',
  SELL: 'sell',
  ROBUX: 'robux',
  NITRO: 'nitro',
  DECOR: 'decor',
  MIDDLEMAN: 'mm',
};

export const WARN_THRESHOLDS = [
  { count: 3, action: 'timeout', durationMs: 24 * 60 * 60 * 1000 },
  { count: 6, action: 'timeout', durationMs: 24 * 60 * 60 * 1000 },
  { count: 12, action: 'timeout', durationMs: 24 * 60 * 60 * 1000 },
  { count: 18, action: 'timeout', durationMs: 7 * 24 * 60 * 60 * 1000 },
];
