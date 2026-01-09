import { VehicleChange, PriceChange, NewArrival, VehicleRemoved } from './types';

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

*${vehicle.model}*
📍 ${vehicle.location}
📋 ${vehicle.variant}
💰 ${formatPrice(previousPrice, vehicle.currency)} → ${formatPrice(currentPrice, vehicle.currency)} (${changeSign}${changeFormatted})

[View on Tesla](${vehicle.url})`;
}

function formatNewArrival(arrival: NewArrival): string {
  const { vehicle } = arrival;

  return `🆕 *New Vehicle Available!*

*${vehicle.model}*
📍 ${vehicle.location}
📋 ${vehicle.variant}

[View on Tesla](${vehicle.url})`;
}

function formatRemoved(removed: VehicleRemoved): string {
  const { vehicle } = removed;

  return `❌ *Vehicle No Longer Available*

*${vehicle.model}*
📍 ${vehicle.location}
📋 ${vehicle.variant}

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
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set!');
    return;
  }
  if (!chatId) {
    console.error('TELEGRAM_CHAT_ID is not set!');
    return;
  }

  // Validate chat ID is a number
  if (chatId.includes(':')) {
    console.error('TELEGRAM_CHAT_ID looks like a bot token! Chat ID should be just a number like 123456789');
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Telegram API error:', JSON.stringify(result));
      throw new Error(`Telegram API error: ${JSON.stringify(result)}`);
    }

    console.log('Telegram message sent successfully');
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
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
