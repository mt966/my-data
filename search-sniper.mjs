import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { industries, targetCountries, searchQueries } from './industry-config.mjs';

// Prevent MaxListenersExceededWarning
process.setMaxListeners(0);

const POTENTIAL_LEADS_PATH = './potential_leads.json';
const MASTER_CSV_PATH = './international_industry_leads.csv';
const SCRAPED_DOMAINS_PATH = './scraped_domains.json';

// Load existing leads to avoid duplicates
let potentialLeads = [];
// FORCE CLEAR JUNK DATA: We start fresh with strict B2B rules
if (fs.existsSync(POTENTIAL_LEADS_PATH)) {
    fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify([], null, 2));
}

const existingWebsites = new Set(potentialLeads.map(l => l.website));

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (AppleWebKit/537.36; KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

let globalScraped = new Set();
if (fs.existsSync(SCRAPED_DOMAINS_PATH)) {
    globalScraped = new Set(JSON.parse(fs.readFileSync(SCRAPED_DOMAINS_PATH, 'utf8')));
}

async function harvestDomains(query, industry, country, page = 0) {
    const offset = page * 10 + 1;
    console.log(`🔍 Searching: "${query}" in ${country} (Page ${page + 1})...`);
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}&first=${offset}`;

        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': randomUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.bing.com/',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000
        });

        const $ = cheerio.load(res.data);
        const newLeads = [];

        if ($('.b_algo').length === 0) {
            console.log(`   ⚠️ No results or blocked by Bing. Breaking pagination.`);
            return null; // Signal to break pagination loop
        }

        $('.b_algo').each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const website = $(el).find('h2 a').attr('href');
            const snippet = $(el).find('.b_caption p, .b_lineclamp3, .b_algoSlug').text().toLowerCase();
            
            if (website && website.startsWith('http')) {
                try {
                    const domain = new URL(website).hostname.toLowerCase();
                    
                    // --- B2C BLACKLIST ---
                    const b2cBlacklist = ['amazon', 'walmart', 'target', 'ebay', 'alibaba', 'aliexpress', 'indiamart', 'tradeindia', 'homedepot', 'lowes', 'sephora', 'ulta', 'macys', 'cvs', 'walgreens', 'sherwin-williams', 'behr', 'menards', 'acehardware', 'flipkart', 'shopee', 'lazada', 'jd.com', 'taobao', 'wayfair', 'bestbuy', 'costco', 'nordstrom', 'maccosmetics', 'dir.indiamart', 'europages', 'justdial', 'wikipedia', 'facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'pinterest'];
                    
                    let isBlacklisted = b2cBlacklist.some(bad => domain.includes(bad));

                if (!isBlacklisted && !existingWebsites.has(website) && !globalScraped.has(website)) {
                    const lowTitle = title.toLowerCase();
                    const lowSnippet = snippet.toLowerCase();
                    
                    // --- SMART SCORING SYSTEM (Replaces Strict Reject) ---
                    let score = 0;
                    const b2bKeywords = ['factory', 'plant', 'manufacturer', 'supplier', 'distributor', 'wholesale', 'industrial', 'chemical', 'chemicals', 'export', 'exporter', 'trading', 'trader', 'bulk', 'import', 'buyer', 'procurement', 'production', 'materials', 'solutions', 'lubricant', 'coating', 'polymer', 'resin'];
                    const junkKeywords = ['news', 'sport', 'league', 'score', 'results', 'weather', 'movie', 'song', 'lyrics', 'blog', 'forum', 'wiki', 'magazine', 'newspaper', 'review', 'retail', 'price-list', 'pdf', 'download'];
                    
                    // Score for B2B signals
                    b2bKeywords.forEach(kw => {
                        if (lowTitle.includes(kw)) score += 2;
                        if (lowSnippet.includes(kw)) score += 1;
                    });

                    // Match Full Industry Words
                    const industryWords = industry.toLowerCase().replace(/&/g, '').split(/\s+/);
                    industryWords.forEach(word => {
                        if (word.length > 3 && (lowTitle.includes(word) || lowSnippet.includes(word))) score += 3;
                    });

                    // Penalize Junk
                    junkKeywords.forEach(kw => {
                        if (lowTitle.includes(kw) || lowSnippet.includes(kw)) score -= 10;
                    });

                    if (score < 2) {
                        console.log(`      ⏩ Low Score (${score}): skipping "${title}"`);
                        return;
                    }

                    let cName = title.split(/ - | \| |: /)[0].trim();
                    // Fallback to domain name if title is generic or too long (e.g. blog post title)
                    if (cName.toLowerCase().includes('home') || cName.length > 30) {
                        try {
                            cName = new URL(website).hostname.replace(/^www\./, '').split('.')[0].toUpperCase();
                        } catch (e) { cName = "Unknown"; }
                    }
                    newLeads.push({
                        name: cName,
                        country: country,
                        website: website,
                        industry: industry
                    });
                    existingWebsites.add(website);
                }
                } catch(e) {}
            }
        });

        return newLeads;
    } catch (err) {
        console.error(`   ❌ Search failed for [${query}] Page ${page + 1}: ${err.message}`);
        return [];
    }
}

// Helper to rotate countries
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function startSniper() {
    console.log('🎯 STARTING GLOBAL SEARCH SNIPER (BATCH MODE)...');
    // Flatten industries and shuffle
    const allIndustryItems = shuffle(industries.flatMap(c => c.items));

    // FULL PRODUCTION: All countries, shuffled
    const countriesToSearch = shuffle([...targetCountries]);
    console.log(`🎯 TARGETING: ${countriesToSearch.length} Countries for ${allIndustryItems.length} Industries`);

    // PRODUCTION LIMIT: 60 minutes for high-volume B2B data
    const MAX_RUN_TIME_MS = 60 * 60 * 1000;
    const startTime = Date.now();
    let timeLimitReached = false;

    // Parallel Processing: Process 3 countries at once
    const COUNTRY_BATCH_SIZE = 3; 

    for (const industry of allIndustryItems) {
        if (timeLimitReached) break;
        
        for (let i = 0; i < countriesToSearch.length; i += COUNTRY_BATCH_SIZE) {
            if (timeLimitReached) break;
            if (Date.now() - startTime > MAX_RUN_TIME_MS) {
                console.log(`⏱️ Time limit of 60 minutes reached. Stopping sniper...`);
                timeLimitReached = true;
                break;
            }

            const countryBatch = countriesToSearch.slice(i, i + COUNTRY_BATCH_SIZE);
            console.log(`\n🚀 Parallel Batch: Searching ${industry} in [${countryBatch.join(', ')}]`);

            await Promise.all(countryBatch.map(async (country) => {
                const shuffledQueries = shuffle([...searchQueries]);
                for (const qBase of shuffledQueries) {
                    if (timeLimitReached) break;
                    
                    try {
                        const fullQuery = `${industry} ${qBase}`;
                        for (let page = 0; page < 3; page++) { // Faster depth: 3 pages instead of 5
                            const leads = await harvestDomains(fullQuery, industry, country, page);
                            if (leads === null || (leads && leads.length === 0)) break;

                            if (leads && leads.length > 0) {
                                potentialLeads.push(...leads);
                                console.log(`   ✅ [${country}] Found ${leads.length} leads for ${industry}`);
                                fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
                            }
                            await new Promise(r => setTimeout(r, 4000)); // Safer delay for parallel
                        }
                    } catch (err) {}
                }
            }));
        }
    }

    console.log(`✨ SNIPER COMPLETED. Total potential leads: ${potentialLeads.length}`);
}

startSniper();
