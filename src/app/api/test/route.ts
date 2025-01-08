import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://192.168.1.188:6767';
        const response = await fetch(`${backendUrl}/health`);
        
        if (!response.ok) {
            throw new Error(`Backend health check failed: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json({ 
            status: 'ok',
            backendStatus: data,
            backendUrl
        });
    } catch (error: any) {
        console.error('Test endpoint error:', error);
        return NextResponse.json({ 
            status: 'error',
            error: error.message,
            backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://192.168.1.188:6767'
        }, { status: 500 });
    }
} 