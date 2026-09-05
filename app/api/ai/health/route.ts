import { NextResponse } from 'next/server';
import { aiService } from '@/services/ai';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const report = await aiService.getHealthReport();
        return NextResponse.json(report);
    } catch (error: any) {
        return NextResponse.json(
            {
                status: 'error',
                message: error.message || 'Failed to check AI health',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
