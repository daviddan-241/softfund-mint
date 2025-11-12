// main.js
// Softfund main frontend logic (Phantom / Trust / Solflare friendly)
// Uses BroadcastChannel + localStorage to sync progress across tabs.

(function () {
  /* Minimal Buffer polyfill for web3 in browsers */
  if (typeof window.Buffer === 'undefined') {
    window.Buffer = {
      from: function (input, enc) {
        if (enc === 'base64') {
          const bin = atob(input);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr;
        } else {
          const encText = new TextEncoder();
          return encText.encode(String(input));
        }
      }
    };
  }

  const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
  if (!Connection) {
    console.error('Solana web3 not found (IIFE).');
    return;
  }

  // CONFIG
  const TREASURY = 'GqB1ywkWHq9jpjDSJkhGxuFVz1H6VBfoyJX32BsCjWue';
  const PRICE_USD = 3.20;
  const TOTAL_CAP = 5000;
  let SOL_PRICE = 150;
  let quantity = 1;
  let minted = parseInt(localStorage.getItem('sf_minted_main') || '0');
  const METADATA = [
    "bafkreidstjrabmghkjqwjcpct24g67flpybxs6gd7vpcg724upwibpy4le",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami",
    "bafkreidxd6q6vtpwboxr5eokewalr3ie7xmxjocny5m2ft66fayo5cd6im",
    "bafkreid7v5q6uetszdev5tmlrf2ma43tjfbova7gc7epuzt2lnbhcc4ijm",
    "bafkreidiimwvc36ekicyuxugmo7wcsdhvye3l3fz4l34lvs3lf44tsrqra",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami"
  ];
  const STORAGE = { records: 'sf_records_main', nextIdx: 'sf_nextidx_main', minted: 'sf_minted_main' };

  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  // DOM refs
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

  let provider = null;
  let records = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
  let nextIndex = parseInt(localStorage.getItem(STORAGE.nextIdx) || '0');

  // BroadcastChannel for cross-tab updates (falls back to storage events)
  let bc = null;
  try { bc = new BroadcastChannel('softfund_channel'); bc.onmessage = (ev) => { if (ev?.data?.type === 'update') { applyRemoteUpdate(ev.data); } }; } catch (e) { bc = null; }

  function broadcastUpdate(payload) {
    const msg = { type: 'update', payload };
    try { if (bc) bc.postMessage(msg); else localStorage.setItem('sf_update_tmp', JSON.stringify({ ts: Date.now(), payload })); } catch (e) {}
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'sf_update_tmp' && e.newValue) {
      try { const parsed = JSON.parse(e.newValue); applyRemoteUpdate(parsed.payload); } catch (e) {}
    }
  });

  function applyRemoteUpdate(payload) {
    if (!payload) return;
    if (payload.minted != null) {
      minted = payload.minted;
      localStorage.setItem(STORAGE.minted, String(minted));
    }
    if (payload.records) {
      records = payload.records;
      localStorage.setItem(STORAGE.records, JSON.stringify(records));
    }
    updateUI();
    renderGallery();
  }

  // UI helpers
  function updateTotals() {
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    qtyEl.textContent = quantity;
  }

  decBtn.addEventListener('click', () => { if (quantity > 1) quantity--; updateTotals(); });
  incBtn.addEventListener('click', () => { if (quantity < 10) quantity++; updateTotals(); });
  copyTreasury.addEventListener('click', () => navigator.clipboard.writeText(TREASURY).then(()=>alert('Treasury copied')));

  copyNotice.addEventListener('click', () => navigator.clipboard.writeText(document.getElementById('noticeLink').href).then(()=>alert('Link copied')));

  // Fetch SOL price
  (async function fetchPrice(){
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const j = await r.json();
      if (j?.solana?.usd) SOL_PRICE = j.solana.usd;
    } catch (e) { console.warn('price fetch failed', e); }
    updateTotals();
  })();

  // Gallery render
  function renderGallery(){
    galleryEl.innerHTML = '';
    const recent = records.slice(-10).reverse();
    if (recent.length === 0) {
      galleryEl.innerHTML = '<div class="small" style="color:#9fb0c8">No mints yet</div>';
    } else {
      for (const r of recent) {
        const tile = document.createElement('div'); tile.className = 'tile';
        const img = document.createElement('img'); img.src = `https://gateway.lighthouse.storage/ipfs/${r.cid}`; img.alt = `#${r.id}`;
        const label = document.createElement('div'); label.textContent = `#${r.id}`; label.style.marginTop='6px'; label.style.fontWeight='700';
        tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
      }
    }
    // Fill with sample CIDs if feel empty
    const fill = 6 - (records.length % 6);
    for (let i=0;i<fill;i++){
      const cid = METADATA[i % METADATA.length] || METADATA[0];
      const tile = document.createElement('div'); tile.className = 'tile';
      const img = document.createElement('img'); img.src = `https://gateway.lighthouse.storage/ipfs/${cid}`; img.alt = `sample`;
      const label = document.createElement('div'); label.textContent = `s${i+1}`; label.style.marginTop='6px'; label.style.fontWeight='700';
      tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
    }
  }

  // show top notice only if no wallet or connect fails
  function showTopNotice() { topNotice.style.display = 'flex'; }
  function hideTopNotice() { topNotice.style.display = 'none'; }

  // Wallet connection logic - strictly separate behavior per button
  phantomBtn.addEventListener('click', async () => {
    // connect to Phantom (extension or in-app)
    if (window.solana && window.solana.isPhantom) {
      try {
        await window.solana.connect();
        provider = window.solana;
        connectedEl.textContent = 'Connected: ' + provider.publicKey.toString();
        hideTopNotice();
      } catch (e) {
        console.warn('phantom connect cancelled', e);
        showTopNotice();
        alert('Phantom connection cancelled');
      }
    } else {
      // fallback: prompt install or open phantom deep link
      const u = `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}`;
      window.open(u, '_blank');
      // also show notice
      showTopNotice();
    }
  });

  trustBtn.addEventListener('click', async () => {
    // Trust Wallet does not inject window.trust reliably.
    // Use deep link to open in Trust app on mobile, otherwise advise user.
    const pageUrl = location.href;
    // Android deep link
    const trustAndroid = `trust://browser_enable?url=${encodeURIComponent(pageUrl)}`;
    // universal web redirect (Trust Wallet link service)
    const trustWeb = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(pageUrl)}`;
    // Try to open deep link - will open app if installed
    window.location.href = trustAndroid;
    // After a small delay also open web fallback (in case deep link doesn't exist)
    setTimeout(()=>{ window.open(trustWeb, '_blank'); showTopNotice(); }, 1200);
  });

  solflareBtn.addEventListener('click', async () => {
    if (window.solflare && window.solflare.isSolflare) {
      try {
        await window.solflare.connect();
        provider = window.solflare;
        connectedEl.textContent = 'Connected: ' + provider.publicKey.toString();
        hideTopNotice();
      } catch (e) {
        console.warn('solflare connect cancelled', e);
        showTopNotice();
        alert('Solflare connection cancelled');
      }
    } else {
      // Solflare mobile deep link fallback
      const solflareUrl = `https://solflare.com/ul/browse/${encodeURIComponent(location.href)}`;
      window.open(solflareUrl, '_blank');
      showTopNotice();
    }
  });

  // Mint flow - uses safe blockhash method and prefers signAndSendTransaction
  mintBtn.addEventListener('click', async () => {
    if (minted >= TOTAL_CAP) { alert('Sold out'); return; }

    const totalUSD = PRICE_USD * quantity;
    const totalSOL = totalUSD / SOL_PRICE;
    const lamports = Math.round(totalSOL * LAMPORTS_PER_SOL);

    if (!provider || !provider.publicKey) {
      alert('No wallet connected. Tap Connect Phantom or open with Trust/Solflare.');
      showTopNotice();
      return;
    }

    if (!confirm(`Send ${totalSOL.toFixed(6)} SOL (mainnet) to treasury? Approve in wallet.`)) return;

    mintBtn.disabled = true; mintBtn.textContent = 'Waiting for approval...';

    try {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: new PublicKey(TREASURY),
        lamports
      }));
      tx.feePayer = provider.publicKey;

      // use latest blockhash
      const latest = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latest.blockhash;

      // prefer signAndSendTransaction
      if (typeof provider.signAndSendTransaction === 'function') {
        const resp = await provider.signAndSendTransaction(tx);
        const sig = resp?.signature || resp;
        await connection.confirmTransaction(sig, 'confirmed');
        await postMint(sig);
      } else if (typeof provider.signTransaction === 'function') {
        const signed = await provider.signTransaction(tx);
        const raw = signed.serialize();
        const sig = await connection.sendRawTransaction(raw);
        await connection.confirmTransaction(sig, 'confirmed');
        await postMint(sig);
      } else {
        throw new Error('Wallet cannot sign transactions from this page.');
      }
    } catch (err) {
      console.error('mint error', err);
      const msg = (err && err.message) ? err.message : String(err);
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancel')) {
        alert('Transaction cancelled by user.');
      } else {
        alert('Transaction failed: ' + msg);
      }
    } finally {
      mintBtn.disabled = false; mintBtn.textContent = 'MINT (Mainnet)';
    }
  });

  async function postMint(sig) {
    // update local records and save + broadcast
    const recs = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
    for (let i=0;i<quantity;i++){
      if (minted >= TOTAL_CAP) break;
      const cid = METADATA[nextIndex % METADATA.length];
      const id = recs.length + 1;
      recs.push({ id, cid, tx: sig, ts: Date.now() });
      nextIndex = (nextIndex + 1) % METADATA.length;
      minted++;
    }
    localStorage.setItem(STORAGE.records, JSON.stringify(recs));
    localStorage.setItem(STORAGE.nextIdx, String(nextIndex));
    localStorage.setItem(STORAGE.minted, String(minted));
    records = recs;

    // broadcast update to other tabs
    broadcastUpdate({ minted, records });

    renderGallery();
    updateUI();
    // confetti
    doConfetti();
    // reveal proof upload if needed
    document.getElementById('proofSection').style.display = 'block';
    alert('Confirmed — tx: ' + sig);
  }

  // confetti
  function doConfetti(){
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const parts = [];
    for (let i=0;i<120;i++) parts.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height*0.2,dx:(Math.random()-0.5)*6,dy:Math.random()*6+2,s:Math.random()*6+3,color:`hsl(${Math.random()*360},80%,60%)`});
    let raf;
    function loop(){ ctx.clearRect(0,0,canvas.width,canvas.height); for(const p of parts){ ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.s,p.s); p.x+=p.dx; p.y+=p.dy; if(p.y>canvas.height) p.y=-10; } raf=requestAnimationFrame(loop); }
    loop(); setTimeout(()=>{ cancelAnimationFrame(raf); ctx.clearRect(0,0,canvas.width,canvas.height); },3500);
  }

  function updateUI(){
    document.getElementById('quantity').textContent = quantity;
    document.getElementById('totalUSD').textContent = (PRICE_USD * quantity).toFixed(3);
    document.getElementById('totalSOL').textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    document.getElementById('rate').textContent = `(1 SOL = $${SOL_PRICE.toFixed(2)})`;
    document.getElementById('treasury').textContent = TREASURY;
    counterEl.textContent = `${minted} people have minted`;
    progressBar.style.width = Math.min(100, (minted / TOTAL_CAP) * 100) + '%';
    const sold = minted >= TOTAL_CAP;
    document.getElementById('soldOut').style.display = sold ? 'block' : 'none';
    mintBtn.disabled = sold;
  }

  // auto sync every 6s (local only) - this helps keep tab UI up to date even if BroadcastChannel not supported
  setInterval(()=> {
    const storeMinted = parseInt(localStorage.getItem(STORAGE.minted) || '0');
    if (!isNaN(storeMinted) && storeMinted !== minted) {
      minted = storeMinted;
      records = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
      renderGallery();
      updateUI();
    }
  }, 6000);

  // initial render
  renderGallery();
  updateUI();

  // if wallet not present, show top notice so user can copy link
  if (!(window.solana && window.solana.isPhantom) && !window.solflare) {
    showTopNotice();
  }
})();