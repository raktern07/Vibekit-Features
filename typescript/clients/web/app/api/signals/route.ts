import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '../../../lib/connectDB';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let client;

  try {
    console.log('API: Starting signals fetch...');

    // Check if MongoDB URI is available
    if (!process.env.MONGODB_URI) {
      console.error('API: MONGODB_URI not found in environment variables');
      return NextResponse.json(
        {
          success: false,
          error: 'Database configuration error',
          message: 'MongoDB URI not configured',
        },
        { status: 500 }
      );
    }

    // Connect to MongoDB
    client = await connectDB();
    const db = client.db();

    console.log('API: Connected to database');

    // Get the collection (adjust collection name as needed)
    const collection = db.collection('trading-signals'); // Replace 'signals' with your actual collection name

    // Fetch latest 5 records sorted by generatedAt in descending order
    const latestSignals = await collection
      .find({})
      .sort({ generatedAt: -1 }) // Sort by generatedAt descending (latest first)
      .limit(5)
      .toArray();

    console.log(`API: Found ${latestSignals.length} signals`);

    // Return successful response
    return NextResponse.json(
      {
        success: true,
        data: latestSignals,
        count: latestSignals.length,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching latest signals:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch latest signals',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    // Always close the database connection
    if (client) {
      try {
        await client.close();
        console.log('API: Database connection closed');
      } catch (closeError) {
        console.error('API: Error closing database connection:', closeError);
      }
    }
  }
}
