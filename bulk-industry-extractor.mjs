import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), 'international_industry_leads.csv');

const csvWriter = createObjectCsvWriter({
  path: CSV_PATH,
  header: [
    { id: 'name', title: 'Company Name' },
    { id: 'country', title: 'Country' },
    { id: 'email', title: 'Email ID' },
    { id: 'phone', title: 'Phone' },
    { id: 'industry', title: 'Industry' },
    { id: 'website', title: 'Website' },
  ],
  append: true, 
});

const INDUSTRIES = ['Lubricant', 'Grease', 'Paint', 'Coating', 'Plastic', 'Polymer'];
const COUNTRIES = ['USA', 'UK', 'Germany', 'UAE', 'China', 'Singapore', 'Vietnam', 'Canada', 'Australia'];

async function scrapeChemRegister() {
    console.log('🚀 BULK EXTRACTION: Targeting ChemRegister & Snippet Mining...');
    
    for (const ind of INDUSTRIES) {
        for (const country of COUNTRIES) {
            console.log(`\n🔎 Mining [${ind}] in [${country}]...`);
            
            // Using Bing/Google Snippets for EXTREME SPEED
            const query = `"${ind} manufacturer" ${country} "contact" "@gmail.com" OR "@" email`;
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
            
            try {
                const res = await axios.get(searchUrl, { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
                });
                const $ = cheerio.load(res.data);
                const leads = [];

                $('.b_algo').each((i, el) => {
                    const title = $(el).find('h2').text().trim();
                    const snippet = $(el).find('.b_caption').text() || $(el).text();
                    const url = $(el).find('a').attr('href');
                    
                    const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    
                    if (emailMatch && !url.includes('google') && !url.includes('facebook')) {
                        leads.push({
                            name: title.split('|')[0].split('-')[0].trim(),
                            country: country,
                            email: emailMatch[0],
                            phone: 'See Website',
                            industry: ind,
                            website: url
                        });
                    }
                });

                if (leads.length > 0) {
                    await csvWriter.writeRecords(leads);
                    console.log(`   ✅ SAVED ${leads.length} Leads from Snippets.`);
                }

            } catch (err) {
                console.error(`   ❌ Error: ${err.message}`);
            }
            
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

scrapeChemRegister().then(() => console.log('\n✨ BULK MINING COMPLETE.'));
