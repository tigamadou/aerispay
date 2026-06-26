const form = document.getElementById("enroll-form");
const btn = document.getElementById("submit-btn");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "";
  status.textContent = "";
  btn.disabled = true;

  const input = {
    nodeUrl: document.getElementById("nodeUrl").value,
    token: document.getElementById("token").value,
    nom: document.getElementById("nom").value,
  };

  const res = await window.aerisEnroll.submit(input);

  if (res && res.ok) {
    status.className = "ok";
    status.textContent = `Caisse « ${res.nom} » (${res.codePoste}) enrôlée. Démarrage…`;
    // Le main bascule en kiosque ; pas d'action supplémentaire ici.
  } else {
    status.className = "error";
    status.textContent = (res && res.error) || "Échec de l'enrôlement.";
    btn.disabled = false;
  }
});
