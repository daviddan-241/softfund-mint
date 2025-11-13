// main.js
(function () {
  /* Buffer polyfill for browsers */
  if (typeof window.Buffer === 'undefined') {
    window.Buffer = {
      from: function (input, enc) {
        if (enc === 'base64') {
          const bin = atob(input);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr;
        } else {
          return new TextEncoder().encode(String(input));
        }
      }
    };
  }

  const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};
  if (!Connection) {
    console.error('Solana web3 not found.');
    return;
  }

  // CONFIG
  const TREASURY = 'GqB1ywkWHq9jpjDSJkhGxuFVz1H6VBfoyJX32BsCjWue';
  const PRICE_USD = 3.20;
  const TOTAL_CAP = 5000;
  const METADATA = [
    "bafkreidstjrabmghkjqwjcpct24g67flpybxs6gd7vpcg724upwibpy4le",
    "bafkreidxd6q6vtpwboxr5eokewalr3ie7xmxjocny5m2ft66fayo5cd6im",
    "bafkreid7v5q6uetszdev5tmlrf2ma43tjfbova7gc7epuzt2lnbhcc4ijm",
    "bafkreidiimwvc36ekicyuxugmo7wcsdhvye3l3fz4l34lvs3lf44tsrqra"
  ];

  // Optional Supabase (leave empty if not used)
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';

  // Local storage keys
  const STORAGE = { records: 'sf_records_main', nextIdx: 'sf_nextidx_main', minted: 'sf_minted_main' };
  let minted = 5; // start with 5 people minted
  let quantity = 1;
  let SOL_PRICE = 150;
  let records = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
  let nextIndex = parseInt(localStorage.getItem(STORAGE.nextIdx) || '0');

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

  // BroadcastChannel
  let bc = null;
  try {
    bc = new BroadcastChannel('softfund_channel');
    bc.onmessage = (ev) => { if (ev?.data?.type === 'update') applyRemoteUpdate(ev.data.payload); };
  } catch (e) { bc = null; }

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
    if (payload.minted != null) { minted = payload.minted; localStorage.setItem(STORAGE.minted, String(minted)); }
    if (payload.records) { records = payload.records; localStorage.setItem(STORAGE.records, JSON.stringify(records)); }
    renderGallery(); updateUI();
  }

  function updateTotals() {
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    qtyEl.textContent = quantity;
  }
  updateTotals();

  decBtn.addEventListener('click', () => { if (quantity > 1) quantity--; updateTotals(); });
  incBtn.addEventListener('click', () => { if (quantity < 10) quantity++; updateTotals(); });
  copyTreasury.addEventListener('click', () => navigator.clipboard.writeText(TREASURY).then(() => alert('Treasury copied')));
  copyNotice.addEventListener('click', () => navigator.clipboard.writeText(document.getElementById('noticeLink').href).then(() => alert('Link copied')));

  // Fetch SOL price
  (async function fetchPrice() {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const j = await r.json();
      if (j?.solana?.usd) SOL_PRICE = j.solana.usd;
    } catch (e) { console.warn('price failed', e); }
    updateTotals();
  })();

  // Render gallery
  function renderGallery() {
    galleryEl.innerHTML = '';
    const recent = records.slice(-10).reverse();
    if (recent.length === 0) galleryEl.innerHTML = '<div class="small" style="color:#9fb0c8">No mints yet</div>';
    else {
      for (const r of recent) {
        const tile = document.createElement('div'); tile.className = 'tile';
        const img = document.createElement('img'); img.src = `https://gateway.lighthouse.storage/ipfs/${r.cid}`; img.alt = `#${r.id}`;
        const label = document.createElement('div'); label.textContent = `#${r.id}`; label.style.marginTop = '6px'; label.style.fontWeight = '700';
        tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
      }
    }
    // sample fill
    const fill = Math.max(0, 6 - recent.length);
    for (let i = 0; i < fill; i++) {
      const cid = METADATA[i % METADATA.length];
      const tile = document.createElement('div'); tile.className = 'tile';
      const img = document.createElement('img'); img.src = `https://gateway.lighthouse.storage/ipfs/${cid}`; img.alt = `s${i + 1}`;
      const label = document.createElement('div'); label.textContent = `s${i + 1}`; label.style.marginTop = '6px'; label.style.fontWeight = '700';
      tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
    }
  }

  // Top notice
  function showTopNotice() { topNotice.style.display = 'flex'; }
  function hideTopNotice() { topNotice.style.display = 'none'; }

  // Wallet buttons
  phantomBtn.addEventListener('click', async () => {
    if (window.solana && window.solana.isPhantom) {
      try { await window.solana.connect(); provider = window.solana; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); hideTopNotice(); }
      catch (e) { console.warn('phantom cancel', e); showTopNotice(); }
    } else {
      window.open(`https://phantom.app/ul/browse/${encodeURIComponent(location.href)}`, '_blank');
      showTopNotice();
    }
  });

  trustBtn.addEventListener('click', () => {
    const pageUrl = location.href;
    const trustAndroid = `trust://browser_enable?url=${encodeURIComponent(pageUrl)}`;
    const trustWeb = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(pageUrl)}`;
    window.location.href = trustAndroid;
    setTimeout(() => { window.open(trustWeb, '_blank'); showTopNotice(); }, 1200);
  });

  solflareBtn.addEventListener('click', async () => {
    if (window.solflare && window.solflare.isSolflare) {
      try { await window.solflare.connect(); provider = window.solflare; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); hideTopNotice(); }
      catch (e) { console.warn('solflare cancel', e); showTopNotice(); }
    } else {
      window.open(`https://solflare.com/ul/browse/${encodeURIComponent(location.href)}`, '_blank'); showTopNotice();
    }
  });

  // Mint flow (send SOL directly without confirm)
  mintBtn.addEventListener('click', async () => {
    if (minted >= TOTAL_CAP) { alert('Sold out'); return; }
    if (!provider || !provider.publicKey) { alert('No wallet connected.'); showTopNotice(); return; }

    const totalUSD = PRICE_USD * quantity;
    const totalSOL = totalUSD / SOL_PRICE;
    const lamports = BigInt(Math.round(totalSOL * LAMPORTS_PER_SOL));

    mintBtn.disabled = true;
    mintBtn.textContent = 'Processing...';

    try {
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: new PublicKey(TREASURY),
        lamports
      }));
      tx.feePayer = provider.publicKey;
      const latest = await connection.getLatestBlockhash('confirmed'); tx.recentBlockhash = latest.blockhash;

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
        throw new Error('Wallet does not support signing.');
      }
    } catch (err) {
      console.error('mint error', err);
      alert('Transaction failed: ' + (err.message || err));
    } finally {
      mintBtn.disabled = false;
      mintBtn.textContent = 'MINT (Mainnet)';
    }
  });

  async function postMint(sig) {
    const recs = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
    for (let i = 0; i < quantity; i++) {
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

    broadcastUpdate({ minted, records });

    renderGallery(); updateUI(); doConfetti();
  }

  function doConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const parts = [];
    for (let i = 0; i < 120; i++)
      parts.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.2, dx: (Math.random() - 0.5) * 6, dy: Math.random() * 6 + 2, s: Math.random() * 6 + 3, color: `hsl(${Math.random() * 360},80%,60%)` });
    let raf;
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.s, p.s);
        p.x += p.dx;
        p.y += p.dy;
        if (p.y > canvas.height) p.y = -10;
      }
      raf = requestAnimationFrame(loop);
    }
    loop();
    setTimeout(() => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 3500);
  }

  function updateUI() {
    qtyEl.textContent = quantity;
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    document.getElementById('rate').textContent = `(1 SOL = $${SOL_PRICE.toFixed(2)})`;
    document.getElementById('treasury').textContent = TREASURY;
    counterEl.textContent = `${minted} people have minted`;
    progressBar.style.width = Math.min(100, (minted / TOTAL_CAP) * 100) + '%';
    document.getElementById('soldOut').style.display = minted >= TOTAL_CAP ? 'block' : 'none';
    mintBtn.disabled = minted >= TOTAL_CAP;
  }

  setInterval(() => {
    const storeMinted = parseInt(localStorage.getItem(STORAGE.minted) || '0');
    if (!isNaN(storeMinted) && storeMinted !== minted) {
      minted = storeMinted;
      records = JSON.parse(localStorage.getItem(STORAGE.records) || '[]');
      renderGallery();
      updateUI();
    }
  }, 6000);

  renderGallery();
  updateUI();
  if (!(window.solana && window.solana.isPhantom) && !window.solflare) showTopNotice();
})();