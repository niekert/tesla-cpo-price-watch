import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

export async function POST() {
  const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });

  try {
    // Get all vehicle VINs
    const vins = await redis.smembers('vehicles');

    // Delete each vehicle
    for (const vin of vins) {
      await redis.del(`vehicle:${vin}`);
    }

    // Delete the vehicles set
    await redis.del('vehicles');

    return NextResponse.json({
      success: true,
      message: `Cleared ${vins.length} vehicles from storage`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
