import {Weather} from './barmejliLogic';

const cache = new Map<string, {expiresAt: number; value: Weather}>();

const summaryFor = (code: number, rain: number) => rain >= 50 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)
  ? 'Pluie prévue'
  : code <= 1 ? 'Ciel dégagé' : code <= 3 ? 'Partiellement nuageux' : 'Conditions variables';

export async function getForecast(latitude: number, longitude: number, at: Date): Promise<Weather> {
  const hour = at.toISOString().slice(0, 13);
  const key = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${hour}`;
  const remembered = cache.get(key);
  if (remembered && remembered.expiresAt > Date.now()) return remembered.value;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '16');
  const response = await fetch(url, {signal: AbortSignal.timeout(4_000)});
  if (!response.ok) throw Object.assign(new Error('Prévisions météo temporairement indisponibles'), {statusCode: 503});
  const data = await response.json() as any;
  const target = at.getTime();
  let index = 0;
  let delta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < (data.hourly?.time?.length ?? 0); i++) {
    const current = Math.abs(new Date(data.hourly.time[i]).getTime() - target);
    if (current < delta) { index = i; delta = current; }
  }
  const precipitationProbability = Number(data.hourly.precipitation_probability[index] ?? 0);
  const precipitationMm = Number(data.hourly.precipitation[index] ?? 0);
  const windKph = Number(data.hourly.wind_speed_10m[index] ?? 0);
  const weatherCode = Number(data.hourly.weather_code[index] ?? 0);
  const value: Weather = {
    observedAt: new Date(data.hourly.time[index]).toISOString(),
    temperatureC: Number(data.hourly.temperature_2m[index] ?? 20),
    precipitationProbability,
    precipitationMm,
    windKph,
    weatherCode,
    summary: summaryFor(weatherCode, precipitationProbability),
    adverse: precipitationProbability >= 45 || precipitationMm >= 0.5 || windKph >= 45 || [65, 82, 95, 96, 99].includes(weatherCode),
  };
  cache.set(key, {expiresAt: Date.now() + 15 * 60_000, value});
  return value;
}

export function weatherChanged(before: Weather, after: Weather) {
  return before.adverse !== after.adverse || Math.abs(before.precipitationProbability - after.precipitationProbability) >= 25 || Math.abs(before.temperatureC - after.temperatureC) >= 6;
}
