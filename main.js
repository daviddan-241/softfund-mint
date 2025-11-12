// main.js
// Softfund frontend (UI shows 'Mint' — runtime uses DEVNET by default).
// IMPORTANT: to switch to MAINNET, change the two constants marked below.

// ---------- CONFIG (change these to go MAINNET) ----------
const RPC = 'https://api.devnet.solana.com'; // <-- change to mainnet: 'https://api.mainnet-beta.solana.com' or your RPC provider
const TREASURY = 'GqB1ywkWHq9jpjDSJkhGxuFVz1H6VBfoyJX32BsCjWue'; // <-- change to your MAINNET treasury if/when ready
// ----------------------------------------------------------------

const PRICE_USD = 3.20;
const TOTAL_CAP = 5000;
const METADATA = [
  "bafkreidstjrabmghkjqwjcpct24g67flpybxs6gd7vpcg724upwibpy4le",
  "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami",
  "bafkreidxd6q6vtpwboxr5eokewalr3ie7xmxjocny5m2ft66fayo5cd6im",
  "bafkreid7v5q6uetszdev5tmlrf2ma43tjfbova7gc7epuzt2lnbhcc4ijm",
  "bafkreidiimwvc36ekicyuxugmo7wcsdhvye3l3fz4l34lvs3lf44tsrqra"
];

// minimal Buffer polyfill for browsers so web3 doesn't throw
if (typeof window.Buffer === 'undefined') {
  window.Buffer = {
    from: function(input, enc) {
      if (enc === 'base64') {
        const bin = atob(input);
        const arr = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
        return arr;
      } else {
        return new TextEncoder().encode(String(input));
      }
    }
  };
}

const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
if (!Connection) { alert('solana web3 library not loaded'); throw new Error('web3 missing'); }

const connection = new Connection(RPC, 'confirmed');

let provider = null;
let quantity = 1;
let SOL_PRICE = 150;
let minted = parseInt(localStorage.getItem('sf_minted') || '0');
let records = JSON.parse(localStorage.getItem('sf_records') || '[]');
let nextIndex = parseInt(localStorage.getItem('sf_nextidx') || '0');

// DOM
const phantomBtn = document.getElementById('phantomBtn');
const trustBtn = document.getElementById('trustBtn');
const solflareBtn = document.getElementById('solflareBtn');
const connectedEl = document.getElementById('connected');
const decBtn = document.getElementById('dec');
const incBtn = document.getElementById('inc');
const qtyEl = document.getElementById('quantity');
const totalUSDEl = document.getElementById('totalUSD');
const totalSOLEl = document.getElementById('totalSOL');
const mintBtn = document.getElementById('mintBtn');
const copyTreasury = document.getElementById('copyTreasury');
const galleryEl = document.getElementById('gallery');
const heroImg = document.getElementById('heroImg');
const progressBar = document.getElementById('progressBar');
const counterEl = document.getElementById('counter');
const topNotice = document.getElementById('topNotice');
const copyNotice = document.getElementById('copyNotice');
const statusEl = document.getElementById('status');

function updateTotals(){ totalUSDEl.textContent=(PRICE_USD*quantity).toFixed(3); totalSOLEl.textContent=((PRICE_USD*quantity)/SOL_PRICE).toFixed(6); qtyEl.textContent=quantity; }
updateTotals();

decBtn.addEventListener('click',()=>{ quantity=Math.max(1,quantity-1); updateTotals(); });
incBtn.addEventListener('click',()=>{ quantity=Math.min(10,quantity+1); updateTotals(); });
copyTreasury.addEventListener('click',()=>navigator.clipboard.writeText(TREASURY).then(()=>alert('Copied treasury')));
copyNotice.addEventListener('click',()=>navigator.clipboard.writeText(document.getElementById('noticeLink').href).then(()=>alert('Link copied')));

// fetch SOL price (best-effort)
(async function(){ try{ const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'); const j=await r.json(); if(j?.solana?.usd) SOL_PRICE=j.solana.usd; }catch(e){console.warn('price fetch failed',e);} updateTotals(); })();

function renderGallery(){
  galleryEl.innerHTML='';
  const show = records.slice(-30).reverse();
  if(show.length===0){ galleryEl.innerHTML='<div class="small" style="color:#9fb0c8">No mints yet</div>'; return; }
  for(const r of show){
    const tile=document.createElement('div'); tile.className='tile';
    const img=document.createElement('img'); img.src=`https://gateway.lighthouse.storage/ipfs/${r.cid}`; img.alt=`#${r.id}`;
    const label=document.createElement('div'); label.textContent=`#${r.id}`; label.style.marginTop='6px'; label.style.fontWeight='700';
    tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
  }
}

// wallet button behaviors (separate)
phantomBtn.addEventListener('click', async ()=>{
  if(window.solana && window.solana.isPhantom){
    try{
      await window.solana.connect();
      provider = window.solana;
      connectedEl.textContent = 'Connected: ' + provider.publicKey.toString();
      topNotice.style.display='none';
    }catch(e){ console.warn('connect cancelled', e); alert('Connect cancelled'); topNotice.style.display='flex'; }
  } else {
    // open phantom deep link (mobile fallback)
    const u = `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}`;
    window.open(u,'_blank'); topNotice.style.display='flex';
  }
});

trustBtn.addEventListener('click', ()=>{
  // deep link to Trust Wallet (mobile). If not installed, falls back to web link.
  const pageUrl = location.href;
  const trustAndroid = `trust://browser_enable?url=${encodeURIComponent(pageUrl)}`;
  const trustWeb = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(pageUrl)}`;
  // try deep link, then fallback
  window.location.href = trustAndroid;
  setTimeout(()=>{ window.open(trustWeb,'_blank'); topNotice.style.display='flex'; },1200);
});

solflareBtn.addEventListener('click', async ()=>{
  if(window.solflare && window.solflare.isSolflare){
    try{ await window.solflare.connect(); provider = window.solflare; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); topNotice.style.display='none'; }
    catch(e){ console.warn('solflare cancel', e); alert('Connect cancelled'); topNotice.style.display='flex'; }
  } else {
    window.open(`https://solflare.com/ul/browse/${encodeURIComponent(location.href)}`,'_blank'); topNotice.style.display='flex';
  }
});

mintBtn.addEventListener('click', async ()=>{
  if(minted >= TOTAL_CAP){ alert('Sold out'); return; }
  if(!provider || !provider.publicKey){ alert('No wallet connected. Use Connect Phantom or open with Trust/Solflare.'); topNotice.style.display='flex'; return; }

  const totalUSD = PRICE_USD * quantity;
  const totalSOL = totalUSD / SOL_PRICE;
  const lamports = Math.round(totalSOL * LAMPORTS_PER_SOL);

  if(!confirm(`Send ${totalSOL.toFixed(6)} SOL to treasury? Approve in your wallet.`)) return;

  mintBtn.disabled=true; mintBtn.textContent='Waiting for approval...'; statusEl.textContent='';

  try {
    const fromPubkey = provider.publicKey;
    const toPubkey = new PublicKey(TREASURY);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
    tx.feePayer = fromPubkey;

    // modern blockhash
    const latest = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;

    // prefer signAndSendTransaction if available
    if(typeof provider.signAndSendTransaction === 'function'){
      const signedResp = await provider.signAndSendTransaction(tx);
      const sig = signedResp?.signature || signedResp;
      await connection.confirmTransaction(sig, 'confirmed');
      await handlePostMint(sig);
    } else if(typeof provider.signTransaction === 'function'){
      const signed = await provider.signTransaction(tx);
      const raw = signed.serialize();
      const sig = await connection.sendRawTransaction(raw);
      await connection.confirmTransaction(sig, 'confirmed');
      await handlePostMint(sig);
    } else {
      throw new Error('Wallet cannot sign transactions from this page.');
    }
  } catch (err) {
    console.error('tx error', err);
    const msg = (err && err.message) ? err.message : String(err);
    if(msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancel')) alert('Transaction cancelled by user.');
    else alert('Transaction failed or cancelled: ' + msg);
  } finally {
    mintBtn.disabled=false; mintBtn.textContent='MINT';
    updateUI();
  }
});

async function handlePostMint(sig){
  const recs = JSON.parse(localStorage.getItem('sf_records')||'[]');
  for(let i=0;i<quantity;i++){
    if(minted>=TOTAL_CAP) break;
    const cid = METADATA[nextIndex % METADATA.length];
    const id = recs.length + 1;
    recs.push({ id, cid, tx: sig, ts: Date.now() });
    nextIndex = (nextIndex + 1) % METADATA.length;
    minted++;
  }
  localStorage.setItem('sf_records', JSON.stringify(recs));
  localStorage.setItem('sf_nextidx', String(nextIndex));
  localStorage.setItem('sf_minted', String(minted));
  records = recs;
  renderGallery(); updateUI();
  statusEl.textContent = 'Confirmed — tx: ' + sig;
  fireConfetti();
  document.getElementById('proofSection').style.display = 'block';
}

function renderGallery(){
  galleryEl.innerHTML='';
  const show = records.slice(-30).reverse();
  if(show.length===0){ galleryEl.innerHTML = '<div class="small" style="color:#9fb0c8">No mints yet</div>'; return; }
  for(const r of show){
    const tile=document.createElement('div'); tile.className='tile';
    const img=document.createElement('img'); img.src=`https://gateway.lighthouse.storage/ipfs/${r.cid}`; img.alt=`#${r.id}`;
    const label=document.createElement('div'); label.textContent=`#${r.id}`; label.style.marginTop='6px'; label.style.fontWeight='700';
    tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
  }
}

function updateUI(){
  qtyEl.textContent = quantity;
  totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
  totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
  document.getElementById('treasury').textContent = TREASURY;
  counterEl.textContent = `${minted} people have minted`;
  progressBar.style.width = Math.min(100,(minted/TOTAL_CAP)*100) + '%';
  if(minted >= TOTAL_CAP){ document.getElementById('soldOut').style.display='block'; mintBtn.disabled=true; } else { document.getElementById('soldOut').style.display='none'; mintBtn.disabled=false; }
}

function fireConfetti(){
  const canvas=document.getElementById('confettiCanvas'); const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const parts=[]; for(let i=0;i<120;i++) parts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height*0.2,dx:(Math.random()-0.5)*6,dy:Math.random()*6+2,s:Math.random()*6+3,color:`hsl(${Math.random()*360},80%,60%)`});
  let raf; function loop(){ ctx.clearRect(0,0,canvas.width,canvas.height); for(const p of parts){ ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.s,p.s); p.x+=p.dx; p.y+=p.dy; if(p.y>canvas.height) p.y=-10; } raf=requestAnimationFrame(loop); } loop();
  setTimeout(()=>{ cancelAnimationFrame(raf); ctx.clearRect(0,0,canvas.width,canvas.height); },3500);
}

// auto-sync local storage every 6s to reflect other tabs
setInterval(()=> {
  const storeMinted = parseInt(localStorage.getItem('sf_minted')||'0');
  if(!isNaN(storeMinted) && storeMinted !== minted){
    minted = storeMinted;
    records = JSON.parse(localStorage.getItem('sf_records')||'[]');
    renderGallery(); updateUI();
  }
},6000);

// init
renderGallery(); updateUI();
if(!(window.solana && window.solana.isPhantom) && !window.solflare) topNotice.style.display='flex';