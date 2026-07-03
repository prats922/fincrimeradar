/* FinCrimeRadar brand layer: scroll reveals.
   Conservative by design: content is fully visible without JS,
   reveal classes are only applied when IO is supported and the
   user has not requested reduced motion. */
(function(){
  "use strict";
  if(!('IntersectionObserver' in window)) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var targets = document.querySelectorAll(
    'main section, main article, [class*="card"], .footer-col, footer > div'
  );
  if(!targets.length) return;

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  },{threshold:0.08, rootMargin:'0px 0px -30px 0px'});

  var vh = window.innerHeight;
  var stagger = 0;
  targets.forEach(function(el){
    var r = el.getBoundingClientRect();
    /* Never hide anything already on screen at load: no flash, no jank */
    if(r.top < vh && r.bottom > 0) return;
    if(r.height < 8) return;
    el.classList.add('brv');
    el.style.setProperty('--brv-delay', ((stagger++ % 4) * 0.07) + 's');
    io.observe(el);
  });
})();
