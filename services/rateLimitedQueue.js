export class RateLimitedQueue {
  constructor({ intervalMs, concurrency, maxQueue, logger }) {
    this.intervalMs = Math.max(250, Number(intervalMs) || 1000);
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.maxQueue = Math.max(1, Number(maxQueue) || 100);
    this.logger = logger;
    this.queue = [];
    this.active = 0;
    this.timer = null;
    this.lastReport = 0;
  }

  start() {
    if (this.timer) return;
    const handle = setInterval(() => this.#tick(), this.intervalMs);
    if (typeof handle.unref === 'function') handle.unref();
    this.timer = handle;
    this.logger?.info?.('[QUEUE] Cola iniciada.');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.logger?.info?.('[QUEUE] Cola detenida.');
  }

  size() {
    return this.queue.length + this.active;
  }

  push(fn) {
    if (this.queue.length >= this.maxQueue) {
      this.logger?.warn?.(
        `[QUEUE] Cola llena (${this.queue.length}/${this.maxQueue}). Tarea descartada.`
      );
      return false;
    }
    this.queue.push(fn);
    this.#maybeReport();
    return true;
  }

  async #run(fn) {
    this.active += 1;
    try {
      await fn();
    } catch (error) {
      this.logger?.error?.('[QUEUE] Error ejecutando tarea:', error);
    } finally {
      this.active -= 1;
    }
  }

  #tick() {
    for (let i = 0; i < this.concurrency && this.queue.length > 0; i += 1) {
      const fn = this.queue.shift();
      this.#run(fn);
    }
  }

  #maybeReport() {
    const now = Date.now();
    if (now - this.lastReport > 10_000) {
      this.lastReport = now;
      this.logger?.info?.(`[QUEUE] Pendientes: ${this.queue.length}, activos: ${this.active}`);
    }
  }
}
