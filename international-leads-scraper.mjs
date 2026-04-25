import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';

const CSV_PATH = './international_industry_leads.csv';
const LEADS_JSON_PATH = './potential_leads.json';
const SCRAPED_DOMAINS_PATH = './scraped_domains.json';

const csvWriter = createObjectCsvWriter({
  path: CSV_PATH,
  header: [
    { id: 'name', title: 'Company Name' },
    { id: 'country', title: 'Country' },
    { id: 'email', title: 'Email ID' },
    { id: 'phone', title: 'Mobile Number' },
    { id: 'industry', title: 'Industry' },
    { id: 'website', title: 'Website' },
    { id: 'score', title: 'Quality Score' },
  ],
  append: fs.existsSync(CSV_PATH),
});

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

async function probeDeep(homepageUrl) {
  try {
    if (!homepageUrl.startsWith('http')) homepageUrl = 'https://' + homepageUrl;
    const res = await axios.get(homepageUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: false });
    if (res.status >= 400) return { emails: [], phones: [], siteName: null };

    const html = res.data;
    const $ = cheerio.load(html);
    const emails = new Set(html.match(EMAIL_REGEX) || []);
    const phones = new Set();

    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.toLowerCase().startsWith('tel:')) phones.add(href.replace(/^tel:/i, '').replace(/[^\d+]/g, ''));
      if (href && href.toLowerCase().startsWith('mailto:')) emails.add(href.replace(/^mailto:/i, '').split('?')[0].trim());
    });

    // Sub-page Discovery
    const subLinks = [];
    const targetKeywords = ['contact', 'about', 'enquiry', 'rfq', 'sales', 'location', 'kontakt', 'contacto'];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && targetKeywords.some(kw => $(el).text().toLowerCase().includes(kw))) {
        try { subLinks.push(new URL(href, homepageUrl).href); } catch {}
      }
    });

    for (const sub of [...new Set(subLinks)].slice(0, 5)) {
      try {
        const sRes = await axios.get(sub, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: false });
        if (sRes.status < 400) (sRes.data.match(EMAIL_REGEX) || []).forEach(e => emails.add(e));
      } catch {}
    }

    const cleanEmails = [...emails].filter(e => !/\.(png|jpg|js|css|pdf)$/i.test(e) && e.length < 50);
    const cleanPhones = [...phones].filter(p => p.length >= 8 && p.length <= 15);
    
    let siteName = $('meta[property="og:site_name"]').attr('content') || $('title').text().split(/[-|:|—]/)[0].trim();
    return { emails: cleanEmails, phones: cleanPhones, siteName };
  } catch { return { emails: [], phones: [], siteName: null }; }
}

async function runLeadProcessor() {
  console.log('🚀 PROCESSING HIGH-INTENT HCO LEADS...');
  if (!fs.existsSync(LEADS_JSON_PATH)) return;

  const leads = JSON.parse(fs.readFileSync(LEADS_JSON_PATH, 'utf8'));
  
  // ULTRA-SORT: Highest Score First (The 100% Relevant Leads)
  const sortedLeads = leads.sort((a, b) => b.score - a.score);
  
  let globalScraped = new Set();
  if (fs.existsSync(SCRAPED_DOMAINS_PATH)) {
    globalScraped = new Set(JSON.parse(fs.readFileSync(SCRAPED_DOMAINS_PATH, 'utf8')));
  }

  for (const lead of sortedLeads) {
    if (globalScraped.has(lead.website)) continue;

    console.log(`🔍 Probing Elite Lead [Score ${lead.score}]: ${lead.website}`);
    const { emails, phones, siteName } = await probeDeep(lead.website);

    if (emails.length > 0 || phones.length > 0) {
      let finalName = siteName || lead.name;
      if (finalName.length < 3 || /home|welcome|index/i.test(finalName)) {
         finalName = new URL(lead.website).hostname.replace(/^www\./, '').split('.')[0].toUpperCase();
      }

      await csvWriter.writeRecords([{
        name: `'${finalName}`,
        country: lead.country,
        email: `'${emails.slice(0, 3).join('; ')}`,
        phone: `'${phones.slice(0, 2).join('; ')}`,
        industry: lead.industry,
        website: lead.website,
        score: lead.score
      }]);
      console.log(`   ✅ Details Saved for ${finalName}`);
    }

    globalScraped.add(lead.website);
    fs.writeFileSync(SCRAPED_DOMAINS_PATH, JSON.stringify([...globalScraped], null, 2));
    await new Promise(r => setTimeout(r, 2000));
  }
}

runLeadProcessor();
