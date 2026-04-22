const leads = [
  { "name": "ML Lubrication", "country": "Germany", "phone": "+49 9721 65950", "industry": "Lubricants", "website": "http://www.ml-lubrication.com/" },
  { "name": "FUCHS LUBRITECH GmbH", "country": "Germany", "phone": "+49 6301 32060", "industry": "Lubricants", "website": "https://www.fuchs.com/de/" },
  { "name": "Zeller+Gmelin GmbH & Co. KG", "country": "Germany", "phone": "+49 7161 8020", "industry": "Lubricants", "website": "https://www.zeller-gmelin.de/" },
  { "name": "Carl Bechem GmbH", "country": "Germany", "phone": "+49 2331 6350", "industry": "Lubricants", "website": "https://www.bechem.de/" },
  { "name": "OKS Spezialschmierstoffe GmbH", "country": "Germany", "phone": "+49 8142 30510", "industry": "Lubricants", "website": "https://www.oks-germany.com/" },
  { "name": "Baril Coatings USA", "country": "USA", "phone": "+1 260-665-8431", "industry": "Paints", "website": "https://barilcoatings.us/" },
  { "name": "Hempel Paints (USA) Inc.", "country": "USA", "phone": "+1 214-353-1600", "industry": "Paints", "website": "http://www.hempel.com/" },
  { "name": "Induron Protective Coatings", "country": "USA", "phone": "+1 205-324-9545", "industry": "Paints", "website": "https://www.induron.com/" },
  { "name": "Tnemec Company Inc.", "country": "USA", "phone": "+1 816-483-3400", "industry": "Paints", "website": "https://www.tnemec.com/" },
  { "name": "Cloverdale Paint", "country": "USA", "phone": "+1 800-661-4406", "industry": "Paints", "website": "https://www.cloverdalepaint.com/" },
  { "name": "Aalmir Plastic Manufacturer", "country": "UAE", "phone": "+971 6 534 2603", "industry": "Plastics", "website": "https://aalmirplastic.com/" },
  { "name": "Cosmoplast", "country": "UAE", "phone": "+971 6 533 1260", "industry": "Plastics", "website": "http://www.cosmoplast.com/" },
  { "name": "National Plastic & Building Material", "country": "UAE", "phone": "+971 6 533 1830", "industry": "Plastics", "website": "https://national-plastic.com/" },
  { "name": "Interplast Co. Ltd.", "country": "UAE", "phone": "+971 6 533 9090", "industry": "Plastics", "website": "https://www.interplast.ae/" },
  { "name": "Milacron (UAE)", "country": "UAE", "phone": "+971 4 883 5500", "industry": "Plastics", "website": "https://www.milacron.com/" },
  { "name": "Polymer Asia", "country": "Vietnam", "phone": "+84 28 3841 1910", "industry": "Polymers", "website": "https://www.polymerasia.com/" },
  { "name": "Vietnam Poly Corp", "country": "Vietnam", "phone": "+84 24 3767 5588", "industry": "Polymers", "website": "http://vietnampoly.com.vn/" },
  { "name": "Stavian Chemical", "country": "Vietnam", "phone": "+84 24 3942 6511", "industry": "Polymers", "website": "https://stavianchemical.com/" },
  { "name": "An Phat Bioplastics", "country": "Vietnam", "phone": "+84 220 3755 888", "industry": "Polymers", "website": "https://anphatbioplastics.com/" },
  { "name": "Europlas (Vietnam)", "country": "Vietnam", "phone": "+84 24 3376 0451", "industry": "Polymers", "website": "https://europlas.com.vn/" },
  { "name": "Borouge", "country": "UAE", "phone": "+971 2 607 0888", "industry": "Polymers", "website": "https://www.borouge.com/" },
  { "name": "EQUATE Petrochemical", "country": "Kuwait", "phone": "+965 1898 888", "industry": "Polymers", "website": "https://www.equate.com/" },
  { "name": "SABIC (Global)", "country": "Saudi Arabia", "phone": "+966 11 225 8000", "industry": "Polymers", "website": "https://www.sabic.com/" },
  { "name": "Qatar Petrochemical (QAPCO)", "country": "Qatar", "phone": "+974 4477 7111", "industry": "Polymers", "website": "https://www.qapco.com/" },
  { "name": "Oman Oil (OQ)", "country": "Oman", "phone": "+968 2457 3100", "industry": "Polymers", "website": "https://oq.com/" }
];

import fs from 'fs';
import path from 'path';

const csvPath = 'international_industry_leads.csv';
const header = 'Company Name,Country,Email ID,Phone,Industry,Website\n';

if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, header);
}

const csvData = leads.map(l => `"${l.name}","${l.country}","Verification Pending","${l.phone}","${l.industry}","${l.website}"`).join('\n');
fs.appendFileSync(csvPath, '\n' + csvData);

console.log(`✅ Appended ${leads.length} leads to ${csvPath}.`);
