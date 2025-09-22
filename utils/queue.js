export class RateLimitedQueue {
  constructor({ intervalMs, concurrency, maxSize }) {
    this.intervalMs = Math.max(250, intervalMs ?? 1000);
    this.concurrency = Math.max(1, concurrency ?? 1);
    this.maxSize = Math.max(1, maxSize ?? 1_000);
    this.queue = [];
    this.active = 0;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.#tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  push(task) {
    if (this.queue.length >= this.maxSize) {
      return false;
    }
    this.queue.push(task);
    return true;
  }

  async #run(task) {
    this.active++;
    try {
      await task();
    } catch (err) {
      console.error('[ERROR] Tarea en cola falló', err);
    } finally {
      this.active--;
    }
  }

  #tick() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.#run(task);
    }
  }
}
