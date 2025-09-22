// ===============================
// Recommended Carousel (Circular & Dynamic)
// ===============================
(function () {
  const data = [
    { img: "img/guzellik-salonu4.jpeg", title: "Fadeaway Hair Artistry", meta: "101 N Main St., Ambler, PA 19002" },
    { img: "img/berber2.jpeg",          title: "Clippers & Co.",         meta: "1290 Main St., Leominster, MA 01453" },
    { img: "img/berber3.jpeg",          title: "Anthony @ Westside Barbersh…", meta: "2800 N MacDill Ave, Tampa, FL" },
    { img: "img/berber4.jpeg",          title: "Tilt Your Krown",        meta: "649 Corporate Dr., Houma, LA 70360" },
    { img: "img/berber5.jpeg",          title: "L.A Men’s Grooming",     meta: "13 Ponquogue Ave, Hampton Bays, NY" },
    { img: "img/berber6.jpeg",          title: "Flawless Fades",         meta: "987 Central Blvd, Orlando, FL" },
    { img: "img/berber7.jpeg",          title: "Jordan’s Styles",        meta: "555 Rose Ave, Santa Rosa, CA" },
    { img: "img/berber8.jpeg",          title: "DezelClipzz",            meta: "333 Vegas Blvd, Las Vegas, NV" },
    { img: "img/berber9.jpeg",          title: "Barber Nine",            meta: "İstanbul • Kadıköy" },
    { img: "img/berber10.jpg",          title: "Barber Ten",             meta: "İstanbul • Beşiktaş" }
  ];

  /** Kart oluşturucu */
  function buildCard(item) {
    const art = document.createElement("article");
    art.className = "rec-card";
    art.innerHTML = `
      <div class="rec-imgwrap">
        <img src="${item.img}" alt="${item.title}">
      </div>
      <div class="rec-info">
        <h3 class="rec-title">${item.title}</h3>
        <p class="rec-meta">${item.meta}</p>
      </div>`;

    // Kart tıklanınca yönlendir
    art.style.cursor = "pointer";
    art.addEventListener("click", () => {
      window.location.href = "ornek-randevu.html";
    });

    return art;
  }

  /** Carousel setup */
  function setupCarousel(root) {
    const track = root.querySelector(".rec-track");
    const leftBtn = root.querySelector(".scroll-btn.left");
    const rightBtn = root.querySelector(".scroll-btn.right");

    if (!track) return;

    // populate original + clone
    [...data, ...data].forEach(it => track.appendChild(buildCard(it)));

    const cardWidth = () =>
      track.querySelector(".rec-card").getBoundingClientRect().width + 16; // gap
    let ticking = false;

    function normalize() {
      const total = track.scrollWidth / 2; // width of original set
      if (track.scrollLeft >= total) track.scrollLeft -= total;
      else if (track.scrollLeft < 0) track.scrollLeft += total;
    }

    function go(dir) {
      const w = cardWidth();
      track.scrollBy({ left: dir * w, behavior: "smooth" });
      if (!ticking) {
        ticking = true;
        setTimeout(() => {
          normalize();
          ticking = false;
        }, 400);
      }
    }

    // Event listeners
    if (leftBtn) leftBtn.addEventListener("click", () => go(-1));
    if (rightBtn) rightBtn.addEventListener("click", () => go(1));
    track.addEventListener("scroll", normalize);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".recommended-section").forEach(setupCarousel);
  });
})();
