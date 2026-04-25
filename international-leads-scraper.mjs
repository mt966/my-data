import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(process.cwd(), 'international_industry_leads.csv');
const LEADS_JSON_PATH = path.join(process.cwd(), 'potential_leads.json');

const fileExists = fs.existsSync(CSV_PATH);
const csvWriter = createObjectCsvWriter({
  path: CSV_PATH,
  header: [
    { id: 'name', title: 'Company Name' },
    { id: 'country', title: 'Country' },
    { id: 'email', title: 'Email ID' },
    { id: 'phone', title: 'Mobile Number' },
    { id: 'industry', title: 'Industry' },
    { id: 'website', title: 'Website' },
  ],
  append: fileExists, // If file exists, append. If not, write headers!
});

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;

async function probeDeep(homepageUrl) {
  try {
    if (!homepageUrl.startsWith('http')) homepageUrl = 'https://' + homepageUrl;
    
    const res = await axios.get(homepageUrl, { 
      timeout: 15000, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      validateStatus: false
    });
    
    if (res.status >= 400) return { emails: [], phones: [] };

    const html = res.data;
    const $ = cheerio.load(html);
    
    let emails = new Set(html.match(EMAIL_REGEX) || []);
    let phones = new Set(html.match(PHONE_REGEX) || []);

    const subLinks = [];
    $('a').each((i, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr('href');
      if (href && (text.includes('contact') || text.includes('about') || text.includes('impressum') || text.includes('reach') || text.includes('legal'))) {
        try { 
          const fullUrl = new URL(href, homepageUrl).href;
          if (fullUrl.startsWith(homepageUrl)) subLinks.push(fullUrl);
        } catch {}
      }
    });

    for (const sub of [...new Set(subLinks)].slice(0, 3)) {
      try {
        const sRes = await axios.get(sub, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: false });
        if (sRes.status < 400) {
            (sRes.data.match(EMAIL_REGEX) || []).forEach(e => emails.add(e));
            (sRes.data.match(PHONE_REGEX) || []).forEach(p => phones.add(p));
        }
      } catch {}
    }

    const cleanEmails = [...emails].filter(e => {
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp|js|css|pdf|xml)$/i.test(e);
      return !isImage && e.length < 50 && !e.includes('example.com') && !e.includes('yourdomain.com');
    });

    const cleanPhones = [...phones].filter(p => {
        const digits = p.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 15) return false;
        if (/^(\d)\1+$/.test(digits)) return false;
        if (digits === '1234567890' || digits === '0123456789') return false;
        return true;
    });

    let siteName = $('meta[property="og:site_name"]').attr('content') || 
                   $('meta[name="application-name"]').attr('content');
    if (siteName) siteName = siteName.trim();

    return { emails: cleanEmails, phones: cleanPhones, siteName: siteName };
  } catch (err) { 
    return { emails: [], phones: [], siteName: null }; 
  }
}

async function processBatch(batch) {
    return Promise.all(batch.map(async (lead) => {
        const { emails, phones, siteName } = await probeDeep(lead.website);
        if (emails.length > 0 || phones.length > 0) {
            
            // Smart Company Name Logic
            let finalName = lead.name;
            if (siteName && siteName.length < 40) {
                finalName = siteName;
            } else if (finalName.toLowerCase().includes('home') || finalName.length > 30 || finalName === 'Unknown') {
                try {
                    let domain = new URL(lead.website).hostname.replace(/^www\./, '').split('.')[0];
                    finalName = domain.charAt(0).toUpperCase() + domain.slice(1);
                } catch(e) {}
            }

            try {
                await csvWriter.writeRecords([{
                    name: finalName,
                    country: lead.country,
                    email: emails.length > 0 ? emails.slice(0, 3).join('; ') : 'N/A',
                    phone: phones.length > 0 ? phones.slice(0, 2).join('; ') : 'N/A',
                    industry: lead.industry,
                    website: lead.website
                }]);
                return { success: true, name: finalName };
            } catch (err) {
                return { success: false, name: finalName };
            }
        }
        return { success: false, name: lead.name };
    }));
}

async function runLeadProcessor() {
  console.log('🚀 INITIALIZING HIGH-SPEED GLOBAL SCRAPER...');
  
  if (!fs.existsSync(LEADS_JSON_PATH)) {
    console.error('❌ potential_leads.json not found!');
    return;
  }

  const processedWebsites = new Set();
  if (fs.existsSync(CSV_PATH)) {
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.split(',');
      if (parts.length > 4) processedWebsites.add(parts[5]?.trim()); // Website is column 5 (0-indexed)
    });
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_JSON_PATH, 'utf8'));
  const remainingLeads = leads.filter(l => !processedWebsites.has(l.website));
  
  console.log(`📊 Total: ${leads.length} | To Process: ${remainingLeads.length}`);

  const BATCH_SIZE = 5; // Process 5 websites at once
  for (let i = 0; i < remainingLeads.length; i += BATCH_SIZE) {
    const batch = remainingLeads.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing Batch [${i + 1}-${Math.min(i + BATCH_SIZE, remainingLeads.length)} / ${remainingLeads.length}]`);
    
    const results = await processBatch(batch);
    results.forEach(res => {
        if (res.success) console.log(`   ✅ ${res.name}: Details Saved.`);
        else console.log(`   ⚠️ ${res.name}: No details found or probe failed.`);
    });

    // Short cooling delay between batches
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n✨ ALL LEADS PROCESSED. Check international_industry_leads.csv');
}

runLeadProcessor();
