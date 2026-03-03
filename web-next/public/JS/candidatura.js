(() => {
  const form = document.getElementById("applicationForm");
  const success = document.getElementById("applicationSuccess");
  const jobInput = document.getElementById("jobInterestInput");

  if (!form || !success || !jobInput) return;

  const params = new URLSearchParams(window.location.search);
  const vacancy = params.get("vaga");
  const source = params.get("origem");

  if (vacancy) {
    jobInput.value = vacancy;
  } else if (source === "banco-de-talentos") {
    jobInput.value = "Banco de talentos";
  } else {
    jobInput.value = "Não especificada";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    form.hidden = true;
    success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

