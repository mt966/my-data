import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { industries, targetCountries, searchQueries } from './industry-config.mjs';

// Prevent MaxListenersExceededWarning
process.setMaxListeners(0);

const POTENTIAL_LEADS_PATH = './potential_leads.json';
const SCRAPED_DOMAINS_PATH = './scraped_domains.json';

// Start fresh for hyper-targeted run
if (fs.existsSync(POTENTIAL_LEADS_PATH)) {
    fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify([], null, 2));
}

let globalScraped = new Set();
if (fs.existsSync(SCRAPED_DOMAINS_PATH)) {
    globalScraped = new Set(JSON.parse(fs.readFileSync(SCRAPED_DOMAINS_PATH, 'utf8')));
}

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0'
];

async function harvestDomains(query, industry, country, page = 0) {
    const offset = page * 10 + 1;
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}&first=${offset}`;
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': randomUA, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.bing.com/' },
            timeout: 25000
        });

        const $ = cheerio.load(res.data);
        const newLeads = [];

        if ($('.b_algo').length === 0) return null;

        $('.b_algo').each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const website = $(el).find('h2 a').attr('href');
            const snippet = $(el).find('.b_caption p, .b_lineclamp3, .b_algoSlug').text().toLowerCase();
            
            if (website && website.startsWith('http')) {
                try {
                    const domain = new URL(website).hostname.toLowerCase();
                    
                    // --- ULTRA-STRICT BLACKLIST (No competitors, No News, No Directories) ---
                    const hardBlacklist = ['amazon', 'walmart', 'ebay', 'alibaba', 'indiamart', 'tradeindia', 'wikipedia', 'facebook', 'instagram', 'linkedin', 'youtube', 'pinterest', 'google', 'bing', 'yahoo', 'marketresearch', 'globenewswire', 'businesswire', 'prnewswire', 'investor', 'news', 'blog', 'forum', 'yellowpages', 'europages', 'thomasnet', 'kompass', 'directindustry', 'panjiva', 'importgenius'];
                    if (hardBlacklist.some(bad => domain.includes(bad))) return;

                    // --- HCO SPECIALIST SCORING (ZERO WASTE LOGIC) ---
                    let score = 0;
                    const lowTitle = title.toLowerCase();
                    const lowSnippet = snippet.toLowerCase();

                    // Tier 1 Priority (+15)
                    const tier1 = ["lubricant", "grease", "paint", "coating", "plastic", "polymer"];
                    if (tier1.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score += 15;

                    // HCO Specific Signals (+25) - The Holy Grail
                    const hcoWords = ['hydrogenated castor oil', 'castor wax', '12 hydroxy stearic acid', '12-hsa', 'hco', 'oleochemical', 'fatty acid', 'stearic acid'];
                    hcoWords.forEach(kw => {
                        if (lowTitle.includes(kw) || lowSnippet.includes(kw)) score += 25;
                    });

                    // Buyer Intent (+10)
                    const buyerIntent = ['procurement', 'purchasing', 'buyer', 'sourcing', 'raw material', 'importer', 'rfq', 'inquiry', 'enquiry'];
                    buyerIntent.forEach(kw => {
                        if (lowTitle.includes(kw)) score += 10;
                        if (lowSnippet.includes(kw)) score += 5;
                    });

                    // Factory/Manufacturer Signal (+5)
                    const factorySignal = ['manufacturer', 'factory', 'plant', 'production', 'facility'];
                    if (factorySignal.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score += 5;

                    // COMPETITOR PENALTY (-100) - Instant Reject
                    const competitors = ['exporter from india', 'indian supplier', 'exporter india', 'india chemicals', 'export from india'];
                    if (competitors.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score -= 100;

                    // STRICT THRESHOLD: Must have multiple industrial/intent signals
                    if (score < 10) return;

                    let cName = title.split(/ - | \| |: /)[0].trim();
                    if (cName.toLowerCase().includes('home') || cName.length > 30) {
                        cName = domain.replace(/^www\./, '').split('.')[0].toUpperCase();
                    }

                    newLeads.push({ name: cName, country, website, industry, score });
                } catch(e) {}
            }
        });

        return newLeads;
    } catch (err) { return []; }
}

async function startSniper() {
    console.log('🎯 STARTING ULTRA-STRICT HCO SNIPER (QUALITY MODE)...');
    const allIndustryItems = industries.flatMap(c => c.items);
    const potentialLeads = [];

    const startTime = Date.now();
    const MAX_RUN_TIME = 60 * 60 * 1000; // 1 hour balanced run

    for (const industry of allIndustryItems) {
        if (Date.now() - startTime > MAX_RUN_TIME) break;
        
        for (const country of targetCountries) {
            if (Date.now() - startTime > MAX_RUN_TIME) break;
            
            console.log(`🚀 Searching ${industry} in ${country}...`);
            for (const qBase of searchQueries) {
                const query = `${industry} ${qBase}`;
                for (let page = 0; page < 3; page++) {
                    const leads = await harvestDomains(query, industry, country, page);
                    if (leads === null || (leads && leads.length === 0)) break;

                    leads.forEach(l => {
                        if (!globalScraped.has(l.website)) {
                            potentialLeads.push(l);
                        }
                    });
                    
                    // Progressive Save
                    fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        }
    }
    console.log(`✨ SNIPER COMPLETED. Found ${potentialLeads.length} High-Intent Leads.`);
}

startSniper();
