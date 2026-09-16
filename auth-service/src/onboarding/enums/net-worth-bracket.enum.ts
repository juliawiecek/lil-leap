// Stored and transmitted as the literal dollar-range string (matches the DB's
// chk_net_worth_bracket constraint) -- not an enum constant name.
export enum NetWorthBracket {
  ZERO_TO_5K = '$0-5k',
  FIVE_TO_25K = '$5k-25k',
  TWENTY_FIVE_TO_100K = '$25k-100k',
  HUNDRED_TO_500K = '$100k-500k',
  OVER_500K = '$500k+',
}
