import fs from 'fs';
import axios from 'axios';
import { parse } from 'csv-parse/sync';

const CSV_PATH = './international_industry_leads.csv';
const SYNC_LOG_PATH = './synced_leads.json';
const WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK; // User will set this in GitHub Secrets

async function syncToSheets() {
    console.log('🔄 STARTING GOOGLE SHEETS SYNC...');

    if (!WEBHOOK_URL) {
        console.warn('⚠️ Webhook URL not set. Skipping sync.');
        return;
    }

    if (!fs.existsSync(CSV_PATH)) {
        console.warn('⚠️ CSV file not found. Nothing to sync.');
        return;
    }

    // Load sync progress
    let syncedWebsites = new Set();
    if (fs.existsSync(SYNC_LOG_PATH)) {
        try {
            syncedWebsites = new Set(JSON.parse(fs.readFileSync(SYNC_LOG_PATH, 'utf8')));
        } catch (e) {
            syncedWebsites = new Set();
        }
    }

    // Parse CSV
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true
    });

    const newRecords = records.filter(r => !syncedWebsites.has(r.Website));
    console.log(`📊 Found ${newRecords.length} new records to sync.`);

    for (let i = 0; i < newRecords.length; i++) {
        const record = newRecords[i];
        try {
            console.log(`   📤 Syncing: ${record['Company Name']}`);
            await axios.post(WEBHOOK_URL, record, {
                headers: { 'Content-Type': 'application/json' }
            });
            syncedWebsites.add(record.Website);
            
            // Incremental save
            fs.writeFileSync(SYNC_LOG_PATH, JSON.stringify([...syncedWebsites], null, 2));
            
            // Small delay to prevent hitting Apps Script rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`   ❌ Failed to sync ${record['Company Name']}: ${err.message}`);
        }
    }

    console.log('✨ SYNC COMPLETED.');
}

syncToSheets();
