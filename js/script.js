const crossEl      = document.querySelector('.bg-cross');
const psaEl        = document.querySelector('.bg-psa');
const genEl        = document.querySelector('.bg-gen');
const comingsoonEl = document.querySelector('.bg-comingsoon');
const textEl       = document.getElementById('heroText');
const headerBar    = document.getElementById('headerBar');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  const vh      = window.innerHeight;
  const raw     = Math.min(scrollY / vh, 1);

  // Split 0→1 scroll into 3 staggered fades
  const p1 = Math.min(Math.max(raw * 3,     0), 1);      // 0→0.333
  const p2 = Math.min(Math.max((raw - .333) * 3, 0), 1);  // 0.333→0.667
  const p3 = Math.min(Math.max((raw - .667) * 3, 0), 1);  // 0.667→1

  // Fade logic
  crossEl.style.opacity      = 1 - p1;
  psaEl.style.opacity        = p1 * (1 - p2);
  genEl.style.opacity        = p2 * (1 - p3);
  comingsoonEl.style.opacity = p3;

  // Y-translation for incoming layers
  [[psaEl,p1], [genEl,p2], [comingsoonEl,p3]].forEach(([el,prog]) => {
    el.style.transform = `translateY(${50 * (1 - prog)}px)`;
  });

  // Headline fades out in first 10% of scroll
  const tHeadline = Math.min(raw / 0.1, 1);
  textEl.style.opacity = 1 - tHeadline;

  // Header bar fades in across full scroll
  headerBar.style.opacity = raw;
});
