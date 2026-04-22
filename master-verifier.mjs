import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.join(process.cwd(), 'international_industry_leads.csv');
const OUTPUT_CSV_PATH = path.join(process.cwd(), 'verified_international_leads_master.csv');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

async function probeEmails(url) {
    if (!url || url === 'N/A' || !url.startsWith('http')) return 'N/A';
    try {
        console.log(`   Probing: ${url}`);
        const res = await axios.get(url, { 
            timeout: 10000, 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
        });
        const html = res.data;
        const $ = cheerio.load(html);
        const emails = new Set(html.match(EMAIL_REGEX) || []);

        const subLinks = [];
        $('a').each((i, el) => {
            const text = $(el).text().toLowerCase();
            const href = $(el).attr('href');
            if (href && (text.includes('contact') || text.includes('about') || text.includes('impressum'))) {
                try { subLinks.push(new URL(href, url).href); } catch {}
            }
        });

        for (const sub of [...new Set(subLinks)].slice(0, 3)) {
            try {
                const sRes = await axios.get(sub, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                (sRes.data.match(EMAIL_REGEX) || []).forEach(e => emails.add(e));
            } catch {}
        }

        const cleaned = [...emails].filter(e => !/\.(png|jpg|jpeg|gif|svg|webp|js|css|pdf|xml)$/i.test(e));
        return cleaned.length > 0 ? cleaned.join('; ') : 'Manual Search Required';
    } catch {
        return 'Website Unreachable';
    }
}

async function verifyAllLeads() {
    console.log('🚀 MASTER VERIFICATION (BATCH 2 RESUME): Processing 94 Leads...');
    
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    
    // Using csv-parse with flexible columns to handle mixed batch formats
    const records = parse(fileContent, {
        columns: false,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
    });

    const csvWriter = createObjectCsvWriter({
        path: OUTPUT_CSV_PATH,
        header: [
            { id: 'name', title: 'Company Name' },
            { id: 'country', title: 'Country' },
            { id: 'email', title: 'Email ID' },
            { id: 'phone', title: 'Phone' },
            { id: 'industry', title: 'Industry' },
            { id: 'website', title: 'Website' },
        ]
    });

    const finalResults = [];

    for (let i = 0; i < records.length; i++) {
        let [name, country, email, phone, industry, website] = records[i];
        
        // Handle rows with missing phone (Part 1 format)
        if (!website && industry) {
            website = industry;
            industry = phone;
            phone = 'N/A';
        }

        if (email === 'Verification Pending' || email === 'N/A' || !email.includes('@')) {
            console.log(`\n[${i+1}/${records.length}] Verifying: ${name}`);
            const foundEmail = await probeEmails(website);
            email = foundEmail;
        }

        finalResults.push({ name, country, email, phone, industry, website });
    }

    await csvWriter.writeRecords(finalResults);
    console.log(`\n✨ MASTER LIST COMPLETE: ${records.length} leads processed.`);
}

verifyAllLeads();
