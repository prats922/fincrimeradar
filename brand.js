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

/* Table overflow fix, second attempt.
   Forcing display:block directly on the table element did not
   reliably create a scrollable container on the live device it was
   tested against, a known inconsistency with that technique across
   browsers. Wrapping the table in a genuine block level div is the
   reliable version of this fix, so this runs on every page and
   physically wraps any comparison table in a scrollable container
   rather than relying on the table's own display mode. */
(function(){
  "use strict";
  var tables = document.querySelectorAll('table.data-table, table.compare-table');
  tables.forEach(function(t){
    if(t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    wrap.style.overflowX = 'auto';
    wrap.style.webkitOverflowScrolling = 'touch';
    wrap.style.maxWidth = '100%';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
})();
