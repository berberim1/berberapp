

    (function(){
      const overlay = document.getElementById("authModal");

      // Modal aç
      document.querySelectorAll(".open-auth").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          overlay.classList.add("active");
          document.body.classList.add("no-scroll");
        });
      });
      // Modal kapat
      overlay.querySelector(".modal-close").addEventListener("click", ()=>{
        overlay.classList.remove("active");
        document.body.classList.remove("no-scroll");
      });
      overlay.addEventListener("click", (e)=>{
        if(e.target === overlay){
          overlay.classList.remove("active");
          document.body.classList.remove("no-scroll");
        }
      });
      document.addEventListener("keydown", (e)=>{
        if(e.key === "Escape"){
          overlay.classList.remove("active");
          document.body.classList.remove("no-scroll");
        }
      });

      // 🔽 Navbar scroll davranışı (mobil)
      const showAt = 60; // 60px aşağıda göster
      const onScroll = () => {
        if (window.innerWidth <= 860) {
          document.body.classList.toggle('scrolled', window.scrollY > showAt);
        } else {
          // masaüstünde her zaman göster (body.scrolled şartına bağlama)
          document.body.classList.add('scrolled');
        }
      };
      window.addEventListener('scroll', onScroll, {passive:true});
      window.addEventListener('resize', onScroll);
      onScroll();
    })();