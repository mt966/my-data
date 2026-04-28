// Dashboard Logic - Production Edition (With Persistence)
document.addEventListener('DOMContentLoaded', () => {
    
    const REPO_OWNER = 'mt966';
    const REPO_NAME = 'my-data';

    const DEFAULT_CONFIG = {
        industries: ['Lubricants', 'Paints', 'Plastics', 'Rubber', 'Castor Oil'],
        threshold: 10,
        hcoBonus: 25,
        searchDepth: 2,
        scraperDepth: 5,
        delayMin: 5,
        delayMax: 10,
        blacklist: 'indiamart, amazon, ebay, alibaba, wikipedia, facebook, news',
        contactKeywords: 'contact, about, enquiry, sales, location'
    };

    // UI Elements
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    const hcoSlider = document.getElementById('hco-slider');
    const hcoVal = document.getElementById('hco-val');
    const industryInput = document.getElementById('industry-input');
    const tagContainer = document.getElementById('industry-tags');
    const blacklistInput = document.getElementById('blacklist-input');
    const searchDepth = document.getElementById('search-depth');
    const scraperDepth = document.getElementById('scraper-depth');
    const delayMin = document.getElementById('delay-min');
    const delayMax = document.getElementById('delay-max');
    const contactKeywords = document.getElementById('contact-keywords');
    const terminal = document.getElementById('terminal');
    const githubTokenInput = document.getElementById('github-token');
    const rememberTokenCheckbox = document.getElementById('remember-token');

    let industries = [...DEFAULT_CONFIG.industries];

    // --- 0. Load Stored Token ---
    const storedToken = localStorage.getItem('hco_github_token');
    if (storedToken) {
        githubTokenInput.value = storedToken;
        rememberTokenCheckbox.checked = true;
    }

    function log(message, color = '#aaa') {
        const p = document.createElement('p');
        p.style.color = color;
        p.textContent = `[${new Date().toLocaleTimeString()}] > ${message}`;
        terminal.appendChild(p);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function renderTags() {
        tagContainer.innerHTML = '';
        industries.forEach((ind, index) => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.innerHTML = `${ind} <i class="fas fa-times tag-remove" onclick="removeTag(${index})"></i>`;
            tagContainer.appendChild(tag);
        });
    }

    window.removeTag = (index) => { industries.splice(index, 1); renderTags(); };

    async function updateGitHubConfig(token, configData) {
        try {
            log('Connecting to GitHub API...', '#00f2ff');
            const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json`, {
                headers: { 'Authorization': `token ${token}` }
            });
            const fileData = await res.json();
            
            log('Saving new settings to config.json...', '#7000ff');
            const updateRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/config.json`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Dashboard Update: Configuration Changed',
                    content: btoa(JSON.stringify(configData, null, 2)),
                    sha: fileData.sha
                })
            });

            if (updateRes.ok) {
                log('SUCCESS: All settings updated A to Z.', '#00ff88');
                return true;
            } else {
                throw new Error('Invalid Token or Permission denied');
            }
        } catch (err) {
            log(`ERROR: ${err.message}`, '#ff4444');
            return false;
        }
    }

    async function triggerWorkflow(token) {
        log('Starting Lead Gen Engine...', '#ffaa00');
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/global-lead-gen.yml/dispatches`, {
            method: 'POST',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: 'main' })
        });
        if (res.ok) log('JOB STARTED! Check your Google Sheet in 10 mins.', '#00ff88');
        else log('Failed to start job. Check Token permissions.', '#ff4444');
    }

    // Handlers
    document.getElementById('save-settings-btn').addEventListener('click', async function() {
        const token = githubTokenInput.value.trim();
        if (!token) { alert('Please enter your GitHub Token first!'); return; }

        if (rememberTokenCheckbox.checked) {
            localStorage.setItem('hco_github_token', token);
        } else {
            localStorage.removeItem('hco_github_token');
        }

        this.disabled = true;
        const configToSave = {
            targeting: { industries: [{ items: industries }], countries: [] }, 
            scoring: { threshold: parseInt(thresholdSlider.value), hco_bonus: parseInt(hcoSlider.value) },
            performance: { search_pages: parseInt(searchDepth.value), scraper_depth: parseInt(scraperDepth.value) },
            discovery: { contact_keywords: contactKeywords.value.split(',').map(k => k.trim()) }
        };

        await updateGitHubConfig(token, configToSave);
        this.disabled = false;
    });

    document.getElementById('run-now-btn').addEventListener('click', async () => {
        const token = githubTokenInput.value.trim();
        if (!token) { alert('Please enter your GitHub Token first!'); return; }
        await triggerWorkflow(token);
    });

    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        if (confirm('Reset to factory defaults?')) {
            industries = [...DEFAULT_CONFIG.industries];
            thresholdSlider.value = DEFAULT_CONFIG.threshold;
            thresholdVal.textContent = DEFAULT_CONFIG.threshold;
            hcoSlider.value = DEFAULT_CONFIG.hcoBonus;
            hcoVal.textContent = DEFAULT_CONFIG.hcoBonus;
            renderTags();
            log('System Reset Complete.', '#ff4444');
        }
    });

    // Navigation & Sliders
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            const targetEl = targetId === 'top' ? document.body : document.getElementById(targetId);
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    thresholdSlider.addEventListener('input', (e) => thresholdVal.textContent = e.target.value);
    hcoSlider.addEventListener('input', (e) => hcoVal.textContent = e.target.value);
    industryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && industryInput.value.trim() !== '') {
            industries.push(industryInput.value.trim()); industryInput.value = ''; renderTags();
        }
    });

    renderTags();
});
