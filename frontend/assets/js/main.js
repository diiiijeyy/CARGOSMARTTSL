document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* =================== PRELOADER =================== */
  window.addEventListener("load", function () {
    const preloader = document.getElementById("preloader");
    if (preloader) {
      preloader.style.opacity = "0";
      preloader.style.visibility = "hidden";
      setTimeout(() => preloader.remove(), 600);
    }
  });

  /* =================== OTP INPUT BOXES =================== */
  document.querySelectorAll(".code-box").forEach((box, i, arr) => {
    box.addEventListener("input", (e) => {
      if (e.target.value && i < arr.length - 1) arr[i + 1].focus();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) arr[i - 1].focus();
    });
  });

  /* =================== STICKY HEADER =================== */
  const selectHeader = document.querySelector("#header");
  if (selectHeader) {
    document.addEventListener("scroll", () => {
      window.scrollY > 100
        ? selectHeader.classList.add("sticked")
        : selectHeader.classList.remove("sticked");
    });
  }

  /* =================== NAVBAR ACTIVE STATE =================== */
  let navbarlinks = document.querySelectorAll("#navbar a");

  function navbarlinksActive() {
    navbarlinks.forEach((navbarlink) => {
      if (!navbarlink.hash) return;

      let section = document.querySelector(navbarlink.hash);
      if (!section) return;

      let position = window.scrollY + 200;

      if (
        position >= section.offsetTop &&
        position <= section.offsetTop + section.offsetHeight
      ) {
        navbarlink.classList.add("active");
      } else {
        navbarlink.classList.remove("active");
      }
    });
  }

  window.addEventListener("load", navbarlinksActive);
  document.addEventListener("scroll", navbarlinksActive);

  /* =================== MOBILE NAV TOGGLE =================== */
  const mobileNavShow = document.querySelector(".mobile-nav-show");
  const mobileNavHide = document.querySelector(".mobile-nav-hide");

  document.querySelectorAll(".mobile-nav-toggle").forEach((el) => {
    el.addEventListener("click", function (event) {
      event.preventDefault();
      mobileNavToogle();
    });
  });

  function mobileNavToogle() {
    document.querySelector("body").classList.toggle("mobile-nav-active");
    mobileNavShow.classList.toggle("d-none");
    mobileNavHide.classList.toggle("d-none");
  }

  /* =================== HIDE MOBILE NAV ON LINK CLICK =================== */
  document.querySelectorAll("#navbar a").forEach((navbarlink) => {
    if (!navbarlink.hash) return;

    let section = document.querySelector(navbarlink.hash);
    if (!section) return;

    navbarlink.addEventListener("click", () => {
      if (document.querySelector(".mobile-nav-active")) {
        mobileNavToogle();
      }
    });
  });

  /* =================== TOGGLE MOBILE NAV DROPDOWNS =================== */
  const navDropdowns = document.querySelectorAll(".navbar .dropdown > a");
  navDropdowns.forEach((el) => {
    el.addEventListener("click", function (event) {
      if (document.querySelector(".mobile-nav-active")) {
        event.preventDefault();
        this.classList.toggle("active");
        this.nextElementSibling.classList.toggle("dropdown-active");

        let dropDownIndicator = this.querySelector(".dropdown-indicator");
        dropDownIndicator.classList.toggle("bi-chevron-up");
        dropDownIndicator.classList.toggle("bi-chevron-down");
      }
    });
  });

  /* =================== SCROLL TOP BUTTON =================== */
  const scrollTop = document.querySelector(".scroll-top");
  if (scrollTop) {
    const togglescrollTop = function () {
      window.scrollY > 100
        ? scrollTop.classList.add("active")
        : scrollTop.classList.remove("active");
    };
    window.addEventListener("load", togglescrollTop);
    document.addEventListener("scroll", togglescrollTop);
    scrollTop.addEventListener(
      "click",
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      })
    );
  }

  /* =================== INIT GLIGHTBOX =================== */
  const glightbox = GLightbox({
    selector: ".glightbox",
  });

  /* =================== INIT PURE COUNTER =================== */
  new PureCounter();

  /* =================== SWIPER (SLIDES-1) =================== */
  new Swiper(".slides-1", {
    speed: 600,
    loop: true,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    slidesPerView: "auto",
    pagination: {
      el: ".swiper-pagination",
      type: "bullets",
      clickable: true,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
  });

  /* =================== SWIPER (SLIDES-3) =================== */
  new Swiper(".slides-3", {
    speed: 600,
    loop: true,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    slidesPerView: "auto",
    pagination: {
      el: ".swiper-pagination",
      type: "bullets",
      clickable: true,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
    breakpoints: {
      320: {
        slidesPerView: 1,
        spaceBetween: 40,
      },
      1200: {
        slidesPerView: 3,
      },
    },
  });

  /* =================== GALLERY SLIDER =================== */
  new Swiper(".gallery-slider", {
    speed: 400,
    loop: true,
    centeredSlides: true,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    slidesPerView: "auto",
    pagination: {
      el: ".swiper-pagination",
      type: "bullets",
      clickable: true,
    },
    breakpoints: {
      320: {
        slidesPerView: 1,
        spaceBetween: 20,
      },
      640: {
        slidesPerView: 3,
        spaceBetween: 20,
      },
      992: {
        slidesPerView: 5,
        spaceBetween: 20,
      },
    },
  });

  /* =================== ANIMATION ON SCROLL (AOS) =================== */
  function aos_init() {
    AOS.init({
      duration: 1000,
      easing: "ease-in-out",
      once: true,
      mirror: false,
    });
  }

  window.addEventListener("load", () => {
    aos_init();
  });
});

/* =================== TRACK SHIPMENT FUNCTION =================== */
function trackShipment() {
  const trackingNumber = document.getElementById("trackingNumber").value.trim();
  if (!trackingNumber) {
    alert("Please enter a tracking number.");
    return;
  }

  const shipmentData = {
    number: trackingNumber,
    date: "28 February 2025",
    time: "11:30 am",
    from: "Barangay 2, Calamba City",
    to: "Canlubang, Calamba City",
    status: "Delivered",
  };

  document.getElementById("trackNum").textContent = shipmentData.number;
  document.getElementById("trackDate").textContent = shipmentData.date;
  document.getElementById("trackTime").textContent = shipmentData.time;
  document.getElementById("trackFrom").textContent = shipmentData.from;
  document.getElementById("trackTo").textContent = shipmentData.to;
  document.getElementById("trackStatus").innerHTML = `
    <i class="fas fa-check-circle"></i> ${shipmentData.status}
  `;

  document.getElementById("tracking-result").classList.remove("d-none");
}