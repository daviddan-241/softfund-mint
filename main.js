// main.js
(function () {
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
  if (!Connection) return console.error('Solana web3 not found');

  const TREASURY = 'GqB1ywkWHq9jpjDSJkhGxuFVz1H6VBfoyJX32BsCjWue';
  const PRICE_USD = 3.20;
  const TOTAL_CAP = 5000;
  const METADATA = [
    "bafkreidstjrabmghkjqwjcpct24g67flpybxs6gd7vpcg724upwibpy4le",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami",
    "bafkreidxd6q6vtpwboxr5eokewalr3ie7xmxjocny5m2ft66fayo5cd6im",
    "bafkreid7v5q6uetszdev5tmlrf2ma43tjfbova7gc7epuzt2lnbhcc4ijm",
    "bafkreidiimwvc36ekicyuxugmo7wcsdhvye3l3fz4l34lvs3lf44tsrqra",
    "bafkreibiip2mn32hvppk4fpfcbob4rszyiamru5mazdpcbanihfylhnami"
  ];

  let minted = 5; // start with 5 people minted
  let quantity = 1;
  let SOL_PRICE = 150;
  let records = [];
  let nextIndex = 0;

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
  const progressBar = document.getElementById('progressBar');
  const counterEl = document.getElementById('counter');
  const topNotice = document.getElementById('topNotice');
  const copyNotice = document.getElementById('copyNotice');

  let provider = null;

  // --- UI functions ---
  function updateTotals() {
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    qtyEl.textContent = quantity;
  }

  function updateUI() {
    qtyEl.textContent = quantity;
    totalUSDEl.textContent = (PRICE_USD * quantity).toFixed(3);
    totalSOLEl.textContent = ((PRICE_USD * quantity) / SOL_PRICE).toFixed(6);
    counterEl.textContent = `${minted} people have minted`;
    progressBar.style.width = Math.min(100, (minted / TOTAL_CAP) * 100) + '%';
  }

  function renderGallery() {
    galleryEl.innerHTML = '';
    const recent = records.slice(-10).reverse();
    if (!recent.length) galleryEl.innerHTML = '<div class="small" style="color:#9fb0c8">No mints yet</div>';
    else {
      for (const r of recent) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        const img = document.createElement('img');
        img.src = `https://gateway.lighthouse.storage/ipfs/${r.cid}`;
        img.alt = `#${r.id}`;
        const label = document.createElement('div');
        label.textContent = `#${r.id}`;
        label.style.marginTop = '6px';
        label.style.fontWeight = '700';
        tile.appendChild(img);
        tile.appendChild(label);
        galleryEl.appendChild(tile);
      }
    }
  }

  function showTopNotice(){ topNotice.style.display = 'flex'; }
  function hideTopNotice(){ topNotice.style.display = 'none'; }

  // --- Button events ---
  decBtn.addEventListener('click', ()=>{ if(quantity>1) quantity--; updateTotals(); });
  incBtn.addEventListener('click', ()=>{ if(quantity<10) quantity++; updateTotals(); });
  copyTreasury.addEventListener('click', ()=> navigator.clipboard.writeText(TREASURY).then(()=>alert('Treasury copied')));
  copyNotice.addEventListener('click', ()=> navigator.clipboard.writeText(document.getElementById('noticeLink').href).then(()=>alert('Link copied')));

  phantomBtn.addEventListener('click', async ()=>{
    if(window.solana && window.solana.isPhantom){
      try{
        await window.solana.connect();
        provider = window.solana;
        connectedEl.textContent = 'Connected: ' + provider.publicKey.toString();
        hideTopNotice();
      }catch(e){
        console.warn('phantom cancel', e);
        showTopNotice();
      }
    } else {
      window.open(`https://phantom.app/ul/browse/${encodeURIComponent(location.href)}`, '_blank');
      showTopNotice();
    }
  });

  trustBtn.addEventListener('click', ()=>{
    // Trust Wallet deep link
    const url = location.href;
    const android = `trust://browser_enable?url=${encodeURIComponent(url)}`;
    const webFallback = `https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`;
    window.location.href = android;
    setTimeout(()=> window.open(webFallback, '_blank'), 1200);
  });

  solflareBtn.addEventListener('click', async ()=>{
    if(window.solflare && window.solflare.isSolflare){
      try{ await window.solflare.connect(); provider = window.solflare; connectedEl.textContent = 'Connected: ' + provider.publicKey.toString(); hideTopNotice(); }
      catch(e){ console.warn('solflare cancel', e); showTopNotice(); }
    } else window.open(`https://solflare.com/ul/browse/${encodeURIComponent(location.href)}`, '_blank');
  });

  // --- Mint ---
  mintBtn.addEventListener('click', async ()=>{
    if(minted >= TOTAL_CAP){ alert('Sold out'); return; }
    if(!provider || !provider.publicKey){ alert('No wallet connected'); showTopNotice(); return; }

    const totalSOL = (PRICE_USD * quantity) / SOL_PRICE;
    const lamports = Math.round(totalSOL * LAMPORTS_PER_SOL);

    mintBtn.disabled = true; mintBtn.textContent = 'Waiting for approval...';

    try{
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: new PublicKey(TREASURY),
        lamports
      }));
      tx.feePayer = provider.publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      let sig;
      if(provider.signAndSendTransaction){
        const resp = await provider.signAndSendTransaction(tx);
        sig = resp.signature || resp;
      } else if(provider.signTransaction){
        const signed = await provider.signTransaction(tx);
        const raw = signed.serialize();
        sig = await connection.sendRawTransaction(raw);
      } else throw new Error('Wallet cannot sign');

      await connection.confirmTransaction(sig, 'confirmed');

      // post-mint updates
      for(let i=0;i<quantity;i++){
        const cid = METADATA[nextIndex % METADATA.length];
        records.push({ id: minted+1, cid, tx: sig, ts: Date.now() });
        nextIndex = (nextIndex+1) % METADATA.length;
        minted++;
      }

      renderGallery();
      updateUI();
      alert('Transaction confirmed! TX: ' + sig);
    }catch(e){
      console.error('Mint failed', e);
      alert('Transaction failed: ' + (e.message || e));
    }finally{
      mintBtn.disabled = false; mintBtn.textContent = 'MINT (Mainnet)';
    }
  });

  // init
  updateTotals();
  updateUI();
  renderGallery();
})();