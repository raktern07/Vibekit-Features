import { NextResponse } from "next/server";
import { connectDB } from '../../../lib/connectDB';

interface Tweet {
  id: string;
  influencer: {
    name: string;
    handle: string;
    avatar: string;
  };
  coin: string;
  tokenId: string;
  positive: boolean;
  pnl: number;
  timestamp: string;
}

export async function GET() {
  console.time("top-crypto-tweets-api");

  try {
    // Fetch top influencers via API call
    console.time("fetch-top-influencers");
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || ""}/api/top-weekly-influencers-data`
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch top weekly influencers: ${response.statusText}`
      );
    }

    const { influencers } = await response.json();
    console.timeEnd("fetch-top-influencers");

    if (!influencers?.length) {
      return NextResponse.json({ tweets: [] }, { status: 200 });
    }

    // Extract Twitter handles and create map in one pass
    const twitterHandles: string[] = [];
    const influencerMap = new Map();

    for (const influencer of influencers) {
      if (influencer.name) {
        twitterHandles.push(influencer.name);
        influencerMap.set(influencer.name, influencer);
      }
    }

    if (twitterHandles.length === 0) {
      return NextResponse.json({ tweets: [] }, { status: 200 });
    }

    // Connect to database - only do this after confirming we have data to query
    const client = await connectDB();
    const backtestingCollection = client
      .db("backtesting_db")
      .collection("backtesting_results_with_reasoning");

    // Fetch all backtesting results in a single query with minimal projection
    console.time("fetch-backtesting-results");
    const allResults = await backtestingCollection
      .find(
        { "Twitter Account": { $in: twitterHandles } },
        {
          projection: {
            "Twitter Account": 1,
            "Final P&L": 1,
            "Token Mentioned": 1,
            "Token ID": 1,
            "Tweet Date": 1,
            _id: 1,
          },
        }
      )
      .toArray();
    console.timeEnd("fetch-backtesting-results");

    // Process results more efficiently using Map
    const resultsByInfluencer = new Map();

    for (const result of allResults) {
      const account = result["Twitter Account"];
      if (!resultsByInfluencer.has(account)) {
        resultsByInfluencer.set(account, []);
      }

      // Parse PnL value once during initial processing
      let pnlValue;
      try {
        const pnlString = String(result["Final P&L"] || "0").replace("%", "");
        pnlValue = parseFloat(pnlString);
        if (isNaN(pnlValue)) pnlValue = 0;
      } catch (e) {
        pnlValue = 0;
      }

      // Store pre-processed result with parsed PnL
      resultsByInfluencer.get(account).push({
        ...result,
        parsedPnl: pnlValue,
      });
    }

    // Find the top result for each influencer
    const tweets: Tweet[] = [];

    for (const handle of twitterHandles) {
      const results = resultsByInfluencer.get(handle);
      if (!results || results.length === 0) continue;

      // Sort only the results for this influencer
      results.sort((a: any, b: any) => b.parsedPnl - a.parsedPnl);
      const topResult = results[0];

      tweets.push({
        id: topResult._id.toString(),
        influencer: {
          name: handle,
          handle: handle,
          avatar: influencerMap.get(handle)?.avatar || "",
        },
        coin: topResult["Token Mentioned"] || "",
        tokenId: topResult["Token ID"] || "",
        positive: topResult.parsedPnl > 0,
        pnl: topResult.parsedPnl,
        timestamp: topResult["Tweet Date"] || new Date().toISOString(),
      });
    }

    console.timeEnd("top-crypto-tweets-api");
    return NextResponse.json({ tweets }, { status: 200 });
  } catch (error) {
    console.error("Error fetching crypto tweets:", error);
    console.timeEnd("top-crypto-tweets-api");
    return NextResponse.json(
      { error: "Internal server error", message: error },
      { status: 500 }
    );
  }
}
