import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { industries, targetCountries, searchQueries } from './industry-config.mjs';

const POTENTIAL_LEADS_PATH = './potential_leads.json';
const MASTER_CSV_PATH = './international_industry_leads.csv';

// Load existing leads to avoid duplicates
let potentialLeads = [];
if (fs.existsSync(POTENTIAL_LEADS_PATH)) {
    try {
        potentialLeads = JSON.parse(fs.readFileSync(POTENTIAL_LEADS_PATH, 'utf8'));
    } catch (e) {
        potentialLeads = [];
    }
}

const existingWebsites = new Set(potentialLeads.map(l => l.website));

async function harvestDomains(query, industry, country, page = 0) {
    const offset = page * 10 + 1;
    console.log(`🔍 Searching: "${query}" in ${country} (Page ${page + 1})...`);
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}&first=${offset}`;
        
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
            let website = $(el).find('cite').first().text().trim() || $(el).find('.b_caption cite').text().trim();
            const snippet = $(el).find('.b_caption p, .b_lineclamp3, .b_algoSlug').text().toLowerCase();
            
            if (website) {
                website = website.split(' ')[0].replace(' › ', '/');
                if (!website.startsWith('http')) website = 'https://' + website;
                
                // Clean common suffixes and junk
                website = website.replace(/[.,]$/, '');
            }

                if (website && !existingWebsites.has(website)) {
                    
                    // --- B2C BLACKLIST (Reject Retail Stores & Directories) ---
                    const b2cBlacklist = ['amazon', 'walmart', 'target', 'ebay', 'alibaba', 'aliexpress', 'indiamart', 'tradeindia', 'homedepot', 'lowes', 'sephora', 'ulta', 'macys', 'cvs', 'walgreens', 'sherwin-williams', 'behr', 'menards', 'acehardware', 'flipkart', 'shopee', 'lazada', 'jd.com', 'taobao', 'wayfair', 'bestbuy', 'costco', 'nordstrom', 'maccosmetics', 'dir.indiamart', 'europages', 'justdial'];
                    
                    let isBlacklisted = false;
                    try {
                        let domainStr = new URL(website).hostname.toLowerCase();
                        isBlacklisted = b2cBlacklist.some(bad => domainStr.includes(bad));
                    } catch(e) {}

                    if (!isBlacklisted) {
                        let cName = title.split(/ - | \| |: /)[0].trim();
                        // Fallback to domain name if title is generic or too long (e.g. blog post title)
                        if (cName.toLowerCase().includes('home') || cName.length > 30) {
                            try {
                                cName = new URL(website).hostname.replace(/^www\./, '').split('.')[0].toUpperCase();
                            } catch(e) { cName = "Unknown"; }
                        }
                        newLeads.push({
                            name: cName,
                            country: country,
                            website: website,
                            industry: industry
                        });
                        existingWebsites.add(website);
                    }
                }
        });

        return newLeads;
    } catch (err) {
        console.error(`   ❌ Search failed for [${query}] Page ${page+1}: ${err.message}`);
        return [];
    }
}

// Helper to rotate countries
function shuffle(array) {
    let currentIndex = array.length,  randomIndex;
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
    
    // REDUCED SNIPER TIME TO 30 MINUTES to allow the scraper to process the massive backlog
    const MAX_RUN_TIME_MS = 30 * 60 * 1000; 
    const startTime = Date.now();
    let timeLimitReached = false;

    for (const industry of allIndustryItems) {
        if (timeLimitReached) break;
        for (const country of countriesToSearch) {
            if (timeLimitReached) break;
            const shuffledQueries = shuffle([...searchQueries]);
            for (const qBase of shuffledQueries) { // Full query base
                if (Date.now() - startTime > MAX_RUN_TIME_MS) {
                    console.log(`⏱️ Time limit of 1.5 hours reached. Stopping sniper gracefully to allow scraper to run...`);
                    timeLimitReached = true;
                    break;
                }

                try {
                    const fullQuery = `${industry} ${qBase}`;
                    
                    // Search first 5 pages for maximum depth
                    for (let page = 0; page < 5; page++) {
                        const leads = await harvestDomains(fullQuery, industry, country, page);
                        
                        if (leads === null) break; // Bing blocked or no more results, stop paginating!

                        if (leads && leads.length > 0) {
                            potentialLeads.push(...leads);
                            console.log(`   ✅ Harvested ${leads.length} new leads for ${industry} in ${country} (Page ${page+1}).`);
                            fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
                        } else if (leads && leads.length === 0) {
                            break; // Empty page, no more results
                        }
                        
                        // Small delay between pages
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (loopErr) {
                    console.error(`   ⚠️ Critical error in loop: ${loopErr.message}`);
                }
                
                // Small safety delay for test
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
    
    console.log(`✨ SNIPER COMPLETED. Total potential leads: ${potentialLeads.length}`);
}

startSniper();
