#!/usr/bin/env node
/* IngredientIQ static page builder
   Reads content/pages/*.json, writes:
     /ingredient/<slug>/index.html, /guides/<slug>/index.html, /compare/<slug>/index.html
     /ingredient/index.html (glossary hub)
   and refreshes sitemap.xml.
   Run:  node scripts/build-pages.js   (from repo root, no dependencies) */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://ingredientiq.app';
const THEMES = {
  personal:  { label:'Personal Care',   headerBg:'#C9A08A', accent:'#8B2257', ink:'#1C0E18', body:'#4A2E3A', card:'#F7F7F7', icon:'🧴' },
  household: { label:'Household',       headerBg:'#7A96A8', accent:'#1A4F72', ink:'#0A1E2A', body:'#2A4050', card:'#F4F8FA', icon:'🧹' },
  outdoor:   { label:'Outdoor & Garden',headerBg:'#8FA888', accent:'#2A5C33', ink:'#0E1E12', body:'#2A4030', card:'#F4F8F4', icon:'🌿' },
};
const RATING = {
  safe:    { label:'Generally Safe', bg:'#E8F5EE', fg:'#1B5E35', border:'#A8D5B5', icon:'✓' },
  caution: { label:'Use With Caution', bg:'#FDF3E3', fg:'#7A4A00', border:'#F0C87A', icon:'!' },
  flag:    { label:'Flagged', bg:'#F9E8EE', fg:'#8B1A3A', border:'#E8A0B8', icon:'✕' },
};
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const paras = arr => (arr||[]).map(p => `<p>${esc(p)}</p>`).join('\n');
const list = arr => arr && arr.length ? `<ul>${arr.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>` : '';
const linkList = arr => arr && arr.length ? `<ul class="related">${arr.map(r=>`<li><a href="${esc(r.href)}">${esc(r.label)}</a></li>`).join('')}</ul>` : '';

function shell({ title, description, canonical, theme, jsonld, eyebrow, h1, sub, body, updated }) {
  const t = THEMES[theme] || THEMES.personal;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-D1XVKXLBQF"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-D1XVKXLBQF');</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="IngredientIQ">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Source Sans 3','Inter',system-ui,sans-serif;background:#fff;color:#1a1a1a;-webkit-font-smoothing:antialiased;font-size:18px}
a{color:inherit;text-decoration:none}
header{background:${t.headerBg};padding:0 64px;min-height:68px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 1px 0 rgba(0,0,0,.06)}
.logo-wrap{display:flex;align-items:center;gap:11px}
.logo-icon{width:38px;height:38px;border-radius:9px;background:${t.accent};display:flex;align-items:center;justify-content:center;font-size:17px}
.logo-text{font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:${t.ink};letter-spacing:-.01em}
nav{display:flex;gap:28px}nav a{font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:${t.ink};opacity:.75}nav a:hover,nav a.active{opacity:1}
.hero{background:${t.headerBg};padding:56px 64px 64px}
.hero-inner{max-width:780px;margin:0 auto}
.hero-eyebrow{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${t.accent};margin-bottom:14px}
.hero-title{font-family:'Inter',sans-serif;font-size:44px;font-weight:800;color:${t.ink};line-height:1.12;letter-spacing:-.02em;margin-bottom:16px}
.hero-sub{font-size:20px;color:${t.body};line-height:1.65;max-width:640px}
.content{max-width:780px;margin:0 auto;padding:48px 64px 100px}
.quick{background:${t.card};border-left:4px solid ${t.accent};border-radius:0 16px 16px 0;padding:24px 28px;margin-bottom:40px;font-size:19px;line-height:1.7;color:#1a1a1a}
.quick strong{display:block;font-family:'Inter',sans-serif;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${t.accent};margin-bottom:8px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;border:1.5px solid;margin-bottom:24px}
.badge i{font-style:normal;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;background:currentColor}
.badge i span{color:#fff}
.section{margin-bottom:44px}
.section-title{font-family:'Inter',sans-serif;font-size:26px;font-weight:700;color:#111;margin-bottom:14px;letter-spacing:-.01em}
.section-body{font-size:18px;color:#2a2a2a;line-height:1.75}
.section-body p{margin-bottom:14px}.section-body p:last-child{margin-bottom:0}
.section-body ul{padding-left:22px;margin:6px 0 14px}.section-body li{margin-bottom:8px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:40px}
.fact{background:${t.card};border:1px solid #E4E4E4;border-radius:14px;padding:16px 18px}
.fact-k{font-family:'Inter',sans-serif;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#777;margin-bottom:6px}
.fact-v{font-size:17px;font-weight:600;color:#111;line-height:1.4}
table{width:100%;border-collapse:collapse;font-size:17px;margin:8px 0 14px}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #E8E8E8;vertical-align:top;line-height:1.5}
th{font-family:'Inter',sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#777;font-weight:700}
.cta{background:${t.accent};color:#fff;border-radius:22px;padding:30px 32px;margin:52px 0 40px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.cta h3{font-family:'Inter',sans-serif;font-size:22px;font-weight:700;margin-bottom:6px}
.cta p{font-size:17px;opacity:.9;line-height:1.5}
.cta a{background:#fff;color:${t.accent};font-family:'Inter',sans-serif;font-weight:700;font-size:15px;padding:13px 22px;border-radius:999px;white-space:nowrap}
.faq details{border-bottom:1px solid #E8E8E8;padding:14px 0}
.faq summary{font-weight:600;font-size:18px;cursor:pointer;color:#111}
.faq p{margin-top:10px;font-size:17px;color:#2a2a2a;line-height:1.75}
.related li{margin-bottom:8px}.related a{color:${t.accent};font-weight:600;border-bottom:1px solid transparent}.related a:hover{border-color:${t.accent}}
.meta{font-size:15px;color:#666;margin-top:40px;line-height:1.7}
.disclaimer{background:#FDF3E3;border:1px solid #F0C87A;border-radius:14px;padding:16px 20px;font-size:15px;color:#7A4A00;line-height:1.6;margin-top:18px}
footer{background:${t.headerBg};padding:28px 64px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-top:1px solid rgba(0,0,0,.08)}
.footer-links{display:flex;gap:24px;flex-wrap:wrap}.footer-link{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:${t.body}}.footer-copy{font-size:14px;color:${t.body}}
@media(max-width:720px){header,.hero,.content,footer{padding-left:22px;padding-right:22px}.hero-title{font-size:32px}.content{padding-top:32px}nav{gap:18px}}
</style>
</head>
<body>
<header>
  <a class="logo-wrap" href="/"><div class="logo-icon">🔬</div><div class="logo-text">IngredientIQ</div></a>
  <nav><a href="/">Analyzer</a><a href="/ingredient/" class="active">Ingredients</a><a href="/about.html">About</a><a href="/contact.html">Contact</a></nav>
</header>
<section class="hero"><div class="hero-inner">
  <div class="hero-eyebrow">${esc(eyebrow)}</div>
  <h1 class="hero-title">${h1}</h1>
  <p class="hero-sub">${esc(sub)}</p>
</div></section>
<main class="content">
${body}
<div class="meta">Last reviewed ${esc(updated)}. IngredientIQ summaries are compiled from regulatory listings and published safety assessments and reviewed for accuracy; they are not a substitute for the product label or professional advice.</div>
<div class="disclaimer">This page is for general information only and is not medical, veterinary, or legal advice. Formulations change; always follow the directions and warnings on the actual product label.</div>
</main>
<footer>
  <div class="footer-links"><a href="/" class="footer-link">Analyzer</a><a href="/ingredient/" class="footer-link">Ingredients</a><a href="/about.html" class="footer-link">About</a><a href="/contact.html" class="footer-link">Contact</a><a href="/privacy.html" class="footer-link">Privacy Policy</a><a href="/terms.html" class="footer-link">Terms of Use</a></div>
  <div class="footer-copy">© ${new Date().getFullYear()} IngredientIQ. All rights reserved.</div>
</footer>
</body>
</html>`;
}

function cta(theme, name) {
  const t = THEMES[theme];
  return `<div class="cta"><div><h3>Is it in your product?</h3><p>Paste the ingredient list or snap a photo of the label — IngredientIQ rates every ingredient in seconds.</p></div><a href="/?cat=${theme}">Check your ${t.label.toLowerCase()} product →</a></div>`;
}
function faq(items) {
  if (!items || !items.length) return '';
  return `<div class="section faq"><h2 class="section-title">Common questions</h2>${items.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;
}
const faqLd = items => items && items.length ? { '@type':'FAQPage', mainEntity: items.map(f=>({ '@type':'Question', name:f.q, acceptedAnswer:{ '@type':'Answer', text:f.a } })) } : null;

function renderIngredient(p) {
  const r = RATING[p.rating] || RATING.caution;
  const t = THEMES[p.category];
  const url = `${SITE}/ingredient/${p.slug}/`;
  const body = `
<span class="badge" style="background:${r.bg};color:${r.fg};border-color:${r.border}"><i><span>${r.icon}</span></i>${r.label}</span>
<div class="quick"><strong>Quick answer</strong>${esc(p.quickAnswer)}</div>
<div class="facts">
  <div class="fact"><div class="fact-k">Also listed as</div><div class="fact-v">${esc((p.aliases||[]).join(', ') || '—')}</div></div>
  <div class="fact"><div class="fact-k">Function</div><div class="fact-v">${esc(p.function)}</div></div>
  <div class="fact"><div class="fact-k">Found in</div><div class="fact-v">${esc(p.foundInShort)}</div></div>
  <div class="fact"><div class="fact-k">Main concern</div><div class="fact-v">${esc(p.mainConcern)}</div></div>
</div>
<div class="section"><h2 class="section-title">What is ${esc(p.name)}?</h2><div class="section-body">${paras(p.whatItIs)}</div></div>
<div class="section"><h2 class="section-title">What does it do in a product?</h2><div class="section-body">${paras(p.whatItDoes)}</div></div>
<div class="section"><h2 class="section-title">Is ${esc(p.name)} safe?</h2><div class="section-body">${paras(p.safety)}</div></div>
<div class="section"><h2 class="section-title">Who should be careful</h2><div class="section-body">${list(p.whoShouldAvoid)}</div></div>
<div class="section"><h2 class="section-title">Regulatory status</h2><div class="section-body"><table><tr><th>Region</th><th>Status</th></tr>${(p.regulatory||[]).map(x=>`<tr><td>${esc(x.region)}</td><td>${esc(x.status)}</td></tr>`).join('')}</table></div></div>
<div class="section"><h2 class="section-title">Where you'll find it</h2><div class="section-body">${list(p.commonProducts)}</div></div>
${p.alternatives && p.alternatives.length ? `<div class="section"><h2 class="section-title">Alternatives</h2><div class="section-body">${list(p.alternatives)}</div></div>` : ''}
${cta(p.category, p.name)}
${faq(p.faqs)}
${p.related && p.related.length ? `<div class="section"><h2 class="section-title">Related</h2>${linkList(p.related)}</div>` : ''}
${p.sources && p.sources.length ? `<div class="section"><h2 class="section-title">Sources</h2><div class="section-body">${list(p.sources)}</div></div>` : ''}`;
  const jsonld = { '@context':'https://schema.org', '@graph':[
    { '@type':'Article', headline:p.title, description:p.description, url, dateModified:p.updated, author:{ '@type':'Organization', name:'IngredientIQ', url:SITE }, publisher:{ '@type':'Organization', name:'IngredientIQ', url:SITE }, about:{ '@type':'ChemicalSubstance', name:p.name, alternateName:p.aliases||[] } },
    { '@type':'BreadcrumbList', itemListElement:[ {'@type':'ListItem',position:1,name:'Ingredients',item:`${SITE}/ingredient/`}, {'@type':'ListItem',position:2,name:p.name,item:url} ] },
    faqLd(p.faqs) ].filter(Boolean) };
  return shell({ title:p.title, description:p.description, canonical:url, theme:p.category, jsonld, eyebrow:`${t.label} · Ingredient guide`, h1:esc(p.name), sub:p.subtitle, body, updated:p.updated });
}

function renderGuide(p, kind) {
  const t = THEMES[p.category];
  const url = `${SITE}/${kind}/${p.slug}/`;
  const body = `
<div class="quick"><strong>Quick answer</strong>${esc(p.quickAnswer)}</div>
${(p.sections||[]).map(s=>`<div class="section"><h2 class="section-title">${esc(s.heading)}</h2><div class="section-body">${paras(s.paragraphs)}${list(s.bullets)}${s.table ? `<table><tr>${s.table.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>${s.table.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : ''}</div></div>`).join('')}
${cta(p.category)}
${faq(p.faqs)}
${p.related && p.related.length ? `<div class="section"><h2 class="section-title">Related</h2>${linkList(p.related)}</div>` : ''}
${p.sources && p.sources.length ? `<div class="section"><h2 class="section-title">Sources</h2><div class="section-body">${list(p.sources)}</div></div>` : ''}`;
  const jsonld = { '@context':'https://schema.org', '@graph':[
    { '@type':'Article', headline:p.title, description:p.description, url, dateModified:p.updated, author:{ '@type':'Organization', name:'IngredientIQ', url:SITE }, publisher:{ '@type':'Organization', name:'IngredientIQ', url:SITE } },
    faqLd(p.faqs) ].filter(Boolean) };
  return shell({ title:p.title, description:p.description, canonical:url, theme:p.category, jsonld, eyebrow:`${t.label} · ${kind==='compare'?'Comparison':'Guide'}`, h1:esc(p.h1||p.title), sub:p.subtitle, body, updated:p.updated });
}

function renderHub(pages, extras) {
  const groups = {};
  for (const p of pages) (groups[p.category] ||= []).push(p);
  const extraHtml = extras && extras.length ? `<div class="section"><h2 class="section-title">Guides &amp; comparisons</h2><div class="section-body">${extras.map(e=>`<p><a href="${e.href}" style="font-weight:600;color:${THEMES[e.category].accent}">${esc(e.h1||e.title)}</a><br><span style="font-size:16px;color:#666">${esc(e.description)}</span></p>`).join('')}</div></div>` : '';
  const body = extraHtml + Object.keys(THEMES).map(cat => {
    const items = (groups[cat]||[]).sort((a,b)=>a.name.localeCompare(b.name));
    if (!items.length) return '';
    return `<div class="section"><h2 class="section-title">${THEMES[cat].icon} ${THEMES[cat].label}</h2><div class="section-body">${items.map(p=>{const r=RATING[p.rating];return `<p><a href="/ingredient/${p.slug}/" style="font-weight:600;color:${THEMES[cat].accent}">${esc(p.name)}</a> <span style="font-size:12px;font-weight:700;color:${r.fg};background:${r.bg};border:1px solid ${r.border};padding:2px 9px;border-radius:999px;margin-left:6px">${r.label}</span><br><span style="font-size:14px;color:#666">${esc(p.description)}</span></p>`;}).join('')}</div></div>`;
  }).join('');
  const jsonld = { '@context':'https://schema.org', '@type':'CollectionPage', name:'Ingredient Guides — IngredientIQ', url:`${SITE}/ingredient/` };
  return shell({ title:'Ingredient Safety Guides — IngredientIQ', description:'Plain-English safety guides for the ingredients in your personal care, household, and outdoor products.', canonical:`${SITE}/ingredient/`, theme:'outdoor', jsonld, eyebrow:'Ingredient library', h1:'Ingredient safety, explained.', sub:'What each ingredient does, whether it is safe, who should avoid it, and where it is restricted around the world.', body, updated:new Date().toISOString().slice(0,10) });
}

// ---- build ----
const dir = path.join(ROOT, 'content/pages');
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
const urls = [];
const ingredients = [];
const extras = [];
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  let out, html;
  if (p.type === 'ingredient') { html = renderIngredient(p); out = `ingredient/${p.slug}`; ingredients.push(p); }
  else if (p.type === 'guide') { html = renderGuide(p,'guides'); out = `guides/${p.slug}`; extras.push({...p, href:`/guides/${p.slug}/`}); }
  else if (p.type === 'compare') { html = renderGuide(p,'compare'); out = `compare/${p.slug}`; extras.push({...p, href:`/compare/${p.slug}/`}); }
  else { console.warn('skip', f); continue; }
  fs.mkdirSync(path.join(ROOT,out),{recursive:true});
  fs.writeFileSync(path.join(ROOT,out,'index.html'), html);
  urls.push({ loc:`${SITE}/${out}/`, lastmod:p.updated });
  console.log('built', out);
}
fs.mkdirSync(path.join(ROOT,'ingredient'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'ingredient/index.html'), renderHub(ingredients, extras));
urls.push({ loc:`${SITE}/ingredient/`, lastmod:new Date().toISOString().slice(0,10) });

// sitemap: keep existing static entries, replace generated ones
const smPath = path.join(ROOT,'sitemap.xml');
let sm = fs.existsSync(smPath) ? fs.readFileSync(smPath,'utf8') : '';
const staticUrls = [...sm.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m=>m[0]).filter(u=>!/\/(ingredient|guides|compare)\//.test(u));
const gen = urls.map(u=>`  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
fs.writeFileSync(smPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls.map(s=>'  '+s.trim()).join('\n')}\n${gen.join('\n')}\n</urlset>\n`);
console.log(`sitemap: ${staticUrls.length} static + ${urls.length} generated`);
