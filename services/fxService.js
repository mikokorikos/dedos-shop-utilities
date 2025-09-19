const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const DEFAULT_MXN_TO_USD_RATE = 0.058;

export class FxService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.rate = config.MXN_USD_RATE > 0 ? config.MXN_USD_RATE : DEFAULT_MXN_TO_USD_RATE;
    this.usingFallback = !(config.MXN_USD_RATE > 0);
    this.lastUpdated = config.MXN_USD_RATE > 0 ? Date.now() : null;
    this.timer = null;
  }

  start() {
    if (typeof fetch !== 'function') return;
    this.timer = setInterval(() => {
      this.refresh().catch(() => {});
    }, this.config.FX_REFRESH_INTERVAL_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.refresh().catch(() => {});
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh() {
    if (process.env.MXN_USD_DISABLE_FETCH === '1') return;
    if (typeof fetch !== 'function') return;
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/MXN', {
        headers: { 'User-Agent': 'DedosShopBot/1.0 (+https://discord.gg/dedos)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const nextRate = Number(payload?.rates?.USD);
      if (Number.isFinite(nextRate) && nextRate > 0) {
        this.rate = nextRate;
        this.usingFallback = false;
        this.lastUpdated = Date.now();
        if (this.config.SHOW_DEBUG) {
          this.logger.info(`[FX] Tasa MXN->USD actualizada: ${nextRate.toFixed(4)}`);
        }
      }
    } catch (error) {
      this.logger.warn(`[FX] No se pudo actualizar la tasa MXN->USD: ${error?.message || error}`);
    }
  }

  formatUsdFromMxn(amountMxn) {
    const usdValue = amountMxn * this.rate;
    return `~ ${USD_FORMATTER.format(usdValue)} USD`;
  }

  buildInfoField() {
    const rateText = this.rate.toFixed(4);
    const detail = this.usingFallback
      ? 'Usamos una tasa predeterminada cuando no hay actualización automática disponible.'
      : 'La tasa se actualiza de forma automática cada 6 horas desde open.er-api.com.';
    const lastUpdateLine = this.lastUpdated
      ? `Última actualización: ${new Date(this.lastUpdated).toISOString()}.`
      : 'Última actualización: no disponible (tasa predeterminada).';
    return {
      name: 'Cómo calculamos el USD',
      value: [`Conversión MXN -> USD = ${rateText}.`, detail, lastUpdateLine].join('\n'),
    };
  }
}
