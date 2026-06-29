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

  if (!window.aerisEnroll || typeof window.aerisEnroll.submit !== "function") {
    status.className = "error";
    status.textContent = "Pont d'enrôlement indisponible (preload non chargé).";
    btn.disabled = false;
    return;
  }

  let res;
  try {
    res = await window.aerisEnroll.submit(input);
  } catch (err) {
    status.className = "error";
    status.textContent = "Erreur d'enrôlement : " + (err && err.message ? err.message : String(err));
    btn.disabled = false;
    return;
  }

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
