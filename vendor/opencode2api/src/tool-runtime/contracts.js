export const EXTERNAL_TOOL_PREFIX = 'external__';

export const VALIDATION_STATUSES = {
  VALID: 'valid',
  REPAIRABLE: 'repairable',
  REJECTED: 'rejected'
};

export function createValidationError(code, message, path = []) {
  return { code, message, path };
}
