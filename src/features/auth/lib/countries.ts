/**
 * Country calling codes for the phone-login country picker.
 *
 * NANP territories all carry dial "1" (and Kazakhstan "7") — the E.164
 * result is identical, and dial-prefix matching resolves shared codes via
 * DIAL_PRIORITY below.
 */

import { getLocales } from "expo-localization";

export type Country = {
  /** ISO 3166-1 alpha-2, uppercase — also the flag lookup key. */
  iso: string;
  name: string;
  /** Calling code digits without the "+". */
  dial: string;
};

const entry = (iso: string, name: string, dial: string): Country => ({
  iso,
  name,
  dial,
});

// Sorted by display name.
export const COUNTRIES: Country[] = [
  entry("AF", "Afghanistan", "93"),
  entry("AL", "Albania", "355"),
  entry("DZ", "Algeria", "213"),
  entry("AS", "American Samoa", "1"),
  entry("AD", "Andorra", "376"),
  entry("AO", "Angola", "244"),
  entry("AI", "Anguilla", "1"),
  entry("AG", "Antigua & Barbuda", "1"),
  entry("AR", "Argentina", "54"),
  entry("AM", "Armenia", "374"),
  entry("AW", "Aruba", "297"),
  entry("AU", "Australia", "61"),
  entry("AT", "Austria", "43"),
  entry("AZ", "Azerbaijan", "994"),
  entry("BS", "Bahamas", "1"),
  entry("BH", "Bahrain", "973"),
  entry("BD", "Bangladesh", "880"),
  entry("BB", "Barbados", "1"),
  entry("BY", "Belarus", "375"),
  entry("BE", "Belgium", "32"),
  entry("BZ", "Belize", "501"),
  entry("BJ", "Benin", "229"),
  entry("BM", "Bermuda", "1"),
  entry("BT", "Bhutan", "975"),
  entry("BO", "Bolivia", "591"),
  entry("BA", "Bosnia & Herzegovina", "387"),
  entry("BW", "Botswana", "267"),
  entry("BR", "Brazil", "55"),
  entry("VG", "British Virgin Islands", "1"),
  entry("BN", "Brunei", "673"),
  entry("BG", "Bulgaria", "359"),
  entry("BF", "Burkina Faso", "226"),
  entry("BI", "Burundi", "257"),
  entry("KH", "Cambodia", "855"),
  entry("CM", "Cameroon", "237"),
  entry("CA", "Canada", "1"),
  entry("CV", "Cape Verde", "238"),
  entry("KY", "Cayman Islands", "1"),
  entry("CF", "Central African Republic", "236"),
  entry("TD", "Chad", "235"),
  entry("CL", "Chile", "56"),
  entry("CN", "China", "86"),
  entry("CO", "Colombia", "57"),
  entry("KM", "Comoros", "269"),
  entry("CG", "Congo - Brazzaville", "242"),
  entry("CD", "Congo - Kinshasa", "243"),
  entry("CK", "Cook Islands", "682"),
  entry("CR", "Costa Rica", "506"),
  entry("CI", "Côte d'Ivoire", "225"),
  entry("HR", "Croatia", "385"),
  entry("CU", "Cuba", "53"),
  entry("CW", "Curaçao", "599"),
  entry("CY", "Cyprus", "357"),
  entry("CZ", "Czechia", "420"),
  entry("DK", "Denmark", "45"),
  entry("DJ", "Djibouti", "253"),
  entry("DM", "Dominica", "1"),
  entry("DO", "Dominican Republic", "1"),
  entry("EC", "Ecuador", "593"),
  entry("EG", "Egypt", "20"),
  entry("SV", "El Salvador", "503"),
  entry("GQ", "Equatorial Guinea", "240"),
  entry("ER", "Eritrea", "291"),
  entry("EE", "Estonia", "372"),
  entry("SZ", "Eswatini", "268"),
  entry("ET", "Ethiopia", "251"),
  entry("FO", "Faroe Islands", "298"),
  entry("FJ", "Fiji", "679"),
  entry("FI", "Finland", "358"),
  entry("FR", "France", "33"),
  entry("GF", "French Guiana", "594"),
  entry("PF", "French Polynesia", "689"),
  entry("GA", "Gabon", "241"),
  entry("GM", "Gambia", "220"),
  entry("GE", "Georgia", "995"),
  entry("DE", "Germany", "49"),
  entry("GH", "Ghana", "233"),
  entry("GI", "Gibraltar", "350"),
  entry("GR", "Greece", "30"),
  entry("GL", "Greenland", "299"),
  entry("GD", "Grenada", "1"),
  entry("GP", "Guadeloupe", "590"),
  entry("GU", "Guam", "1"),
  entry("GT", "Guatemala", "502"),
  entry("GN", "Guinea", "224"),
  entry("GW", "Guinea-Bissau", "245"),
  entry("GY", "Guyana", "592"),
  entry("HT", "Haiti", "509"),
  entry("HN", "Honduras", "504"),
  entry("HK", "Hong Kong", "852"),
  entry("HU", "Hungary", "36"),
  entry("IS", "Iceland", "354"),
  entry("IN", "India", "91"),
  entry("ID", "Indonesia", "62"),
  entry("IR", "Iran", "98"),
  entry("IQ", "Iraq", "964"),
  entry("IE", "Ireland", "353"),
  entry("IL", "Israel", "972"),
  entry("IT", "Italy", "39"),
  entry("JM", "Jamaica", "1"),
  entry("JP", "Japan", "81"),
  entry("JO", "Jordan", "962"),
  entry("KZ", "Kazakhstan", "7"),
  entry("KE", "Kenya", "254"),
  entry("KI", "Kiribati", "686"),
  entry("XK", "Kosovo", "383"),
  entry("KW", "Kuwait", "965"),
  entry("KG", "Kyrgyzstan", "996"),
  entry("LA", "Laos", "856"),
  entry("LV", "Latvia", "371"),
  entry("LB", "Lebanon", "961"),
  entry("LS", "Lesotho", "266"),
  entry("LR", "Liberia", "231"),
  entry("LY", "Libya", "218"),
  entry("LI", "Liechtenstein", "423"),
  entry("LT", "Lithuania", "370"),
  entry("LU", "Luxembourg", "352"),
  entry("MO", "Macao", "853"),
  entry("MG", "Madagascar", "261"),
  entry("MW", "Malawi", "265"),
  entry("MY", "Malaysia", "60"),
  entry("MV", "Maldives", "960"),
  entry("ML", "Mali", "223"),
  entry("MT", "Malta", "356"),
  entry("MH", "Marshall Islands", "692"),
  entry("MQ", "Martinique", "596"),
  entry("MR", "Mauritania", "222"),
  entry("MU", "Mauritius", "230"),
  entry("MX", "Mexico", "52"),
  entry("FM", "Micronesia", "691"),
  entry("MD", "Moldova", "373"),
  entry("MC", "Monaco", "377"),
  entry("MN", "Mongolia", "976"),
  entry("ME", "Montenegro", "382"),
  entry("MS", "Montserrat", "1"),
  entry("MA", "Morocco", "212"),
  entry("MZ", "Mozambique", "258"),
  entry("MM", "Myanmar", "95"),
  entry("NA", "Namibia", "264"),
  entry("NR", "Nauru", "674"),
  entry("NP", "Nepal", "977"),
  entry("NL", "Netherlands", "31"),
  entry("NC", "New Caledonia", "687"),
  entry("NZ", "New Zealand", "64"),
  entry("NI", "Nicaragua", "505"),
  entry("NE", "Niger", "227"),
  entry("NG", "Nigeria", "234"),
  entry("KP", "North Korea", "850"),
  entry("MK", "North Macedonia", "389"),
  entry("MP", "Northern Mariana Islands", "1"),
  entry("NO", "Norway", "47"),
  entry("OM", "Oman", "968"),
  entry("PK", "Pakistan", "92"),
  entry("PW", "Palau", "680"),
  entry("PS", "Palestine", "970"),
  entry("PA", "Panama", "507"),
  entry("PG", "Papua New Guinea", "675"),
  entry("PY", "Paraguay", "595"),
  entry("PE", "Peru", "51"),
  entry("PH", "Philippines", "63"),
  entry("PL", "Poland", "48"),
  entry("PT", "Portugal", "351"),
  entry("PR", "Puerto Rico", "1"),
  entry("QA", "Qatar", "974"),
  entry("RE", "Réunion", "262"),
  entry("RO", "Romania", "40"),
  entry("RU", "Russia", "7"),
  entry("RW", "Rwanda", "250"),
  entry("WS", "Samoa", "685"),
  entry("SM", "San Marino", "378"),
  entry("ST", "São Tomé & Príncipe", "239"),
  entry("SA", "Saudi Arabia", "966"),
  entry("SN", "Senegal", "221"),
  entry("RS", "Serbia", "381"),
  entry("SC", "Seychelles", "248"),
  entry("SL", "Sierra Leone", "232"),
  entry("SG", "Singapore", "65"),
  entry("SX", "Sint Maarten", "1"),
  entry("SK", "Slovakia", "421"),
  entry("SI", "Slovenia", "386"),
  entry("SB", "Solomon Islands", "677"),
  entry("SO", "Somalia", "252"),
  entry("ZA", "South Africa", "27"),
  entry("KR", "South Korea", "82"),
  entry("SS", "South Sudan", "211"),
  entry("ES", "Spain", "34"),
  entry("LK", "Sri Lanka", "94"),
  entry("KN", "St. Kitts & Nevis", "1"),
  entry("LC", "St. Lucia", "1"),
  entry("VC", "St. Vincent & Grenadines", "1"),
  entry("SD", "Sudan", "249"),
  entry("SR", "Suriname", "597"),
  entry("SE", "Sweden", "46"),
  entry("CH", "Switzerland", "41"),
  entry("SY", "Syria", "963"),
  entry("TW", "Taiwan", "886"),
  entry("TJ", "Tajikistan", "992"),
  entry("TZ", "Tanzania", "255"),
  entry("TH", "Thailand", "66"),
  entry("TL", "Timor-Leste", "670"),
  entry("TG", "Togo", "228"),
  entry("TO", "Tonga", "676"),
  entry("TT", "Trinidad & Tobago", "1"),
  entry("TN", "Tunisia", "216"),
  entry("TR", "Türkiye", "90"),
  entry("TM", "Turkmenistan", "993"),
  entry("TC", "Turks & Caicos Islands", "1"),
  entry("TV", "Tuvalu", "688"),
  entry("UG", "Uganda", "256"),
  entry("UA", "Ukraine", "380"),
  entry("AE", "United Arab Emirates", "971"),
  entry("GB", "United Kingdom", "44"),
  entry("US", "United States", "1"),
  entry("UY", "Uruguay", "598"),
  entry("UZ", "Uzbekistan", "998"),
  entry("VU", "Vanuatu", "678"),
  entry("VE", "Venezuela", "58"),
  entry("VN", "Vietnam", "84"),
  entry("YE", "Yemen", "967"),
  entry("ZM", "Zambia", "260"),
  entry("ZW", "Zimbabwe", "263"),
];

const byIso = new Map(COUNTRIES.map((country) => [country.iso, country]));

/** Preferred owner of a shared calling code when matching by dial prefix. */
const DIAL_PRIORITY: Record<string, string> = { "1": "US", "7": "RU" };

/** Fallback when the device locale has no usable region. */
const FALLBACK_ISO = "SE";

/** The country matching the device locale's region, or the fallback. */
export const defaultCountry = (): Country => {
  const region = getLocales()[0]?.regionCode?.toUpperCase();
  return (
    (region ? byIso.get(region) : undefined) ?? byIso.get(FALLBACK_ISO)!
  );
};

/**
 * Match a full international number ("+4670…", digits after "+") to the
 * country owning its longest dial-code prefix. `current` wins ties so a
 * Canadian selection survives a "+1…" paste.
 */
export const countryForNumber = (
  digits: string,
  current?: Country,
): Country | null => {
  let best: Country | null = null;
  for (const country of COUNTRIES) {
    if (!digits.startsWith(country.dial)) continue;
    if (!best || country.dial.length > best.dial.length) {
      best = country;
    }
  }
  if (!best) return null;
  if (current?.dial === best.dial) return current;
  const preferred = DIAL_PRIORITY[best.dial];
  return (preferred && byIso.get(preferred)) || best;
};
