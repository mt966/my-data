import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const BASE_URL = 'https://www.lube-media.com';

async function scrapeDetailPage(detailUrl, companyData) {
    try {
        const res = await axios.get(detailUrl, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        let email = $('a[href^="mailto:"]').first().text().trim();
        let website = $('a[target="_blank"]:contains("http")').first().attr('href');
        
        if (!website) {
            website = $('a[href^="http"]').filter((i, el) => {
                const text = $(el).text().toLowerCase();
                return text.includes('website') || text.includes('www.') || text.includes(companyData.name.toLowerCase().split(' ')[0]);
            }).attr('href');
        }

        const phone = $('.directory-phone').text().trim() || 'N/A';

        if (email || website) {
            await csvWriter.writeRecords([{
                ...companyData,
                email: email || 'N/A',
                phone: phone,
                website: website || 'N/A'
            }]);
            console.log(`      ✅ SAVED: ${companyData.name} | ${email || 'Found Website'}`);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`      ❌ Error probing [${detailUrl}]: ${err.message}`);
        return false;
    }
}

async function scrapeLubeMedia() {
    console.log('🚀 TARGETING PREMIUM SOURCE (STABILIZED): Lube-Media (ELID)...');
    
    // Test with 'A' and 'D' first
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    
    for (const letter of letters) {
        console.log(`\n📂 Scraping Lubricant companies starting with [${letter.toUpperCase()}]...`);
        const url = `${BASE_URL}/directory/?search=${letter}&category=0&country=0`;
        
        try {
            const res = await axios.get(url, { 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                },
                timeout: 15000
            });
            const $ = cheerio.load(res.data);
            
            const detailLinks = [];
            
            // The directory uses a table but sometimes it's nested or has different row structures
            $('tr').each((i, el) => {
                const nameLink = $(el).find('a').filter((i, a) => $(a).attr('href')?.includes('/directory/') && $(a).text().length > 2).first();
                const moreInfoLink = $(el).find('a:contains("More info")').attr('href');
                
                const name = nameLink.text().trim();
                const detailUrl = moreInfoLink || nameLink.attr('href');
                const country = $(el).find('td:last-child').prev().text().trim(); // Country is usually near the end

                if (name && detailUrl && !detailUrl.includes('?search=')) {
                    detailLinks.push({ 
                        name, 
                        country: country || 'International', 
                        url: detailUrl.startsWith('http') ? detailUrl : BASE_URL + detailUrl,
                        industry: 'Lubricants & Grease'
                    });
                }
            });

            // Remove duplicates and filter out non-directory links
            const uniqueLeads = Array.from(new Map(detailLinks.map(l => [l.url, l])).values())
                                    .filter(l => l.url.includes('/directory/'));

            console.log(`   Found ${uniqueLeads.length} listings. Probing details...`);

            for (const lead of uniqueLeads) {
                await scrapeDetailPage(lead.url, { name: lead.name, country: lead.country, industry: lead.industry });
                await new Promise(r => setTimeout(r, 1500));
            }

        } catch (err) {
            console.error(`   ❌ Error on [${letter}]: ${err.message}`);
        }
        
        await new Promise(r => setTimeout(r, 4000));
    }
}

async function startBulkExtraction() {
    await scrapeLubeMedia();
    console.log('\n✨ BULK EXTRACTION COMPLETED.');
}

startBulkExtraction();
