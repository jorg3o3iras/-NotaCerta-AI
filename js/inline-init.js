/**
 * Extraído do <script> inline original.
 * Contém o toggleMenu global e o handler de DOMContentLoaded.
 */

function toggleMenu() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("menuOverlay");
  sb.classList.toggle("open");
  ov.classList.toggle("active");
  document.body.style.overflow = sb.classList.contains("open") ? "hidden" : "";
}

document.addEventListener("DOMContentLoaded", function () {
  const app = document.getElementById("app");
  if (app) app.style.display = "flex";
  if (typeof go === "function") go("dashboard");
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("menuOverlay").classList.remove("active");
      document.body.style.overflow = "";
    }
  });
});
