import countryPricingData from '../data/countryPricingData';

/** Get full pricing data for a country (products, headers, pricing model, etc.) */
export function getCountryPricing(countryName) {
  return countryPricingData.find(
    (c) => c.country === countryName
  ) || null;
}

/** Get region/person/pricing model info for any of the 26 countries */
export function getPricingInfo(countryName) {
  const data = getCountryPricing(countryName);
  if (data) return data;

  // For countries without product sheets, check the directory info
  for (const entry of countryPricingData) {
    if (entry.country === countryName) return entry;
  }
  return null;
}

/** List of country names that have detailed product pricing */
export function getCountriesWithPricing() {
  return countryPricingData.map((c) => c.country);
}

/** Check if a country has detailed product pricing */
export function hasProductPricing(countryName) {
  return countryPricingData.some((c) => c.country === countryName);
}

export { countryPricingData };
