import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { industries, targetCountries, searchQueries } from './industry-config.mjs';

process.setMaxListeners(0);

const POTENTIAL_LEADS_PATH = './potential_leads.json';
const SCRAPED_DOMAINS_PATH = './scraped_domains.json';

// Persistent memory
let potentialLeads = [];
if (fs.existsSync(POTENTIAL_LEADS_PATH)) {
    try { potentialLeads = JSON.parse(fs.readFileSync(POTENTIAL_LEADS_PATH, 'utf8')); } catch(e) {}
}

let globalScraped = new Set();
if (fs.existsSync(SCRAPED_DOMAINS_PATH)) {
    try { globalScraped = new Set(JSON.parse(fs.readFileSync(SCRAPED_DOMAINS_PATH, 'utf8'))); } catch(e) {}
}

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];

async function harvestDomains(query, industry, country, page = 0) {
    const offset = page * 10 + 1;
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}&first=${offset}`;
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const res = await axios.get(searchUrl, {
            headers: { 
                'User-Agent': randomUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Referer': 'https://www.bing.com/'
            },
            timeout: 30000
        });

        const $ = cheerio.load(res.data);
        const results = $('.b_algo');
        
        if (results.length === 0) {
            // Check if blocked
            if (res.data.includes('Refined Search') || res.data.includes('unusual traffic')) {
                console.log('   ⚠️ Bing detected automation. Cooling down...');
                return null;
            }
            return [];
        }

        console.log(`   🔎 Bing returned ${results.length} raw results. Checking scores...`);
        const newLeads = [];

        results.each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const website = $(el).find('h2 a').attr('href');
            const snippet = $(el).find('.b_caption p, .b_lineclamp3, .b_algoSlug').text().toLowerCase();
            
            if (website && website.startsWith('http')) {
                try {
                    const domain = new URL(website).hostname.toLowerCase();
                    const hardBlacklist = ['amazon', 'walmart', 'ebay', 'alibaba', 'indiamart', 'tradeindia', 'wikipedia', 'facebook', 'instagram', 'linkedin', 'youtube', 'pinterest', 'google', 'bing', 'yahoo', 'marketresearch', 'globenewswire', 'businesswire', 'prnewswire', 'investor', 'news', 'blog', 'forum', 'yellowpages', 'europages', 'thomasnet', 'kompass', 'directindustry', 'panjiva', 'importgenius', 'sephora', 'target', 'macys', 'homedepot', 'lowes', 'cvs', 'walgreens', 'ulta', 'nordstrom', 'menards', 'acehardware', 'premierleague', 'sport', 'marca', 'goal', 'vistaprint'];
                    if (hardBlacklist.some(bad => domain.includes(bad))) return;

                    let score = 0;
                    const lowTitle = title.toLowerCase();
                    const lowSnippet = snippet.toLowerCase();

                    // Dynamic Industry Match (+15)
                    const currentIndustryWords = industry.toLowerCase().replace(/&/g, '').split(/\s+/).filter(w => w.length > 3);
                    if (currentIndustryWords.some(word => lowTitle.includes(word) || lowSnippet.includes(word))) score += 15;

                    // HCO Specific Signals (+25)
                    const hcoWords = ['hydrogenated castor oil', 'castor wax', '12 hydroxy stearic acid', '12-hsa', 'hco', 'oleochemical', 'fatty acid', 'stearic acid'];
                    hcoWords.forEach(kw => { if (lowTitle.includes(kw) || lowSnippet.includes(kw)) score += 25; });

                    // Buyer Intent (+10)
                    const buyerIntent = ['procurement', 'purchasing', 'buyer', 'sourcing', 'raw material', 'importer', 'rfq', 'inquiry', 'enquiry', 'wholesale'];
                    buyerIntent.forEach(kw => {
                        if (lowTitle.includes(kw)) score += 10;
                        if (lowSnippet.includes(kw)) score += 5;
                    });

                    // Factory/Manufacturer Signal (+8)
                    const factorySignal = ['manufacturer', 'factory', 'plant', 'production', 'facility', 'industrial'];
                    if (factorySignal.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score += 8;

                    // Indian Competitor Penalty (-100)
                    const competitors = ['exporter from india', 'indian supplier', 'exporter india', 'india chemicals', 'export from india', 'verified supplier', 'premium supplier'];
                    if (competitors.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score -= 100;

                    if (score < 20) return; // Strict B2B filtering for HCO bulk buyers

                    let cName = title.split(/ - | \| |: /)[0].trim();
                    if (cName.toLowerCase().includes('home') || cName.length > 30) {
                        cName = domain.replace(/^www\./, '').split('.')[0].toUpperCase();
                    }

                    newLeads.push({ name: cName, country, website, industry, score });
                } catch(e) {}
            }
        });

        return newLeads;
    } catch (err) { 
        console.error(`   ❌ Connection Error: ${err.message}`);
        return []; 
    }
}

async function startSniper() {
    console.log('🎯 STARTING STEALTH HCO SNIPER (ANTI-BLOCK MODE)...');
    const allIndustryItems = industries.flatMap(c => c.items);
    
    const startTime = Date.now();
    const MAX_RUN_TIME = 90 * 60 * 1000; // 90 minutes stealth run

    for (const industry of allIndustryItems) {
        if (Date.now() - startTime > MAX_RUN_TIME) break;
        
        for (const country of targetCountries) {
            if (Date.now() - startTime > MAX_RUN_TIME) break;
            
            console.log(`🚀 Targeting: ${industry} in ${country}`);
            let countryLeadsFound = 0;

            for (const qBase of searchQueries) {
                const query = `${industry} ${qBase}`;
                for (let page = 0; page < 2; page++) { // Reduced to 2 pages for stealth
                    const leads = await harvestDomains(query, industry, country, page);
                    
                    if (leads === null) {
                        // Persistent Block - Wait long time
                        await new Promise(r => setTimeout(r, 60000));
                        break;
                    }

                    if (leads && leads.length > 0) {
                        leads.forEach(l => {
                            if (!potentialLeads.some(pl => pl.website === l.website) && !globalScraped.has(l.website)) {
                                potentialLeads.push(l);
                                countryLeadsFound++;
                            }
                        });
                        console.log(`   ✅ Accepted ${leads.length} leads from this page.`);
                    }

                    // Stealth Delay (5-10 seconds random)
                    const delay = Math.floor(Math.random() * 5000) + 5000;
                    await new Promise(r => setTimeout(r, delay));
                }
                
                // If we found enough leads for this country, move to next
                if (countryLeadsFound > 10) break;
            }
            
            // Save after every country
            fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
        }
    }
    console.log(`✨ STEALTH SNIPER COMPLETED. Found ${potentialLeads.length} Potential Leads.`);
}

startSniper();
