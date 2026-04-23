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
                const isRelevant = snippet.includes('company') || 
                                 snippet.includes('manufacturer') || 
                                 snippet.includes('supplier') || 
                                 snippet.includes('industry') ||
                                 snippet.includes('distributor') ||
                                 snippet.includes('exporter') ||
                                 snippet.includes('importer');

                if (isRelevant) {
                    newLeads.push({
                        name: title.split(' - ')[0].split(' | ')[0].trim(),
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
    
    // Flatten industries
    const allIndustryItems = industries.flatMap(cat => cat.items);
    
    // Shuffle and pick 5 countries per run to avoid 6-hour timeout
    const countriesToSearch = shuffle([...targetCountries]).slice(0, 5);
    console.log(`🌍 Target countries for this run: ${countriesToSearch.join(', ')}`);
    
    for (const industry of allIndustryItems) {
        for (const country of countriesToSearch) {
            for (const qBase of searchQueries) {
                try {
                    const fullQuery = `${industry} ${qBase}`;
                    
                    // Search first 2 pages for efficiency
                    for (let page = 0; page < 2; page++) {
                        const leads = await harvestDomains(fullQuery, industry, country, page);
                        
                        if (leads.length > 0) {
                            potentialLeads.push(...leads);
                            console.log(`   ✅ Harvested ${leads.length} new leads for ${industry} in ${country} (Page ${page+1}).`);
                            fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
                        }
                        
                        // Small delay between pages
                        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
                    }
                } catch (loopErr) {
                    console.error(`   ⚠️ Critical error in loop: ${loopErr.message}`);
                }
                
                // Safety delay between queries
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
            }
        }
    }
    
    console.log(`✨ SNIPER COMPLETED. Total potential leads: ${potentialLeads.length}`);
}

startSniper();
