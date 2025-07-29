import { NextResponse } from "next/server";
import { connectDB } from '../../../lib/connectDB';

// Interface for the API response
export interface Influencer {
  id: string;
  name: string;
  followers: number;
  avatar: string;
  recentMonthSignals: number;
  recentMonthTokens: number;
  specialties: string[];
  monthlyROI: number;
}

// Helper function to parse P&L percentage string to number
function parsePnLPercentage(pnlString: string): number {
  if (!pnlString || typeof pnlString !== 'string') return 0;
  // Remove the % sign and convert to number
  const numericValue = parseFloat(pnlString.replace('%', ''));
  return isNaN(numericValue) ? 0 : numericValue;
}

export async function GET() {
  console.time('top-monthly-influencers-api');
  
  try {
    // Connect to DB once and reuse the connection
    const client = await connectDB();
    const backtestingDb = client.db("backtesting_db");
    const ctxbtDb = client.db("ctxbt-signal-flow");
    
    // Get collections
    const backtestingResultsCollection = backtestingDb.collection("backtesting_results_with_reasoning");
    const ctxbtCollection = ctxbtDb.collection("influencers");
    const tradingSignalsCollection = ctxbtDb.collection("trading-signals");

    // Calculate month start date (30 days ago from now)
    const currentDate = new Date();
    const monthStartDate = new Date();
    monthStartDate.setDate(currentDate.getDate() - 30);

    console.time('fetch-monthly-backtesting-results');
    // Fetch all backtesting results from the last month with completed backtesting
    const monthlyBacktestingResults = await backtestingResultsCollection
      .find({
        "Signal Generation Date": {
          $gte: monthStartDate,
          $lte: currentDate
        },
        "backtesting_done": true,
        "Final P&L": { $exists: true, $ne: "" }
      }, { 
        projection: { 
          "Twitter Account": 1, 
          "Final P&L": 1, 
          "Token Mentioned": 1,
          "Signal Generation Date": 1,
          _id: 0 
        } 
      })
      .toArray();
    console.timeEnd('fetch-monthly-backtesting-results');

    if (!monthlyBacktestingResults.length) {
      return NextResponse.json(
        { error: "No monthly backtesting results found" },
        { status: 404 }
      );
    }

    // Aggregate P&L data by influencer
    const monthlyPnlData: { [key: string]: number } = {};
    const signalCountByInfluencer: { [key: string]: number } = {};
    const tokensByInfluencer: { [key: string]: Set<string> } = {};
    
    monthlyBacktestingResults.forEach(result => {
      const twitterAccount = result["Twitter Account"];
      const finalPnL = parsePnLPercentage(result["Final P&L"]);
      const tokenMentioned = result["Token Mentioned"];
      
      if (!twitterAccount) return;
      
      // Initialize if not exists
      if (!monthlyPnlData[twitterAccount]) {
        monthlyPnlData[twitterAccount] = 0;
        signalCountByInfluencer[twitterAccount] = 0;
        tokensByInfluencer[twitterAccount] = new Set();
      }
      
      // Accumulate P&L and count signals
      monthlyPnlData[twitterAccount] += finalPnL;
      signalCountByInfluencer[twitterAccount] += 1;
      
      // Track unique tokens
      if (tokenMentioned) {
        tokensByInfluencer[twitterAccount].add(tokenMentioned);
      }
    });

    // Get all influencer handles for profile data fetching
    const allInfluencerHandles = Object.keys(monthlyPnlData);

    // Fetch influencer profile data
    console.time('fetch-influencer-data');
    const influencerData = await ctxbtCollection.find(
      { twitterHandle: { $in: allInfluencerHandles } },
      { 
        projection: { 
          twitterHandle: 1, 
          "userData.publicMetrics.followers_count": 1, 
          "userData.userProfileUrl": 1,
          subscriptionPrice: 1,
          _id: 0
        } 
      }
    ).toArray();
    console.timeEnd('fetch-influencer-data');

    // Calculate average ROI per signal for each influencer and get top performers
    const influencersWithROI = Object.entries(monthlyPnlData)
      .map(([twitterHandle, totalPnl]) => {
        const signalCount = signalCountByInfluencer[twitterHandle] || 0;
        const averageROI = signalCount > 0 ? (totalPnl / signalCount) : 0;
        
        return {
          name: twitterHandle,
          totalPnl: Number(totalPnl),
          signalCount,
          averageROI
        };
      })
      .sort((a, b) => b.averageROI - a.averageROI) // Sort by average ROI per signal
      .slice(0, 6); // Get top 6 by average ROI

    // Create lookup map for influencer data
    const influencerMap = new Map();
    influencerData.forEach(doc => {
      influencerMap.set(doc.twitterHandle, doc);
    });

    // Calculate overall average ROI (average of all top influencers' average ROIs)
    const overallAverageROI = influencersWithROI.reduce((sum, inf) => sum + inf.averageROI, 0) / influencersWithROI.length;

    // Assemble final response data
    const result = influencersWithROI.map((influencer, index) => {
      const influencerDoc = influencerMap.get(influencer.name);
      if (!influencerDoc) return null;

      return {
        id: `inf${index + 1}`,
        name: influencer.name,
        followers: influencerDoc.userData?.publicMetrics?.followers_count || 0,
        avatar: influencerDoc.userData?.userProfileUrl || "https://via.placeholder.com/150",
        recentMonthSignals: influencer.signalCount,
        recentMonthTokens: tokensByInfluencer[influencer.name]?.size || 0,
        subscriptionPrice: influencerDoc.subscriptionPrice,
        specialties: ['Crypto Analysis', 'Trading Signals'], // Default specialties
        monthlyROI: influencer.averageROI
      };
    }).filter(Boolean);

    console.timeEnd('top-monthly-influencers-api');
    return NextResponse.json(
      {
        influencers: result,
        totalProfit: overallAverageROI, // This is now the overall average ROI
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching influencers:", error);
    console.timeEnd('top-monthly-influencers-api');
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}