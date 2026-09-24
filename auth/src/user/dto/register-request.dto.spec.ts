import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterRequestDto } from './register-request.dto';

/** Validates a snake_case body the way the global ValidationPipe does; returns every failure message. */
async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(RegisterRequestDto, body));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

const analyst = { user_role: 'ANALYST', email: 'a@example.com', password: 'pw-123456', employee_id: 'E-1' };

const trader = {
  user_role: 'TRADER',
  email: 't@example.com',
  password: 'pw-123456',
  first_name: 'Ada',
  last_name: 'Lovelace',
  date_of_birth: '1990-12-10',
  phone: '555-0100',
  street_address: '1 Main St',
  city: 'Springfield',
  state_province: 'IL',
  postal_code: '62701',
  country: 'US',
  citizenship_status: 'CITIZEN',
  ssn: '123-45-6789',
  employment_status: 'RETIRED',
  annual_income: '50000',
  net_worth_bracket: '$25k-100k',
  risk_profile: 'MODERATE',
  liquidity_position: '10000',
  accredited_investor: false,
  is_politically_exposed_person: false,
  account_name: 'Main',
  account_type: 'INDIVIDUAL_CASH',
  trader_level: 'NOVICE',
};

describe('RegisterRequestDto', () => {
  it('accepts a complete ANALYST and a complete TRADER', async () => {
    expect(await errorsFor(analyst)).toEqual([]);
    expect(await errorsFor(trader)).toEqual([]);
  });

  it('requires employee_id for an ANALYST', async () => {
    expect(await errorsFor({ ...analyst, employee_id: ' ' })).toContain('employeeId is required for ANALYST registration');
  });

  it('requires the identity fields for a TRADER', async () => {
    const [message] = await errorsFor({ ...trader, first_name: undefined });
    expect(message).toMatch(/firstName, lastName, dateOfBirth.* are required for TRADER registration/);
  });

  it('requires the financial fields for a TRADER', async () => {
    const [message] = await errorsFor({ ...trader, risk_profile: undefined });
    expect(message).toMatch(/employmentStatus, annualIncome.* are required for TRADER registration/);
  });

  it('requires the account fields for a TRADER', async () => {
    expect(await errorsFor({ ...trader, account_name: '' })).toContain(
      'accountName, accountType and traderLevel are required for TRADER registration',
    );
  });

  it('requires employer and occupation when employed', async () => {
    expect(await errorsFor({ ...trader, employment_status: 'EMPLOYED' })).toContain(
      'Employer name and occupation are required for employed or self-employed status',
    );
  });

  it('requires details for each "yes" disclosure', async () => {
    expect(await errorsFor({ ...trader, broker_affiliation: true })).toContain(
      'Broker firm name and affiliation details are required when broker affiliation is true',
    );
    expect(await errorsFor({ ...trader, control_person: true })).toContain(
      'Control company name and role are required when control person is true',
    );
    expect(await errorsFor({ ...trader, other_beneficial_owner: true })).toContain(
      'Beneficial owner name and relationship are required when other beneficial owner is true',
    );
  });

  it('rejects a malformed email, short password, unknown role and bad SSN', async () => {
    const errors = await errorsFor({ ...analyst, email: 'nope', password: 'short', user_role: 'ADMIN', ssn: '12-34' });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
