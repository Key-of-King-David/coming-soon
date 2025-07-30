const crossEl = document.querySelector('.bg-cross');
    const psaEl   = document.querySelector('.bg-psa');
    const genEl   = document.querySelector('.bg-gen');
    const textEl    = document.getElementById('heroText');
    const headerBar = document.getElementById('headerBar');

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const vh      = window.innerHeight;
      const raw     = Math.min(scrollY / vh, 1);

      // Phase1: 0→0.5, Phase2: 0.5→1
      const p1 = Math.min(Math.max(raw * 2, 0), 1);
      const p2 = Math.min(Math.max((raw - 0.5) * 2, 0), 1);

      // Cross fades out
      crossEl.style.opacity = 1 - p1;

      // PSA fades in then out
      psaEl.style.opacity    = p1 * (1 - p2);
      psaEl.style.transform  = `translateY(${50 * (1 - p1)}px)`;

      // Gen fades in
      genEl.style.opacity    = p2;
      genEl.style.transform  = `translateY(${50 * (1 - p2)}px)`;

      // Headline now fades in first 20% of scroll
      const fadeThreshold = 0.2;                   // 20% of vh
      const tHeadline = Math.min(raw / fadeThreshold, 1);
      textEl.style.opacity = 1 - tHeadline;

      // Header bar fade
      headerBar.style.opacity = raw;
    });