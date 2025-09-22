export class UserFacingError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'UserFacingError';
    this.publicMessage = options.publicMessage ?? message;
    this.metadata = options.metadata ?? {};
  }
}

export class CooldownError extends UserFacingError {
  constructor(remainingMs) {
    super('Cooldown activo', {
      publicMessage: `Debes esperar ${Math.ceil(remainingMs / 1000)} segundos antes de usar esto nuevamente.`,
      metadata: { remainingMs },
    });
    this.name = 'CooldownError';
  }
}

export class PermissionError extends UserFacingError {
  constructor() {
    super('Permisos insuficientes', { publicMessage: 'No puedes ejecutar este comando.' });
    this.name = 'PermissionError';
  }
}
