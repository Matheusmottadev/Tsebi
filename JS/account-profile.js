window.initProfileSection = function initProfileSection(options = {}) {
  const store = window.TsebiUserStore;
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
  const enablePasskeyBtn = document.getElementById("enablePasskeyBtn");
  const passkeyFeedback = document.getElementById("passkeyFeedback");
  const addressesEmpty = document.getElementById("addressesEmpty");
  const addressesList = document.getElementById("addressesList");
  const addAddressBtn = document.getElementById("addAddressBtn");

  const openPasswordModalBtn = document.getElementById("openPasswordModal");
  const closePasswordModalBtn = document.getElementById("closePasswordModal");
  const passwordModal = document.getElementById("passwordModal");
  const passwordForm = document.getElementById("passwordForm");

  const toastEl = document.getElementById("profileToast");
  let addressModal = null;
  let addressForm = null;
  let addressTitleEl = null;
  let addressSubmitEl = null;
  let addressMode = "create";
  let editingAddressId = "";

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
  const previewMode =
    typeof options.previewMode === "boolean"
      ? options.previewMode
      : (() => {
          const params = new URLSearchParams(window.location.search);
          return String(params.get("preview") || "") === "1";
        })();

  if (!profileForm) return;

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = String(message || "");
    toastEl.classList.add("is-visible");
    window.setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 1800);
  }

  function setPasskeyFeedback(message, isError = false) {
    if (!passkeyFeedback) return;
    passkeyFeedback.textContent = String(message || "");
    passkeyFeedback.style.color = isError ? "#9f1f1f" : "#666";
  }

  function toBase64Url(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let str = "";
    for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function fromBase64Url(value) {
    const input = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = input + "===".slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function decodeRegistrationOptions(options) {
    const decoded = { ...options };
    decoded.challenge = fromBase64Url(options.challenge);
    decoded.user = {
      ...options.user,
      id: fromBase64Url(options.user.id)
    };
    decoded.excludeCredentials = (Array.isArray(options.excludeCredentials) ? options.excludeCredentials : []).map((item) => ({
      ...item,
      id: fromBase64Url(item.id)
    }));
    return decoded;
  }

  function serializeRegistrationCredential(credential) {
    if (!credential) return null;
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toBase64Url(credential.response.clientDataJSON),
        attestationObject: toBase64Url(credential.response.attestationObject),
        transports:
          typeof credential.response.getTransports === "function"
            ? credential.response.getTransports()
            : []
      },
      clientExtensionResults: credential.getClientExtensionResults?.() || {},
      authenticatorAttachment: credential.authenticatorAttachment || null
    };
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
    if (typeof options.onAuthRequired === "function") {
      options.onAuthRequired();
      return;
    }
    const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `login.html?returnUrl=${encodeURIComponent(returnUrl)}`;
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

  function onlyDigits(value, max = 32) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, Math.max(0, Number(max) || 0));
  }

  function formatCep(value) {
    const digits = onlyDigits(value, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  function ensureAddressModal() {
    if (addressModal instanceof HTMLElement) return;
    const wrapper = document.createElement("div");
    wrapper.className = "modal-backdrop";
    wrapper.id = "addressModal";
    wrapper.hidden = true;
    wrapper.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="addressModalTitle">
        <h3 id="addressModalTitle">Novo endereço</h3>
        <form id="addressFormModal" class="modal-form">
          <label for="addressLabelInput">Rótulo</label>
          <input id="addressLabelInput" name="label" type="text" placeholder="Casa, Trabalho..." required />

          <label for="addressFullNameInput">Nome completo</label>
          <input id="addressFullNameInput" name="fullName" type="text" required />

          <label for="addressCepInput">CEP</label>
          <input id="addressCepInput" name="cep" type="text" inputmode="numeric" maxlength="9" required />

          <label for="addressStreetInput">Rua</label>
          <input id="addressStreetInput" name="street" type="text" required />

          <label for="addressNumberInput">Número</label>
          <input id="addressNumberInput" name="number" type="text" required />

          <label for="addressComplementInput">Complemento (opcional)</label>
          <input id="addressComplementInput" name="complement" type="text" />

          <label for="addressDistrictInput">Bairro</label>
          <input id="addressDistrictInput" name="district" type="text" required />

          <label for="addressCityInput">Cidade</label>
          <input id="addressCityInput" name="city" type="text" required />

          <label for="addressStateInput">UF</label>
          <input id="addressStateInput" name="state" type="text" maxlength="2" required />

          <div class="modal-actions">
            <button type="button" class="btn-outline" data-address-action="cancel">Cancelar</button>
            <button type="submit" class="btn-primary" id="addressModalSubmitBtn">Salvar endereço</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(wrapper);

    addressModal = document.getElementById("addressModal");
    addressForm = document.getElementById("addressFormModal");
    addressTitleEl = document.getElementById("addressModalTitle");
    addressSubmitEl = document.getElementById("addressModalSubmitBtn");

    const cepInput = document.getElementById("addressCepInput");
    const stateInput = document.getElementById("addressStateInput");
    cepInput?.addEventListener("input", () => {
      cepInput.value = formatCep(cepInput.value);
    });
    stateInput?.addEventListener("input", () => {
      stateInput.value = String(stateInput.value || "")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
        .slice(0, 2);
    });

    addressModal?.addEventListener("click", (event) => {
      const target = event.target;
      if (target === addressModal) {
        addressModal.hidden = true;
        return;
      }
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest("[data-address-action]");
      if (!action) return;
      addressModal.hidden = true;
    });

    addressForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        label: String(document.getElementById("addressLabelInput")?.value || "").trim(),
        fullName: String(document.getElementById("addressFullNameInput")?.value || "").trim(),
        cep: onlyDigits(document.getElementById("addressCepInput")?.value || "", 8),
        street: String(document.getElementById("addressStreetInput")?.value || "").trim(),
        number: String(document.getElementById("addressNumberInput")?.value || "").trim(),
        complement: String(document.getElementById("addressComplementInput")?.value || "").trim(),
        district: String(document.getElementById("addressDistrictInput")?.value || "").trim(),
        city: String(document.getElementById("addressCityInput")?.value || "").trim(),
        state: String(document.getElementById("addressStateInput")?.value || "")
          .replace(/[^a-zA-Z]/g, "")
          .toUpperCase()
          .slice(0, 2)
      };

      if (
        !payload.label ||
        !payload.fullName ||
        payload.cep.length !== 8 ||
        !payload.street ||
        !payload.number ||
        !payload.district ||
        !payload.city ||
        payload.state.length !== 2
      ) {
        showToast("Preencha os campos obrigatórios do endereço.");
        return;
      }

      if (addressSubmitEl) addressSubmitEl.disabled = true;
      try {
        if (previewMode || !store?.createMyAddress || !store?.updateMyAddress) {
          if (addressMode === "edit" && editingAddressId) {
            currentAddresses = currentAddresses.map((item) =>
              String(item?.id || "") === editingAddressId ? { ...item, ...payload } : item
            );
          } else {
            currentAddresses.unshift({ id: `preview-address-${Date.now()}`, ...payload });
          }
          renderAddresses(currentAddresses);
          addressModal.hidden = true;
          showToast("Endereço salvo.");
          return;
        }

        const result =
          addressMode === "edit" && editingAddressId
            ? await store.updateMyAddress(editingAddressId, payload)
            : await store.createMyAddress(payload);

        if (!result?.ok) {
          showToast(result?.error || "Não foi possível salvar o endereço.");
          return;
        }

        currentAddresses = Array.isArray(result.addresses) ? result.addresses : currentAddresses;
        renderAddresses(currentAddresses);
        addressModal.hidden = true;
        showToast("Endereço salvo.");
      } finally {
        if (addressSubmitEl) addressSubmitEl.disabled = false;
      }
    });
  }

  function openAddressModal(mode, address = null) {
    ensureAddressModal();
    if (!(addressForm instanceof HTMLFormElement) || !(addressModal instanceof HTMLElement)) return;

    addressMode = mode === "edit" ? "edit" : "create";
    editingAddressId = String(address?.id || "");
    addressForm.reset();

    const fullNameFallback = String(currentUser?.name || "").trim();
    document.getElementById("addressLabelInput").value = String(address?.label || "");
    document.getElementById("addressFullNameInput").value = String(address?.fullName || fullNameFallback || "");
    document.getElementById("addressCepInput").value = formatCep(String(address?.cep || ""));
    document.getElementById("addressStreetInput").value = String(address?.street || "");
    document.getElementById("addressNumberInput").value = String(address?.number || "");
    document.getElementById("addressComplementInput").value = String(address?.complement || "");
    document.getElementById("addressDistrictInput").value = String(address?.district || "");
    document.getElementById("addressCityInput").value = String(address?.city || "");
    document.getElementById("addressStateInput").value = String(address?.state || "")
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .slice(0, 2);

    if (addressTitleEl) addressTitleEl.textContent = addressMode === "edit" ? "Editar endereço" : "Novo endereço";
    if (addressSubmitEl) addressSubmitEl.textContent = addressMode === "edit" ? "Salvar alterações" : "Salvar endereço";
    addressModal.hidden = false;
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
      openAddressModal("create");
    });

    addressesList?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("[data-address-edit]");
      if (!button) return;
      const addressId = String(button.getAttribute("data-address-edit") || "");
      const address = currentAddresses.find((item) => String(item?.id || "") === addressId) || null;
      if (!address) {
        showToast("Endereço não encontrado.");
        return;
      }
      openAddressModal("edit", address);
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

    enablePasskeyBtn?.addEventListener("click", async () => {
      setPasskeyFeedback("");
      if (!(window.PublicKeyCredential && navigator.credentials)) {
        setPasskeyFeedback("Este navegador não suporta Passkey.", true);
        return;
      }

      enablePasskeyBtn.disabled = true;
      enablePasskeyBtn.textContent = "Ativando...";

      try {
        const optionsResponse = await fetch("/api/auth/passkey/register/options", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        const optionsData = await optionsResponse.json().catch(() => ({}));
        if (!optionsResponse.ok || !optionsData?.ok || !optionsData?.options) {
          setPasskeyFeedback("Não foi possível iniciar a ativação de Passkey.", true);
          return;
        }

        const credential = await navigator.credentials.create({
          publicKey: decodeRegistrationOptions(optionsData.options)
        });
        const serialized = serializeRegistrationCredential(credential);

        const verifyResponse = await fetch("/api/auth/passkey/register/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: serialized })
        });
        const verifyData = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok || !verifyData?.ok) {
          setPasskeyFeedback("Falha ao salvar Passkey. Tente novamente.", true);
          return;
        }

        setPasskeyFeedback("Passkey ativada com sucesso neste dispositivo.");
        showToast("Passkey ativada");
      } catch (error) {
        if (error?.name === "NotAllowedError") {
          setPasskeyFeedback("Ativação de Passkey cancelada.", true);
        } else {
          setPasskeyFeedback("Não foi possível ativar a Passkey.", true);
        }
      } finally {
        enablePasskeyBtn.disabled = false;
        enablePasskeyBtn.textContent = "Ativar neste dispositivo";
      }
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
  }

  buildBirthOptions();
  bindEvents();
  loadUserProfile();
};


