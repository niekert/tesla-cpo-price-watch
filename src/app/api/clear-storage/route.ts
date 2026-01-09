import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Require secret for protection
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
