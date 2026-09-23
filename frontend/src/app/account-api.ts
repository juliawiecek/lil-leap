export type ProfileValues = Record<string, string>;

const textFields = [
  'first_name', 'last_name', 'date_of_birth', 'phone', 'street_address', 'apartment',
  'city', 'state_province', 'postal_code', 'country', 'citizenship_status', 'ssn',
  'employment_status', 'employer_name', 'occupation', 'annual_income', 'net_worth_bracket',
  'risk_profile', 'liquidity_position', 'account_name', 'account_type', 'trader_level',
  'broker_firm_name', 'broker_affiliation_details', 'control_company_name',
  'control_company_role', 'beneficial_owner_name', 'beneficial_owner_relationship',
];
const booleanFields = [
  'accredited_investor', 'is_politically_exposed_person', 'broker_affiliation',
  'control_person', 'other_beneficial_owner',
];

/** Translate form strings into the existing Java registration contract. */
export function registrationPayload(values: ProfileValues, email: string, password: string) {
  const payload: Record<string, string | boolean> = { email: email.trim(), password };
  for (const field of textFields) {
    const value = values[field]?.trim();
    if (value) payload[field] = value;
  }
  for (const field of booleanFields) {
    if (values[field] === 'true' || values[field] === 'false') payload[field] = values[field] === 'true';
  }
  return payload;
}

/** Tokens remain in memory; credentials and profile values are never persisted in browser storage. */
export class AccountApi {
  private token: string | null = null;

  authorizationHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  signOut(): void { this.token = null; }

  async register(values: ProfileValues, email: string, password: string): Promise<void> {
    const response = await this.post('/api/v1/users', registrationPayload(values, email, password));
    if (response.status === 409) throw new Error('An account with this email already exists. Please sign in.');
    if (response.status === 400) throw new Error('Please review your details. You must be at least 21 and provide all required identity fields.');
    if (response.status !== 201) throw new Error('We could not create your account. Please try again.');
    let created;
    try { created = await response.json(); } catch { throw new Error('We could not confirm your account. Please try signing in.'); }
    if (typeof created?.id !== 'string') throw new Error('We could not confirm your account. Please try signing in.');
  }

  async login(email: string, password: string): Promise<{ email: string; firstName?: string }> {
    this.token = null;
    const response = await this.post('/api/v1/auth/login', { email: email.trim(), password });
    if (response.status === 401) throw new Error('Invalid email or password.');
    if (response.status === 423 || response.status === 429) throw new Error('Sign-in is temporarily unavailable. Please try again later.');
    if (!response.ok) throw new Error('We could not sign you in. Please try again.');
    let data;
    try { data = await response.json(); } catch { throw new Error('We could not sign you in. Please try again.'); }
    if (typeof data?.token !== 'string' || !data.token || typeof data?.user?.email !== 'string') {
      throw new Error('We could not sign you in. Please try again.');
    }
    this.token = data.token;
    return data.user;
  }

  private async post(path: string, body: object): Promise<Response> {
    try {
      return await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('Unable to connect. Please check your connection and try again.');
    }
  }
}
