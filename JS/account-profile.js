(function initAccountProfilePage() {
  const store = window.TsebiUserStore;
  const profileWrap = document.getElementById("accountProfileWrap");
  const profileForm = document.getElementById("profileForm");
  const profileTitle = document.getElementById("profileTitle");
  const profileFirstName = document.getElementById("profileFirstName");
  const profileLastName = document.getElementById("profileLastName");
  const profileCountry = document.getElementById("profileCountry");
  const birthDay = document.getElementById("birthDay");
  const birthMonth = document.getElementById("birthMonth");
  const birthYear = document.getElementById("birthYear");

  const contactByEmail = document.getElementById("contactByEmail");
  const contactByPhone = document.getElementById("contactByPhone");
  const contactBySms = document.getElementById("contactBySms");

  const prefEmail = document.getElementById("prefEmail");
  const prefPhone = document.getElementById("prefPhone");
  const prefSms = document.getElementById("prefSms");
  const prefPostal = document.getElementById("prefPostal");

  const loginEmail = document.getElementById("loginEmail");
  const addressesEmpty = document.getElementById("addressesEmpty");
  const addressesList = document.getElementById("addressesList");
  const addAddressBtn = document.getElementById("addAddressBtn");

  const openPasswordModalBtn = document.getElementById("openPasswordModal");
  const closePasswordModalBtn = document.getElementById("closePasswordModal");
  const passwordModal = document.getElementById("passwordModal");
  const passwordForm = document.getElementById("passwordForm");

  const toastEl = document.getElementById("profileToast");

  const errorMap = new Map();
  document.querySelectorAll("[data-error-for]").forEach((node) => {
    errorMap.set(String(node.getAttribute("data-error-for") || ""), node);
  });

  const monthLabels = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  let currentUser = null;
  let currentAddresses = [];
  const storageKey = "tsebi_user_profile";
  const previewMode = (() => {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("preview") || "") === "1";
  })();

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = String(message || "");
    toastEl.classList.add("is-visible");
    window.setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 1800);
  }

  function readLocalProfile() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeLocalProfile(data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data || {}));
    } catch {}
  }

  function clearErrors() {
    errorMap.forEach((el) => {
      if (el) el.textContent = "";
    });
  }

  function setError(fieldId, message) {
    const el = errorMap.get(fieldId);
    if (!el) return;
    el.textContent = String(message || "");
  }

  function ensureAuthRedirect() {
    const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `conta.html?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  function buildBirthOptions() {
    if (birthDay) {
      for (let day = 1; day <= 31; day += 1) {
        const option = document.createElement("option");
        option.value = String(day).padStart(2, "0");
        option.textContent = String(day);
        birthDay.appendChild(option);
      }
    }

    if (birthMonth) {
      monthLabels.forEach((label, index) => {
        const option = document.createElement("option");
        option.value = String(index + 1).padStart(2, "0");
        option.textContent = label;
        birthMonth.appendChild(option);
      });
    }

    if (birthYear) {
      const currentYear = new Date().getFullYear();
      for (let year = currentYear; year >= 1920; year -= 1) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        birthYear.appendChild(option);
      }
    }
  }

  function normalizeBirthDate(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
      const [, dd, mm, yyyy] = br;
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  }

  function splitName(user) {
    const fullName = String(user?.name || "").trim();
    if (!fullName) return { firstName: "", lastName: String(user?.lastName || "").trim() };
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { firstName: parts[0], lastName: String(user?.lastName || "").trim() };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  function getPreferencesFromUser() {
    const local = readLocalProfile();
    const fallback = local.preferences || {};
    return {
      email: Boolean(fallback.email),
      phone: Boolean(fallback.phone),
      sms: Boolean(fallback.sms),
      postal: Boolean(fallback.postal)
    };
  }

  function renderUserProfile(user) {
    const local = readLocalProfile();
    const info = splitName(user);

    if (profileTitle) profileTitle.value = String(user?.title || local.title || "nao_informar");
    if (profileFirstName) profileFirstName.value = info.firstName || local.firstName || "";
    if (profileLastName) profileLastName.value = info.lastName || local.lastName || "";
    if (profileCountry) profileCountry.value = String(user?.country || local.country || "Brasil");

    if (loginEmail) loginEmail.value = String(user?.email || "");

    const contact = local.contact || {};
    if (contactByEmail) contactByEmail.checked = Boolean(contact.email);
    if (contactByPhone) contactByPhone.checked = Boolean(contact.phone);
    if (contactBySms) contactBySms.checked = Boolean(contact.sms);

    const prefs = getPreferencesFromUser();
    if (prefEmail) prefEmail.checked = prefs.email;
    if (prefPhone) prefPhone.checked = prefs.phone;
    if (prefSms) prefSms.checked = prefs.sms;
    if (prefPostal) prefPostal.checked = prefs.postal;

    const birth = normalizeBirthDate(user?.birthDate || local.birthDate || "");
    if (birth) {
      const [yyyy, mm, dd] = birth.split("-");
      if (birthDay) birthDay.value = dd;
      if (birthMonth) birthMonth.value = mm;
      if (birthYear) birthYear.value = yyyy;
    }
  }

  function renderAddresses(addresses) {
    if (!addressesList || !addressesEmpty) return;
    addressesList.innerHTML = "";

    if (!Array.isArray(addresses) || !addresses.length) {
      addressesEmpty.hidden = false;
      return;
    }

    addressesEmpty.hidden = true;
    addresses.forEach((address) => {
      const article = document.createElement("article");
      article.className = "address-card";
      article.innerHTML = `
        <strong>${String(address?.label || address?.fullName || "Endereço")}</strong>
        <p>${String(address?.street || "")}, ${String(address?.number || "")}</p>
        <p>${String(address?.district || "")} - ${String(address?.city || "")}/${String(address?.state || "")}</p>
        <p>CEP ${String(address?.cep || "")}</p>
        <button type="button" class="btn-outline" data-address-edit="${String(address?.id || "")}">Editar</button>
      `;
      addressesList.appendChild(article);
    });
  }

  function collectFormData() {
    const day = String(birthDay?.value || "");
    const month = String(birthMonth?.value || "");
    const year = String(birthYear?.value || "");

    return {
      title: String(profileTitle?.value || "").trim(),
      firstName: String(profileFirstName?.value || "").trim(),
      lastName: String(profileLastName?.value || "").trim(),
      country: String(profileCountry?.value || "").trim(),
      birthDate: day && month && year ? `${year}-${month}-${day}` : "",
      contact: {
        email: Boolean(contactByEmail?.checked),
        phone: Boolean(contactByPhone?.checked),
        sms: Boolean(contactBySms?.checked)
      },
      preferences: {
        email: Boolean(prefEmail?.checked),
        phone: Boolean(prefPhone?.checked),
        sms: Boolean(prefSms?.checked),
        postal: Boolean(prefPostal?.checked)
      }
    };
  }

  async function saveProfile(data) {
    if (!store?.updateMyProfile) {
      writeLocalProfile(data);
      return { ok: true, fallback: true };
    }

    const fullName = `${data.firstName} ${data.lastName}`.trim();
    const result = await store.updateMyProfile({
      title: data.title,
      name: fullName,
      birthDate: data.birthDate,
      cpf: String(currentUser?.cpf || ""),
      cep: String(currentUser?.cep || "")
    });

    writeLocalProfile({
      ...readLocalProfile(),
      ...data,
      name: fullName
    });

    return result;
  }

  function togglePreference(key, value) {
    const local = readLocalProfile();
    const nextPrefs = { ...(local.preferences || {}) };
    nextPrefs[key] = Boolean(value);
    writeLocalProfile({ ...local, preferences: nextPrefs });
  }

  function validate(data) {
    clearErrors();
    let valid = true;

    if (!data.title) {
      setError("profileTitle", "Campo obrigatório");
      valid = false;
    }
    if (data.firstName.length < 2) {
      setError("profileFirstName", "Campo obrigatório");
      valid = false;
    }
    if (data.lastName.length < 2) {
      setError("profileLastName", "Campo obrigatório");
      valid = false;
    }
    if (!data.country) {
      setError("profileCountry", "Campo obrigatório");
      valid = false;
    }

    return valid;
  }

  function bindEvents() {
    profileForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = collectFormData();
      if (!validate(data)) return;

      const result = await saveProfile(data);
      if (!result?.ok) {
        showToast(result?.error || "Não foi possível salvar");
        return;
      }
      showToast("Informações salvas");
    });

    const prefMap = {
      prefEmail: "email",
      prefPhone: "phone",
      prefSms: "sms",
      prefPostal: "postal"
    };

    Object.entries(prefMap).forEach(([id, key]) => {
      const node = document.getElementById(id);
      node?.addEventListener("change", () => {
        togglePreference(key, node.checked);
      });
    });

    addAddressBtn?.addEventListener("click", () => {
      showToast("TODO: fluxo de adicionar endereço");
    });

    addressesList?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-address-edit]");
      if (!button) return;
      showToast("TODO: fluxo de editar endereço");
    });

    openPasswordModalBtn?.addEventListener("click", () => {
      if (passwordModal) passwordModal.hidden = false;
    });

    closePasswordModalBtn?.addEventListener("click", () => {
      if (passwordModal) passwordModal.hidden = true;
    });

    passwordModal?.addEventListener("click", (event) => {
      if (event.target === passwordModal) passwordModal.hidden = true;
    });

    passwordForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("TODO: integração para alteração de senha");
      if (passwordModal) passwordModal.hidden = true;
      if (passwordForm) passwordForm.reset();
    });
  }

  async function loadUserProfile() {
    if (previewMode) {
      currentUser = {
        title: "nao_informar",
        name: "Cliente Tsebi",
        email: "cliente@tsebi.com",
        birthDate: "1997-08-21"
      };
      currentAddresses = [
        {
          id: "preview-address-1",
          label: "Casa",
          street: "Rua Exemplo",
          number: "123",
          district: "Centro",
          city: "São Paulo",
          state: "SP",
          cep: "01000-000"
        }
      ];

      renderUserProfile(currentUser);
      renderAddresses(currentAddresses);
      if (profileWrap) profileWrap.hidden = false;
      return;
    }

    if (!store?.fetchMe) {
      ensureAuthRedirect();
      return;
    }

    const me = await store.fetchMe();
    if (!me?.ok || !me.user) {
      ensureAuthRedirect();
      return;
    }

    currentUser = me.user;
    const addressResult = await store.fetchMyAddresses();
    currentAddresses = Array.isArray(addressResult?.addresses) ? addressResult.addresses : [];

    renderUserProfile(currentUser);
    renderAddresses(currentAddresses);

    if (profileWrap) profileWrap.hidden = false;
  }

  buildBirthOptions();
  bindEvents();
  loadUserProfile();
})();
