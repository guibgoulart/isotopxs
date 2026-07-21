/* ISOTOPXS — comportamento do site. JS puro, sem dependências. */

document.addEventListener('DOMContentLoaded', () => {

  /* marca o link ativo no menu */
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a, .nav__links--mobile a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  /* menu mobile (hambúrguer) */
  const navToggle = document.querySelector('.nav__toggle');
  const mobileMenu = document.querySelector('.nav__links--mobile');
  if (navToggle && mobileMenu) {
    const closeMenu = () => {
      navToggle.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    navToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    window.addEventListener('resize', () => {
      if (window.innerWidth > 760) closeMenu();
    });
  }

  /* nav sólida ao rolar */
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* revela seções ao entrar na tela */
  const revealTargets = document.querySelectorAll('.reveal, .reveal-stagger');
  if (revealTargets.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .15, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(el => io.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  /* contadores animados (stats) */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const countIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10);
        const duration = 1100;
        const start = performance.now();
        function step(now) {
          const p = Math.min(1, (now - start) / duration);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        countIo.unobserve(el);
      });
    }, { threshold: .4 });
    counters.forEach(el => countIo.observe(el));
  }

  /* tabs de música/letra */
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

  /* toggle de áudio de fundo (pronto para receber um mp3 real em
     assets/audio/loop.mp3 — sem src ainda) */
  const audioBtn = document.querySelector('.audio-toggle');
  const bgAudio = document.getElementById('bg-audio');
  if (audioBtn && bgAudio) {
    audioBtn.addEventListener('click', () => {
      if (!bgAudio.src) {
        audioBtn.textContent = '…';
        setTimeout(() => (audioBtn.textContent = '▶'), 1000);
        return;
      }
      if (bgAudio.paused) {
        bgAudio.play();
        audioBtn.textContent = '❚❚';
      } else {
        bgAudio.pause();
        audioBtn.textContent = '▶';
      }
    });
  }
});
