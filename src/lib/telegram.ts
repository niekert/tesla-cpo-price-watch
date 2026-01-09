import { VehicleChange, PriceChange, NewArrival, VehicleRemoved } from './types';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatPriceChange(change: PriceChange): string {
  const { vehicle, previousPrice, currentPrice, changeAmount } = change;
  const isDropping = change.type === 'price_drop';

  const emoji = isDropping ? '📉' : '📈';
  const title = isDropping ? 'Price Drop Alert!' : 'Price Increase';
  const changeSign = isDropping ? '-' : '+';
  const changeFormatted = formatPrice(Math.abs(changeAmount), vehicle.currency);

  return `${emoji} *${title}*

*${vehicle.model}* - ${vehicle.variant}
📍 ${vehicle.location}
💰 ${formatPrice(previousPrice, vehicle.currency)} → ${formatPrice(currentPrice, vehicle.currency)} (${changeSign}${changeFormatted})
🚗 ${vehicle.mileage.toLocaleString('nl-NL')} km

[View on Tesla](${vehicle.url})`;
}

function formatNewArrival(arrival: NewArrival): string {
  const { vehicle } = arrival;

  return `🆕 *New Vehicle Available!*

*${vehicle.model}* - ${vehicle.variant}
📍 ${vehicle.location}
💰 ${formatPrice(vehicle.price, vehicle.currency)}
🚗 ${vehicle.mileage.toLocaleString('nl-NL')} km

[View on Tesla](${vehicle.url})`;
}

function formatRemoved(removed: VehicleRemoved): string {
  const { vehicle } = removed;

  return `❌ *Vehicle No Longer Available*

*${vehicle.model}* - ${vehicle.variant}
📍 ${vehicle.location}
💰 ${formatPrice(vehicle.price, vehicle.currency)}

_This vehicle was removed from inventory_`;
}

function formatMessage(change: VehicleChange): string {
  switch (change.type) {
    case 'price_drop':
    case 'price_increase':
      return formatPriceChange(change);
    case 'new_arrival':
      return formatNewArrival(change);
    case 'removed':
      return formatRemoved(change);
  }
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
}

export async function sendNotification(change: VehicleChange): Promise<void> {
  const message = formatMessage(change);
  await sendTelegramMessage(message);
}

export async function sendNotifications(changes: VehicleChange[]): Promise<void> {
  // Send notifications sequentially to avoid rate limits
  for (const change of changes) {
    await sendNotification(change);
    // Small delay between messages
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function sendStartupMessage(): Promise<void> {
  await sendTelegramMessage(
    `🚀 *Tesla Price Watcher Started*\n\nMonitoring Tesla inventory for price changes...`
  );
}

export async function sendErrorMessage(error: string): Promise<void> {
  await sendTelegramMessage(`⚠️ *Error*\n\n${error}`);
}
