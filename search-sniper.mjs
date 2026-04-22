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

async function harvestDomains(query, industry, country) {
    console.log(`🔍 Searching: "${query}" in ${country}...`);
    try {
        // Using a search proxy or direct (careful with rate limits)
        // Here we simulate fetching from a search engine like DuckDuckGo (HTML version)
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query + ' ' + country)}`;
        
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(res.data);
        const newLeads = [];

        $('.result__body').each((i, el) => {
            const title = $(el).find('.result__title').text().trim();
            const website = $(el).find('.result__url').text().trim();
            const snippet = $(el).find('.result__snippet').text().toLowerCase();

            if (website && !existingWebsites.has(website)) {
                // Heuristic: Check if snippet looks like it belongs to a manufacturer/supplier
                if (snippet.includes('company') || snippet.includes('manufacturer') || snippet.includes('supplier') || snippet.includes('industry')) {
                    newLeads.push({
                        name: title.split(' - ')[0].split(' | ')[0].trim(),
                        country: country,
                        website: website.startsWith('http') ? website : 'https://' + website,
                        industry: industry
                    });
                    existingWebsites.add(website);
                }
            }
        });

        return newLeads;
    } catch (err) {
        console.error(`   ❌ Search failed for [${query}]: ${err.message}`);
        return [];
    }
}

async function startSniper() {
    console.log('🎯 STARTING GLOBAL SEARCH SNIPER...');
    
    // Flatten industries
    const allIndustryItems = industries.flatMap(cat => cat.items);
    
    for (const industry of allIndustryItems) {
        for (const country of targetCountries) {
            for (const qBase of searchQueries) {
                const fullQuery = `${industry} ${qBase}`;
                const leads = await harvestDomains(fullQuery, industry, country);
                
                if (leads.length > 0) {
                    potentialLeads.push(...leads);
                    console.log(`   ✅ Harvested ${leads.length} new leads for ${industry} in ${country}.`);
                    
                    // Save incrementally to prevent data loss
                    fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
                }
                
                // Random delay to avoid search engine blocks
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
            }
        }
    }
    
    console.log(`✨ SNIPER COMPLETED. Total potential leads: ${potentialLeads.length}`);
}

startSniper();
