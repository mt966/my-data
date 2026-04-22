import axios from 'axios';

const WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK || "https://script.google.com/macros/s/AKfycbxwvaTNL0yg0rmm6VCyuaOnig7oVT1Rq_kA4hb6YE8zJ3lCpnFiOwYwZhBSrBilVUqc/exec";

const testData = {
    "Company Name": "Test Business",
    "Country": "TEST",
    "Email ID": "test@business.com",
    "Industry": "Chemicals",
    "Website": "testbusiness.com"
};

async function test() {
    if (!WEBHOOK_URL || WEBHOOK_URL === "PASTE_YOUR_URL_HERE") {
        console.error("❌ Error: Pehle file mein apna Google Webhook URL paste karein.");
        return;
    }

    try {
        console.log("📤 Sending test data to:", WEBHOOK_URL);
        const res = await axios.post(WEBHOOK_URL, testData);
        console.log("✅ Success! Response:", res.data);
        console.log("👉 Ab apni Google Sheet check karein. Agar wahan row aa gayi hai, toh system bilkul sahi hai.");
    } catch (err) {
        console.error("❌ Failed! Request reach nahi ho rahi.");
        console.error("Possible reason: Google script deployment 'Anyone' par nahi hai ya URL galat hai.");
        console.error("Error Detail:", err.message);
    }
}

test();
