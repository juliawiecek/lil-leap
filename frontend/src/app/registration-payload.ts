/** Profile answers the API validates as booleans; the form's selects hold them as 'true' / 'false'. */
const BOOLEAN_FIELDS = new Set([
  'accredited_investor',
  'is_politically_exposed_person',
  'broker_affiliation',
  'control_person',
  'other_beneficial_owner',
]);

/**
 * Builds the TRADER body for POST /auth/register. `fields` holds the profile answers
 * currently shown to the user, keyed by the API's snake_case names (the form's field ids);
 * blank answers are omitted so optional fields aren't sent as empty strings.
 */
export function toTraderRegistration(
  fields: Record<string, string>,
  email: string,
  password: string,
): Record<string, string | boolean> {
  const request: Record<string, string | boolean> = { user_role: 'TRADER', email: email.trim(), password };
  for (const [key, raw] of Object.entries(fields)) {
    const value = raw.trim();
    if (!value) continue;
    request[key] = BOOLEAN_FIELDS.has(key) ? value === 'true' : value;
  }
  return request;
}
