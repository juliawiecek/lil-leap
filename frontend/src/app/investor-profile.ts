import { AfterViewInit, OnInit, Component, ElementRef, input, output, signal, ViewChild } from '@angular/core';

interface ProfileField {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  inputMode?: string;
  autocomplete?: string;
  pattern?: string;
  optional?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  maxLength?: number;
  when?: string;
  matches?: string[];
}

@Component({
  selector: 'app-investor-profile',
  templateUrl: './investor-profile.html',
  styleUrl: './investor-profile.scss',
})
export class InvestorProfile implements OnInit, AfterViewInit {
  readonly fullName = input('');
  readonly email = input('');
  readonly back = output<void>();
  readonly completed = output<'NOVICE' | 'ADVANCED'>();
  readonly step = signal(0);
  readonly values = signal<Record<string, string>>({});
  readonly status = signal('');
  readonly states = ('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|American Samoa|Guam|Northern Mariana Islands|Puerto Rico|U.S. Virgin Islands').split('|').sort();
  // ISO 3166-1 countries and territories, displayed in English.
  readonly countries = (() => {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
      .split(' ').map(code => names.of(code) ?? code)
      .sort((a, b) => a.localeCompare(b, 'en'));
  })();
  @ViewChild('heading') private heading!: ElementRef<HTMLHeadingElement>;

  // User-entered columns follow the supplied NextTrade PostgreSQL schema.
  // Disclosure detail fields belong to regulatory_disclosures / beneficial_owner_info JSONB.
  // IDs, password hashes, verification, approvals, balances and timestamps are server-owned.
  readonly sections: { title: string; description: string; fields: ProfileField[] }[] = [
  {
    "title": "Personal details",
    "description": "Confirm your legal name and contact details. You must be at least 18 to apply.",
    "fields": [
      {
        "id": "first_name",
        "label": "First name",
        "autocomplete": "given-name",
        "maxLength": 100,
        "hint": "Check the name carried over from your signup details."
      },
      {
        "id": "last_name",
        "label": "Last name",
        "autocomplete": "family-name",
        "maxLength": 100
      },
      {
        "id": "date_of_birth",
        "label": "Date of birth",
        "type": "date",
        "autocomplete": "bday"
      },
      {
        "id": "phone",
        "label": "Phone number",
        "type": "tel",
        "autocomplete": "tel",
        "maxLength": 20,
        "placeholder": "312-555-0123",
        "hint": "U.S. numbers format automatically, e.g. 312-555-0123 or +1-312-555-0123. For other countries, start with + and the country code."
      },
{
  "id": "street_address",
  "label": "Street address",
  "autocomplete": "address-line1",
  "placeholder": "123 Main Street"
},
{
  "id": "apartment",
  "label": "Apartment / suite (optional)",
  "pattern": "[0-9\\p{P}\\p{S}]*",
  "autocomplete": "address-line2",
  "optional": true
},
{
  "id": "city",
  "label": "City",
  "autocomplete": "address-level2"
},
{
  "id": "state_province",
  "label": "State",
  "autocomplete": "address-level1", "placeholder": "Type a state"
},
{
  "id": "postal_code",
  "label": "ZIP code",
  "inputMode": "numeric",
  "pattern": "[0-9]+",
  "autocomplete": "postal-code"
},
      {
        "id": "country",
        "label": "Country of residence",
        "autocomplete": "country-name",
        "maxLength": 100
      },
      {
        "id": "citizenship_status",
        "label": "Citizenship / residency status",
        "options": [
          {
            "value": "CITIZEN",
            "label": "Citizen"
          },
          {
            "value": "PERMANENT_RESIDENT",
            "label": "Permanent resident"
          },
          {
            "value": "OTHER",
            "label": "Other"
          }
        ],
        "hint": "Select your status in your country of residence."
      },
      {
        "id": "ssn",
        "label": "Social Security number",
        "type": "text",
        "inputMode": "numeric",
        "placeholder": "123-45-6789",
        "optional": true,
        "maxLength": 11
      }
    ]
  },
  {
    "title": "Employment & finances",
    "description": "Tell us about your financial situation. All amounts are in USD.",
    "fields": [
      {
        "id": "employment_status",
        "label": "Employment status",
        "options": [
          {
            "value": "EMPLOYED",
            "label": "Employed"
          },
          {
            "value": "SELF_EMPLOYED",
            "label": "Self-employed"
          },
          {
            "value": "RETIRED",
            "label": "Retired"
          },
          {
            "value": "STUDENT",
            "label": "Student"
          },
          {
            "value": "UNEMPLOYED",
            "label": "Unemployed"
          }
        ]
      },
      {
        "id": "employer_name",
        "label": "Employer / business name",
        "when": "employment_status",
        "matches": [
          "EMPLOYED",
          "SELF_EMPLOYED"
        ],
        "maxLength": 255
      },
      {
        "id": "occupation",
        "label": "Occupation",
        "when": "employment_status",
        "matches": [
          "EMPLOYED",
          "SELF_EMPLOYED"
        ],
        "maxLength": 100
      },
      {
        "id": "annual_income",
        "label": "Annual salary in USD",
        "type": "text",
        "inputMode": "decimal",
        "pattern": "[0-9,]+([.][0-9]{1,2})?"
      },
      {
        "id": "net_worth_bracket",
        "label": "Net worth bracket",
        "options": [
          {
            "value": "$0-5k",
            "label": "$0–$5,000"
          },
          {
            "value": "$5k-25k",
            "label": "$5,000–$25,000"
          },
          {
            "value": "$25k-100k",
            "label": "$25,000–$100,000"
          },
          {
            "value": "$100k-500k",
            "label": "$100,000–$500,000"
          },
          {
            "value": "$500k+",
            "label": "$500,000+"
          }
        ]
      },
      {
        "id": "risk_profile",
        "label": "Risk profile",
        "options": [
          {
            "value": "CONSERVATIVE",
            "label": "Conservative"
          },
          {
            "value": "MODERATE",
            "label": "Moderate"
          },
          {
            "value": "AGGRESSIVE",
            "label": "Aggressive"
          }
        ]
      },
      {
        "id": "liquidity_position",
        "label": "Liquidity position in USD",
        "inputMode": "decimal",
        "pattern": "[0-9,]+([.][0-9]{1,2})?",
        "maxLength": 100,
        "hint": "Cash and savings you can access quickly. Example: 10,000."
      },
      {
        "id": "accredited_investor",
        "label": "Do you identify as an accredited investor?",
        "options": [
          {
            "value": "false",
            "label": "No / unsure"
          },
          {
            "value": "true",
            "label": "Yes"
          }
        ],
        "hint": "This is a self-declaration, subject to verification."
      }
    ]
  },
  {
    "title": "Account & disclosures",
    "description": "Name your individual cash account and complete the disclosures.",
    "fields": [
      {
        "id": "account_name",
        "label": "Account name",
        "maxLength": 100
      },
      {
        "id": "account_type",
        "label": "Account type",
        "options": [
          {
            "value": "INDIVIDUAL_CASH",
            "label": "Individual cash"
          }
        ],
        "hint": "Invest using available cash."
      },
      {
        "id": "trader_level",
        "label": "Trader level",
        "options": [
          {
            "value": "NOVICE",
            "label": "Novice — $5,000 minimum balance"
          },
          {
            "value": "ADVANCED",
            "label": "Advanced — $100,000 minimum balance"
          }
        ],
        "hint": "Minimum balance required before trading."
      },
      {
        "id": "is_politically_exposed_person",
        "label": "Are you a politically exposed person?",
        "options": [
          {
            "value": "false",
            "label": "No"
          },
          {
            "value": "true",
            "label": "Yes"
          }
        ],
        "hint": "A current or former prominent public official."
      },
      {
        "id": "broker_affiliation",
        "label": "Are you affiliated with a broker-dealer?",
        "options": [
          {
            "value": "false",
            "label": "No"
          },
          {
            "value": "true",
            "label": "Yes"
          }
        ]
      },
      {
        "id": "broker_firm_name",
        "label": "Firm name",
        "when": "broker_affiliation",
        "matches": [
          "true"
        ]
      },
      {
        "id": "broker_affiliation_details",
        "label": "Affiliation",
        "when": "broker_affiliation",
        "matches": ["true"]
      },
      {
        "id": "control_person",
        "label": "Are you a control person of a publicly traded company?",
        "options": [
          {
            "value": "false",
            "label": "No"
          },
          {
            "value": "true",
            "label": "Yes"
          }
        ],
        "hint": "A director, executive officer, or controlling shareholder."
      },
      {
        "id": "control_company_name",
        "label": "Company name",
        "when": "control_person",
        "matches": [
          "true"
        ]
      },
      {
        "id": "control_company_role",
        "label": "Your role",
        "when": "control_person",
        "matches": ["true"]
      },
      {
        "id": "other_beneficial_owner",
        "label": "Will someone else own the funds in this account?",
        "options": [
          {
            "value": "false",
            "label": "No"
          },
          {
            "value": "true",
            "label": "Yes"
          }
        ]
      },
      {
        "id": "beneficial_owner_name",
        "label": "Beneficial owner's name",
        "when": "other_beneficial_owner",
        "matches": [
          "true"
        ]
      },
      {
        "id": "beneficial_owner_relationship",
        "label": "Relationship to you",
        "when": "other_beneficial_owner",
        "matches": ["true"],
        "hint": "Ownership details are reviewed before opening."
      }
    ]
  }
];

  readonly latestBirthDate = (() => {
    const now = new Date();
    const year = now.getFullYear() - 18;
    const month = now.getMonth();
    const day = Math.min(now.getDate(), new Date(year, month + 1, 0).getDate());
    return [year, String(month + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  })();

  ngOnInit(): void {
    const names = this.fullName().trim().split(/\s+/);
    this.values.set({
      first_name: names.shift() ?? '',
      last_name: names.join(' '),
      account_name: 'My trading account',
      account_type: 'INDIVIDUAL_CASH',
    });
  }

  ngAfterViewInit(): void { this.focusHeading(); }

  visible(field: ProfileField): boolean {
    return !field.when || !!field.matches?.includes(this.values()[field.when] ?? '');
  }

  update(field: ProfileField, event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input instanceof HTMLInputElement) {
      input.setCustomValidity('');
      if (field.id === 'apartment') {
        const disallowed = /[^0-9\p{P}\p{S}]/gu;
        const caret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(disallowed, '').length;
        input.value = input.value.replace(disallowed, '');
        input.setSelectionRange(caret, caret);
      }
      if (field.id === 'postal_code') {
        const caret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
        input.value = input.value.replace(/\D/g, '');
        input.setSelectionRange(caret, caret);
      }
      if (field.id === 'phone' || field.id === 'ssn') {
        this.formatInput(field.id, input, event as InputEvent);
      }
      if (field.id === 'annual_income' || field.id === 'liquidity_position') {
        const raw = input.value;
        const caret = input.selectionStart ?? raw.length;
        const position = raw.slice(0, caret).replace(/[^\d.]/g, '').length;
        const cleaned = raw.replace(/[^\d.]/g, '');
        const [integer, ...decimals] = cleaned.split('.');
        const whole = integer.slice(0, 16);
        const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
          (decimals.length ? '.' + decimals.join('').slice(0, 2) : '');
        input.value = formatted;
        let nextCaret = 0;
        let seen = 0;
        while (nextCaret < formatted.length && seen < position) {
          if (formatted[nextCaret] !== ',') seen++;
          nextCaret++;
        }
        input.setSelectionRange(nextCaret, nextCaret);
      }
    }
    this.values.update(values => {
      const next = { ...values, [field.id]: input.value };
      // Keep the single SQL address column compatible with the separate form fields.
      next['address'] = ['street_address', 'apartment', 'city', 'state_province', 'postal_code']
        .map(key => next[key]?.trim()).filter(Boolean).join(', ');
      return next;
    });
    this.status.set('');
  }


  private formatInput(id: string, input: HTMLInputElement, event: InputEvent): void {
    const raw = input.value;
    let digitPosition = raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, '').length;
    let digits = raw.replace(/\D/g, '');
    const previous = this.values()[id] ?? '';
    // Deleting a separator also removes the adjacent digit, so backspace never gets stuck.
    if (event.inputType?.startsWith('delete') && digits === previous.replace(/\D/g, '') && raw !== previous) {
      const index = event.inputType === 'deleteContentBackward' ? digitPosition - 1 : digitPosition;
      if (index >= 0 && index < digits.length) {
        digits = digits.slice(0, index) + digits.slice(index + 1);
        digitPosition = Math.max(0, event.inputType === 'deleteContentBackward' ? digitPosition - 1 : digitPosition);
      }
    }
    const international = id === 'phone' && raw.trimStart().startsWith('+');
    let groups: number[];
    if (id === 'ssn') {
      digits = digits.slice(0, 9);
      groups = [3, 2, 4];
    } else if ((international && digits.startsWith('1')) || (!international && digits.startsWith('1') && digits.length > 10)) {
      digits = digits.slice(0, 11);
      groups = [1, 3, 3, 4];
    } else if (international) {
      // Country calling codes vary in length; preserve international digits without guessing.
      digits = digits.slice(0, 15);
      groups = [15];
    } else {
      digits = digits.slice(0, 10);
      groups = [3, 3, 4];
    }
    let offset = 0;
    const parts = groups.map(size => {
      const part = digits.slice(offset, offset + size);
      offset += size;
      return part;
    }).filter(Boolean);
    const formatted = (international ? '+' : '') + parts.join('-');
    input.value = formatted;
    let caret = international ? 1 : 0;
    let seen = 0;
    while (caret < formatted.length && seen < digitPosition) {
      if (/\d/.test(formatted[caret])) seen++;
      caret++;
    }
    input.setSelectionRange(caret, caret);
  }

  advance(event: Event, form: HTMLFormElement): void {
    event.preventDefault();
    for (const field of this.sections[this.step()].fields) {
      const control = form.elements.namedItem(field.id);
      if (this.visible(field) && !field.optional && control instanceof HTMLInputElement) {
        control.setCustomValidity(control.value.trim() ? '' : 'Please fill out this field.');
      }
    }
    for (const field of this.sections[this.step()].fields) {
      const control = form.elements.namedItem(field.id);
      if (!(control instanceof HTMLInputElement) || !this.visible(field)) continue;
      const value = control.value.trim();
      if ((field.id === 'annual_income' || field.id === 'liquidity_position') && value && !/^\d{1,16}(?:\.\d{1,2})?$/.test(value.replace(/,/g, ''))) {
        control.setCustomValidity('Enter a nonnegative amount with up to two decimal places.');
      }
      if (field.id === 'country' && value) {
        const country = this.countries.find(name => name.toLowerCase() === value.toLowerCase());
        if (!country) {
          control.setCustomValidity('Choose a country or territory from the suggestions.');
        } else {
          control.value = country;
          this.values.update(values => ({ ...values, country }));
        }
      }
      if (field.id === 'date_of_birth' && value > this.latestBirthDate) {
        control.setCustomValidity('You must be at least 18 years old to apply.');
      }
      if (field.id === 'phone' && value && !/^\+?[0-9() .-]{7,20}$/.test(value)) {
        control.setCustomValidity('Enter a valid phone number, up to 20 characters.');
      } else if (field.id === 'phone' && value.replace(/\D/g, '').length < 7) {
        control.setCustomValidity('Enter a phone number with at least 7 digits.');
      }
      if (field.id === 'ssn' && value && !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value)) {
        control.setCustomValidity('Enter 9 digits or use the format 123-45-6789.');
      }
    }
    if (!form.reportValidity()) return;
    this.goTo(this.step() + 1);
  }

  goTo(step: number): void {
    this.step.set(step);
    this.status.set('');
    this.focusHeading();
  }

  display(field: ProfileField): string {
    const value = this.values()[field.id]?.trim();
    if (!value) return 'Not provided';
    if (field.id === 'ssn') return '••••••••';
    return field.options?.find(option => option.value === value)?.label ?? value;
  }

  finish(): void {
    this.completed.emit(this.values()['trader_level'] === 'ADVANCED' ? 'ADVANCED' : 'NOVICE');
  }

  private focusHeading(): void {
    this.heading.nativeElement.focus();
    this.heading.nativeElement.closest('.profile-page')?.scrollTo({ top: 0 });
  }
}
