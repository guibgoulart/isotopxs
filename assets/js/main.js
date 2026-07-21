/* ISOTOPXS — comportamento do site. JS puro, sem dependências. */

document.addEventListener('DOMContentLoaded', () => {

  /* marca o link ativo no menu */
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.mainnav a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  /* ---- contador de visitas (localStorage, cosmético — trocar por
     contador real / analytics quando o site for pro ar) ---- */
  const counterEl = document.querySelector('.visitor-counter');
  if (counterEl) {
    let n = parseInt(localStorage.getItem('isx_visits') || '133742', 10);
    n += 1;
    localStorage.setItem('isx_visits', String(n));
    const digits = String(n).padStart(7, '0').split('');
    counterEl.innerHTML = digits.map(d => `<span>${d}</span>`).join('');
  }

  /* ---- data de "última atualização" (hoje, formato dd-mm-aaaa) ---- */
  const lastmod = document.querySelector('.lastmod');
  if (lastmod) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    lastmod.textContent = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  /* ---- tabs de música/letra ---- */
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const btns = group.querySelectorAll('.tab-btn');
    const panels = group.querySelectorAll('.tab-panel');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        group.querySelector(`#${btn.dataset.target}`).classList.add('active');
      });
    });
  });

  /* ---- toggle de áudio de fundo (elemento fica pronto para receber
     um mp3 real em assets/audio/loop.mp3 — sem src ainda) ---- */
  const audioBtn = document.querySelector('.audio-toggle');
  const bgAudio = document.getElementById('bg-audio');
  if (audioBtn && bgAudio) {
    audioBtn.addEventListener('click', () => {
      if (!bgAudio.src) {
        audioBtn.textContent = '⚠ SEM TRILHA AINDA';
        setTimeout(() => (audioBtn.textContent = '▶ TOCAR TEMA'), 1800);
        return;
      }
      if (bgAudio.paused) {
        bgAudio.play();
        audioBtn.textContent = '❚❚ PAUSAR TEMA';
      } else {
        bgAudio.pause();
        audioBtn.textContent = '▶ TOCAR TEMA';
      }
    });
  }

  /* ---- livro de visitas — guarda local, no navegador de quem visita.
     Isso é só clima retrô; para recados públicos de verdade, plugar
     um formulário real (Netlify Forms / Formspree) depois. ---- */
  const gbForm = document.getElementById('gb-form');
  const gbList = document.getElementById('gb-list');
  function renderGuestbook() {
    if (!gbList) return;
    const entries = JSON.parse(localStorage.getItem('isx_guestbook') || '[]');
    gbList.innerHTML = entries.length
      ? entries.map(e => `
          <div class="gb-entry">
            <div class="who">${escapeHtml(e.name)}</div>
            <div>${escapeHtml(e.msg)}</div>
            <div class="when">${e.when}</div>
          </div>`).join('')
      : '<p>ninguém assinou ainda. seja o primeiro mandrake.</p>';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  if (gbForm) {
    renderGuestbook();
    gbForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = gbForm.name.value.trim() || 'anônimo contaminado';
      const msg = gbForm.msg.value.trim();
      if (!msg) return;
      const entries = JSON.parse(localStorage.getItem('isx_guestbook') || '[]');
      entries.unshift({ name, msg, when: new Date().toLocaleDateString('pt-BR') });
      localStorage.setItem('isx_guestbook', JSON.stringify(entries.slice(0, 50)));
      gbForm.reset();
      renderGuestbook();
    });
  }

});
