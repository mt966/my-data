import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

// Load Centralized Config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

process.setMaxListeners(0);

const POTENTIAL_LEADS_PATH = './potential_leads.json';
const SCRAPED_DOMAINS_PATH = './scraped_domains.json';

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
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

async function harvestDomains(query, industry, country, page = 0) {
    const offset = page * 10 + 1;
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query + ' ' + country)}&first=${offset}`;
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)], 'Referer': 'https://www.bing.com/' },
            timeout: 30000
        });

        const $ = cheerio.load(res.data);
        const results = $('.b_algo');
        if (results.length === 0) return [];

        const newLeads = [];
        results.each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const website = $(el).find('h2 a').attr('href');
            const snippet = $(el).find('.b_caption p, .b_lineclamp3, .b_algoSlug').text().toLowerCase();
            
            if (website && website.startsWith('http')) {
                const domain = new URL(website).hostname.toLowerCase();
                if (config.scoring.blacklist.some(bad => domain.includes(bad))) return;

                let score = 0;
                const lowTitle = title.toLowerCase();
                const lowSnippet = snippet.toLowerCase();

                // Dynamic Industry Match (from config)
                const currentIndustryWords = industry.toLowerCase().replace(/&/g, '').split(/\s+/).filter(w => w.length > 3);
                if (currentIndustryWords.some(word => lowTitle.includes(word) || lowSnippet.includes(word))) score += config.scoring.industry_match;

                // HCO Specific Signals
                const hcoWords = ['hydrogenated castor oil', 'castor wax', '12 hydroxy stearic acid', '12-hsa', 'hco', 'oleochemical', 'fatty acid', 'stearic acid'];
                hcoWords.forEach(kw => { if (lowTitle.includes(kw) || lowSnippet.includes(kw)) score += config.scoring.hco_bonus; });

                // Buyer Intent
                const buyerIntent = ['procurement', 'purchasing', 'buyer', 'sourcing', 'raw material', 'importer', 'rfq', 'inquiry', 'enquiry', 'wholesale'];
                buyerIntent.forEach(kw => { if (lowTitle.includes(kw) || lowSnippet.includes(kw)) score += config.scoring.intent_signal; });

                // Factory Signal
                const factorySignal = ['manufacturer', 'factory', 'plant', 'production', 'facility', 'industrial'];
                if (factorySignal.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score += config.scoring.factory_signal;

                // India Penalty
                const competitors = ['exporter from india', 'indian supplier', 'exporter india', 'india chemicals', 'export from india'];
                if (competitors.some(kw => lowTitle.includes(kw) || lowSnippet.includes(kw))) score -= 100;

                if (score < config.scoring.threshold) return;

                console.log(`      🌟 High Quality Lead! [Score: ${score}] - ${title}`);
                let cName = title.split(/ - | \| |: /)[0].trim();
                newLeads.push({ name: cName, country, website, industry, score });
            }
        });
        return newLeads;
    } catch (err) { return []; }
}

async function startSniper() {
    console.log('🎯 STARTING CONFIG-DRIVEN STEALTH SNIPER...');
    const allIndustryItems = config.targeting.industries.flatMap(c => c.items);
    const startTime = Date.now();
    const MAX_RUN_TIME = config.performance.max_run_time_mins * 60 * 1000;

    for (const industry of allIndustryItems) {
        if (Date.now() - startTime > MAX_RUN_TIME) break;
        for (const country of config.targeting.countries) {
            if (Date.now() - startTime > MAX_RUN_TIME) break;
            console.log(`🚀 Targeting: ${industry} in ${country}`);
            for (const qBase of config.discovery.search_queries) {
                const query = `${industry} ${qBase}`;
                for (let page = 0; page < config.performance.search_pages; page++) {
                    const leads = await harvestDomains(query, industry, country, page);
                    if (leads && leads.length > 0) {
                        leads.forEach(l => {
                            if (!potentialLeads.some(pl => pl.website === l.website) && !globalScraped.has(l.website)) {
                                potentialLeads.push(l);
                            }
                        });
                    }
                    const delay = Math.floor(Math.random() * (config.performance.delay_max - config.performance.delay_min) * 1000) + (config.performance.delay_min * 1000);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
            fs.writeFileSync(POTENTIAL_LEADS_PATH, JSON.stringify(potentialLeads, null, 2));
        }
    }
    console.log(`✨ SNIPER COMPLETED. Found ${potentialLeads.length} Leads.`);
}

startSniper();
