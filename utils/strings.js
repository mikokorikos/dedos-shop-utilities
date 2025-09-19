export const normalizeUserId = (input) => {
  if (typeof input !== 'string') return null;
  const match = input.match(/\d{5,}/);
  return match ? match[0] : null;
};

export const truncate = (value, maxLength) => {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
};
