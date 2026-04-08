const COUNTRY_LOOKUP_URLS = [
    "https://ipwho.is/",
    "https://ipapi.co/json/",
    "https://api.country.is/",
];
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export interface UserCountry {
    countryCode: string | null;
    countryName: string | null;
}

const UNKNOWN_COUNTRY: UserCountry = {countryCode: null, countryName: null};

function normaliseCountryCode(countryCode: string | null | undefined): string | null {
    if (!countryCode) {
        return null;
    }
    const cleanCode = countryCode.trim().toUpperCase();
    return COUNTRY_CODE_PATTERN.test(cleanCode) ? cleanCode : null;
}

function getCountryFromLocale(): UserCountry {
    const locales = [...navigator.languages, navigator.language].filter(Boolean);
    for (const locale of locales) {
        const region = locale.split("-")[1];
        const countryCode = normaliseCountryCode(region);
        if (!countryCode) {
            continue;
        }
        const countryName = typeof Intl.DisplayNames !== "undefined"
            ? new Intl.DisplayNames(["en"], {type: "region"}).of(countryCode) || null
            : null;
        return {countryCode, countryName};
    }
    return UNKNOWN_COUNTRY;
}

export async function fetchUserCountry(): Promise<UserCountry> {
    for (const lookupUrl of COUNTRY_LOOKUP_URLS) {
        try {
            const response = await fetch(lookupUrl, {
                method: "GET",
                headers: {"Accept": "application/json"},
            });
            if (!response.ok) {
                continue;
            }
            const geoPayload = await response.json() as {
                success?: boolean;
                country?: string;
                country_code?: string;
                country_name?: string;
            };
            if (geoPayload.success === false) {
                continue;
            }

            const countryCode = normaliseCountryCode(geoPayload.country_code || geoPayload.country);
            const countryName = (geoPayload.country_name || geoPayload.country)?.trim() || null;
            if (!countryCode) {
                continue;
            }
            return {countryCode, countryName};
        }
        catch {
            // Try next provider.
        }
    }
    return getCountryFromLocale();
}
