import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';

// Load Centralized Config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

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

    const subLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && config.discovery.contact_keywords.some(kw => $(el).text().toLowerCase().includes(kw))) {
        try { subLinks.push(new URL(href, homepageUrl).href); } catch {}
      }
    });

    for (const sub of [...new Set(subLinks)].slice(0, config.performance.scraper_depth)) {
      try {
        const sRes = await axios.get(sub, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: false });
        if (sRes.status < 400) (sRes.data.match(EMAIL_REGEX) || []).forEach(e => emails.add(e));
      } catch {}
    }

    let siteName = $('meta[property="og:site_name"]').attr('content') || $('title').text().split(/[-|:|—]/)[0].trim();
    return { emails: [...emails].filter(e => e.length < 50), phones: [...phones], siteName };
  } catch { return { emails: [], phones: [], siteName: null }; }
}

async function runLeadProcessor() {
  console.log('🚀 PROCESSING CONFIG-DRIVEN HCO LEADS...');
  if (!fs.existsSync(LEADS_JSON_PATH)) return;

  const leads = JSON.parse(fs.readFileSync(LEADS_JSON_PATH, 'utf8'));
  const sortedLeads = leads.sort((a, b) => b.score - a.score);
  
  let globalScraped = new Set();
  if (fs.existsSync(SCRAPED_DOMAINS_PATH)) {
    try { globalScraped = new Set(JSON.parse(fs.readFileSync(SCRAPED_DOMAINS_PATH, 'utf8'))); } catch(e) {}
  }

  for (const lead of sortedLeads) {
    if (globalScraped.has(lead.website)) continue;
    console.log(`🔍 Probing [Score ${lead.score}]: ${lead.website}`);
    const { emails, phones, siteName } = await probeDeep(lead.website);

    if (emails.length > 0 || phones.length > 0) {
      await csvWriter.writeRecords([{
        name: siteName || lead.name,
        country: lead.country,
        email: emails.slice(0, 3).join('; '),
        phone: phones.slice(0, 2).join('; '),
        industry: lead.industry,
        website: lead.website,
        score: lead.score
      }]);
    }
    globalScraped.add(lead.website);
    fs.writeFileSync(SCRAPED_DOMAINS_PATH, JSON.stringify([...globalScraped], null, 2));
  }
}

runLeadProcessor();
