export const toDiscordTimestamp = (date) =>
  Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000);

const SQL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} /;

export const parseSqlDate = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' && SQL_DATETIME_PATTERN.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
};
