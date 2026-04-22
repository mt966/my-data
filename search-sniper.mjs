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
        // Diversifying search: Sometimes using Google patterns or Bing logic helps
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}`;
        
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });

        const $ = cheerio.load(res.data);
        const newLeads = [];

        // Bing Selectors
        $('.b_algo').each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const website = $(el).find('.b_caption cite').text().trim();
            const snippet = $(el).find('.b_caption p').text().toLowerCase();

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
