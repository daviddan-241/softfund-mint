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
  if (!Connection) { console.error('Solana web3 not found'); return; }

  // CONFIG
  const TREASURY = 'GqB1ywkWHq9jpjDSJkhGxuFVz1H6VBfoyJX32BsCjWue';
  const PRICE_USD = 3.2;
  const TOTAL_CAP = 5000;
  const METADATA = [
    "bafkreidstjrabmghkjqwjcpct24g67flpybxs6gd7vpcg724upwibpy4le",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami",
    "bafkreidxd6q6vtpwboxr5eokewalr3ie7xmxjocny5m2ft66fayo5cd6im",
    "bafkreid7v5q6uetszdev5tmlrf2ma43tjfbova7gc7epuzt2lnbhcc4ijm",
    "bafkreidiimwvc36ekicyuxugmo7wcsdhvye3l3fz4l34lvs3lf44tsrqra",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami"
  ];

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
  const progressBar = document.getElementById('progressBar');
  const counterEl = document.getElementById('counter');
  const topNotice = document.getElementById('topNotice');
  const copyNotice = document.getElementById('copyNotice');

  let provider = null;
  let quantity = 1;
  let SOL_PRICE = 150;
  let minted = 5; // start with 5 people minted
  let records = [];

  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

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
    } catch (e) { console.warn('price fetch failed', e); }
    updateTotals();
  })();

  function renderGallery() {
    galleryEl.innerHTML = '';
    const recent = records.slice(-10).reverse();
    if (!recent.length) galleryEl.innerHTML = '<div class="small" style="color:#9fb0c8">No mints yet</div>';
    else {
      for (const r of recent) {
        const tile = document.createElement('div'); tile.className = 'tile';
        const img = document.createElement('img'); img.src = `https://gateway.lighthouse.storage/ipfs/${r.cid}`; img.alt = `#${r.id}`;
        const label = document.createElement('div'); label.textContent = `#${r.id}`; label.style.marginTop = '6px'; label.style.fontWeight = '700';
        tile.appendChild(img); tile.appendChild(label); galleryEl.appendChild(tile);
      }
    }
  }

  function updateUI() {
    qtyEl.textContent = quantity;
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    counterEl.textContent = `${minted} people have minted`;
    progressBar.style.width = Math.min(100, (minted / TOTAL_CAP) * 100) + '%';
    mintBtn.disabled = minted >= TOTAL_CAP;
  }

  // Wallet connections
  phantomBtn.addEventListener('click', async () => {
    if (window.solana?.isPhantom) {
      try { await window.solana.connect(); provider = window.solana; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); topNotice.style.display = 'none'; }
      catch { topNotice.style.display = 'flex'; }
    } else window.open(`https://phantom.app/ul/browse/${encodeURIComponent(location.href)}`, '_blank');
  });

  trustBtn.addEventListener('click', () => {
    const trustAndroid = `trust://browser_enable?url=${encodeURIComponent(location.href)}`;
    const trustWeb = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(location.href)}`;
    window.location.href = trustAndroid;
    setTimeout(() => { window.open(trustWeb, '_blank'); }, 1200);
  });

  solflareBtn.addEventListener('click', async () => {
    if (window.solflare?.isSolflare) {
      try { await window.solflare.connect(); provider = window.solflare; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); topNotice.style.display = 'none'; }
      catch { topNotice.style.display = 'flex'; }
    } else window.open(`https://solflare.com/ul/browse/${encodeURIComponent(location.href)}`, '_blank');
  });

  // Mint flow
  mintBtn.addEventListener('click', async () => {
    if (minted >= TOTAL_CAP) { alert('Sold out'); return; }
    if (!provider || !provider.publicKey) { alert('No wallet connected.'); topNotice.style.display = 'flex'; return; }

    const totalSOL = (PRICE_USD * quantity) / SOL_PRICE;
    const lamports = Math.round(totalSOL * LAMPORTS_PER_SOL);

    mintBtn.disabled = true;
    mintBtn.textContent = 'Processing...';

    try {
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: provider.publicKey, toPubkey: new PublicKey(TREASURY), lamports }));
      tx.feePayer = provider.publicKey;
      const latest = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = latest.blockhash;

      let sig;
      if (provider.signAndSendTransaction) {
        sig = (await provider.signAndSendTransaction(tx)).signature;
      } else if (provider.signTransaction) {
        const signed = await provider.signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize());
      } else throw new Error('Wallet does not support signing');

      await connection.confirmTransaction(sig, 'confirmed');

      // Update local state
      for (let i = 0; i < quantity; i++) {
        records.push({ id: minted + 1, cid: METADATA[minted % METADATA.length], tx: sig });
        minted++;
      }

      renderGallery();
      updateUI();
      alert(`Transaction confirmed: ${sig}`);
    } catch (err) {
      console.error(err);
      alert('Transaction failed: ' + (err.message || err));
    } finally {
      mintBtn.disabled = false;
      mintBtn.textContent = 'MINT (Mainnet)';
    }
  });

  // Initial render
  renderGallery();
  updateUI();

  // Show notice if no wallet
  if (!(window.solana?.isPhantom || window.solflare?.isSolflare)) topNotice.style.display = 'flex';
})();