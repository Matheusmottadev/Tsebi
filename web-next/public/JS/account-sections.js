(function initAccountExtraSections() {
  const PRIVATE_CARE_KEY = 'tsebi-private-care-v1';
  const PRIVATE_PREFS_KEY = 'tsebi-private-care-prefs-v1';
  const REPAIRS_KEY = 'tsebi-repairs-v1';

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function formatCurrencyBRL(amountCents, currency) {
    return (Number(amountCents || 0) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: String(currency || 'brl').toUpperCase()
    });
  }

  function formatDateBR(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function orderStatusLabel(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'paid') return 'Pago';
    if (value === 'processing') return 'Processando';
    if (value === 'pending_payment') return 'Aguardando pagamento';
    if (value === 'canceled') return 'Cancelado';
    if (value === 'failed') return 'Falhou';
    if (value === 'refunded') return 'Reembolsado';
    return 'Em análise';
  }

  function statusTone(status) {
    const value = String(status || '').toLowerCase();
    if (['confirmado', 'concluído', 'finalizado', 'aprovado'].includes(value)) return 'ok';
    if (['cancelado', 'rejeitado'].includes(value)) return 'bad';
    return 'neutral';
  }

  window.initPrivateCareSection = function initPrivateCareSection(context) {
    const payload = context && typeof context === 'object' ? context : {};
    const user = payload.user || null;
    const userId = String(user?.id || user?.email || 'guest');
    const store = window.TsebiUserStore || null;

    const form = document.getElementById('privateCareForm');
    const historyMount = document.getElementById('privateCareHistory');
    const feedback = document.getElementById('privateCareFeedback');
    const prefEmail = document.getElementById('privatePrefEmail');
    const prefPhone = document.getElementById('privatePrefPhone');
    const prefSms = document.getElementById('privatePrefSms');

    const root = readJson(PRIVATE_CARE_KEY, {});
    const prefRoot = readJson(PRIVATE_PREFS_KEY, {});
    let historyState = [];

    function getHistory() {
      return historyState.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    function saveHistory(list) {
      historyState = Array.isArray(list) ? list.slice(0, 100) : [];
      root[userId] = list;
      writeJson(PRIVATE_CARE_KEY, root);
    }

    async function savePrefs() {
      const nextPrefs = {
        email: Boolean(prefEmail?.checked),
        phone: Boolean(prefPhone?.checked),
        sms: Boolean(prefSms?.checked)
      };
      prefRoot[userId] = nextPrefs;
      writeJson(PRIVATE_PREFS_KEY, prefRoot);
      if (store?.updatePrivateCarePreferences) {
        await store.updatePrivateCarePreferences(nextPrefs);
      }
    }

    function renderHistory() {
      const list = getHistory().slice(0, 5);
      if (!historyMount) return;
      if (!list.length) {
        historyMount.innerHTML = '<p class="conta-muted">Você não tem nenhum Atendimento Privado em breve.</p>';
        return;
      }
      historyMount.innerHTML = list
        .map((item) => {
          const tone = statusTone(item.status);
          return `<article class="history-item"><div class="history-item-head"><strong>${escapeHtml(formatDateBR(item.date || item.createdAt))}</strong><span class="status-chip ${tone}">${escapeHtml(item.status || 'Pendente')}</span></div><p class="conta-muted">${escapeHtml(item.channel || '-')} • ${escapeHtml(item.subject || 'Assunto')}</p><button type="button" class="btn-outline history-detail-btn" data-history-detail="${escapeHtml(item.id)}">Ver detalhes</button><div class="history-item-detail" id="history-detail-${escapeHtml(item.id)}" hidden><p class="conta-muted">${escapeHtml(item.message || 'Sem mensagem.')}</p><p class="conta-muted">Horário: ${escapeHtml(item.time || '-')}</p></div></article>`;
        })
        .join('');

      historyMount.querySelectorAll('[data-history-detail]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-history-detail');
          const target = document.getElementById(`history-detail-${id}`);
          if (!target) return;
          target.hidden = !target.hidden;
        });
      });
    }

    async function loadFromBackend() {
      if (!store?.fetchPrivateCare) {
        historyState = Array.isArray(root[userId]) ? root[userId] : [];
        return prefRoot[userId] || {};
      }
      const result = await store.fetchPrivateCare();
      if (!result?.ok) {
        historyState = Array.isArray(root[userId]) ? root[userId] : [];
        return prefRoot[userId] || {};
      }
      historyState = Array.isArray(result.history) ? result.history : [];
      root[userId] = historyState;
      writeJson(PRIVATE_CARE_KEY, root);
      const apiPrefs = result.preferences && typeof result.preferences === 'object' ? result.preferences : {};
      prefRoot[userId] = apiPrefs;
      writeJson(PRIVATE_PREFS_KEY, prefRoot);
      return apiPrefs;
    }

    async function submitRequest(values) {
      if (store?.createPrivateCare) {
        const response = await store.createPrivateCare(values);
        if (response?.ok) {
          historyState = Array.isArray(response.history) ? response.history : historyState;
          root[userId] = historyState;
          writeJson(PRIVATE_CARE_KEY, root);
          return true;
        }
      }

      const list = getHistory();
      list.unshift({
        id: `pc-${Date.now()}`,
        channel: values.channel,
        date: values.date,
        time: values.time,
        subject: values.subject,
        message: values.message,
        status: 'Pendente',
        createdAt: new Date().toISOString()
      });
      saveHistory(list.slice(0, 50));
      return true;
    }

    const existingPrefs = prefRoot[userId] || {};
    if (prefEmail) prefEmail.checked = Boolean(existingPrefs.email);
    if (prefPhone) prefPhone.checked = Boolean(existingPrefs.phone);
    if (prefSms) prefSms.checked = Boolean(existingPrefs.sms);

    [prefEmail, prefPhone, prefSms].forEach((el) => el && el.addEventListener('change', () => {
      savePrefs().catch(() => {});
    }));

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const channel = document.getElementById('privateCareChannel')?.value || 'WhatsApp';
      const date = document.getElementById('privateCareDate')?.value || '';
      const time = document.getElementById('privateCareTime')?.value || '';
      const subject = document.getElementById('privateCareSubject')?.value || 'Pedido';
      const message = document.getElementById('privateCareMessage')?.value || '';
      submitRequest({ channel, date, time, subject, message }).then(() => {
        if (feedback) feedback.textContent = 'Solicitação registrada com sucesso.';
        form.reset();
        renderHistory();
      }).catch(() => {
        if (feedback) feedback.textContent = 'Não foi possível registrar a solicitação agora.';
      });
    });

    loadFromBackend().then((prefs) => {
      if (prefEmail) prefEmail.checked = Boolean(prefs.email);
      if (prefPhone) prefPhone.checked = Boolean(prefs.phone);
      if (prefSms) prefSms.checked = Boolean(prefs.sms);
      renderHistory();
    }).catch(() => {
      renderHistory();
    });
  };

  window.initRecommendationsSection = function initRecommendationsSection(context) {
    const payload = context && typeof context === 'object' ? context : {};
    const favorites = Array.isArray(payload.favorites) ? payload.favorites.map(String) : [];
    const catalog = Array.isArray(payload.products) ? payload.products : [];

    const grid = document.getElementById('recommendationsGrid');
    const loadMoreBtn = document.getElementById('recommendationsLoadMoreBtn');
    const baseMount = document.getElementById('recommendationsFavoritesBase');
    const chipsMount = document.getElementById('recommendationsChips');
    const chipsCard = document.getElementById('recommendationsPreferencesCard');

    if (!grid) return;

    const byId = new Map(catalog.map((item) => [String(item.id || item.sku || ''), item]));
    const favoriteItems = favorites.map((id) => byId.get(id)).filter(Boolean);
    const favoriteWords = new Set();

    favoriteItems.forEach((item) => {
      String(item.name || '')
        .toLowerCase()
        .split(/[^a-zA-ZÀ-ÿ0-9]+/)
        .filter((word) => word.length > 3)
        .forEach((word) => favoriteWords.add(word));
    });

    const scored = catalog
      .filter((item) => !favorites.includes(String(item.id || item.sku || '')))
      .map((item) => {
        const name = String(item.name || '').toLowerCase();
        let score = 0;
        favoriteWords.forEach((word) => {
          if (name.includes(word)) score += 1;
        });
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const recommended = scored.length ? scored : catalog.slice();

    let visibleCount = 6;

    function productCard(item, note) {
      const id = String(item.id || item.sku || '').trim();
      const href = id ? `/produto?id=${encodeURIComponent(id)}` : '#';
      const image = String(item.imageUrl || item.image_url || '/images/placeholder.jpg').trim();
      return `<article class="wishlist-item-card"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name || 'Produto')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/placeholder.jpg';" /><h3>${escapeHtml(item.name || 'Produto')}</h3><p>${escapeHtml(formatCurrencyBRL(item.priceCents || item.price_cents || item.price || 0, item.currency || 'brl'))}</p>${note ? `<span class="tiny-badge">${escapeHtml(note)}</span>` : ''}<a class="btn-outline" href="${escapeHtml(href)}">Ver produto</a></article>`;
    }

    function render() {
      if (!favorites.length) {
        grid.innerHTML = '<div class="orders-empty"><p>Nenhuma base de favoritos encontrada.</p><a class="btn-primary" href="/">Explorar coleção</a></div>';
        if (loadMoreBtn) loadMoreBtn.hidden = true;
      } else {
        grid.innerHTML = recommended
          .slice(0, visibleCount)
          .map((item) => productCard(item, 'Com base nos seus favoritos'))
          .join('');
        if (loadMoreBtn) loadMoreBtn.hidden = visibleCount >= recommended.length;
      }

      if (baseMount) {
        if (!favoriteItems.length) {
          baseMount.innerHTML = '<p class="conta-muted">Nenhum favorito encontrado.</p>';
        } else {
          baseMount.innerHTML = favoriteItems
            .slice(0, 4)
            .map((item) => `<div class="orders-summary-row"><span>${escapeHtml(item.name || 'Produto')}</span><strong>${escapeHtml(formatCurrencyBRL(item.priceCents || item.price_cents || 0, item.currency || 'brl'))}</strong></div>`)
            .join('');
        }
      }

      const chips = Array.from(favoriteWords).slice(0, 6);
      if (chipsMount && chipsCard) {
        if (chips.length) {
          chipsCard.hidden = false;
          chipsMount.innerHTML = chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('');
        } else {
          chipsCard.hidden = true;
          chipsMount.innerHTML = '';
        }
      }
    }

    loadMoreBtn?.addEventListener('click', () => {
      visibleCount += 6;
      render();
    });

    document.querySelectorAll('[data-section-link="wishlist"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.hash = '#wishlist';
      });
    });

    render();
  };

  window.initWishlistSection = function initWishlistSection(context) {
    const payload = context && typeof context === 'object' ? context : {};
    const store = payload.store || window.TsebiUserStore;
    const products = Array.isArray(payload.products) ? payload.products : [];

    const grid = document.getElementById('wishlistGrid');
    const sortSelect = document.getElementById('wishlistSort');
    const countEl = document.getElementById('wishlistCount');
    const topCategoryEl = document.getElementById('wishlistTopCategory');
    const feedback = document.getElementById('wishlistActionFeedback');

    if (!grid) return;

    function getFavorites() {
      const ids = Array.isArray(payload.favorites)
        ? payload.favorites.map(String)
        : (store?.getFavoriteIds ? store.getFavoriteIds().map(String) : []);
      return ids;
    }

    function mapFavoritesToProducts(ids) {
      const map = new Map(products.map((item) => [String(item.id || item.sku || ''), item]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    }

    async function removeFavorite(id) {
      if (store?.toggleFavorite) {
        store.toggleFavorite(id);
      }
      if (typeof payload.onFavoritesChanged === 'function') {
        await payload.onFavoritesChanged();
      }
      renderWishlist();
    }

    function dominantCategory(items) {
      const freq = new Map();
      items.forEach((item) => {
        const category = String(item.category || item.type || item.collection || 'Sem categoria');
        freq.set(category, (freq.get(category) || 0) + 1);
      });
      let best = '-';
      let max = 0;
      freq.forEach((count, category) => {
        if (count > max) {
          max = count;
          best = category;
        }
      });
      return best;
    }

    function sortedItems(items) {
      const mode = sortSelect?.value || 'recent';
      const clone = items.slice();
      if (mode === 'price-asc') {
        clone.sort((a, b) => Number(a.priceCents || a.price_cents || 0) - Number(b.priceCents || b.price_cents || 0));
      } else if (mode === 'price-desc') {
        clone.sort((a, b) => Number(b.priceCents || b.price_cents || 0) - Number(a.priceCents || a.price_cents || 0));
      }
      return clone;
    }

    function renderWishlist() {
      const ids = getFavorites();
      payload.favorites = ids;
      const items = sortedItems(mapFavoritesToProducts(ids));

      if (countEl) countEl.textContent = String(items.length);
      if (topCategoryEl) topCategoryEl.textContent = dominantCategory(items);

      if (!items.length) {
        grid.innerHTML = '<div class="orders-empty"><p>Sua Lista de Desejos está vazia.</p><a class="btn-primary" href="/">Explorar peças</a></div>';
        return;
      }

      grid.innerHTML = items
        .map((item) => {
          const id = String(item.id || item.sku || '').trim();
          const href = id ? `/produto?id=${encodeURIComponent(id)}` : '#';
          const image = String(item.imageUrl || item.image_url || '/images/placeholder.jpg').trim();
          return `<article class="wishlist-item-card"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name || 'Produto')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/placeholder.jpg';" /><h3>${escapeHtml(item.name || 'Produto')}</h3><p>${escapeHtml(formatCurrencyBRL(item.priceCents || item.price_cents || 0, item.currency || 'brl'))}</p><div class="wishlist-actions"><a class="btn-outline" href="${escapeHtml(href)}">Ver produto</a><button type="button" class="link-btn" data-remove-favorite="${escapeHtml(id)}">Remover</button></div></article>`;
        })
        .join('');

      grid.querySelectorAll('[data-remove-favorite]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = button.getAttribute('data-remove-favorite');
          await removeFavorite(id);
        });
      });
    }

    sortSelect?.addEventListener('change', renderWishlist);

    document.getElementById('wishlistSaveLaterBtn')?.addEventListener('click', () => {
      if (feedback) feedback.textContent = 'Itens mantidos na sua conta para ver depois.';
    });

    document.getElementById('wishlistShareBtn')?.addEventListener('click', async () => {
      const ids = getFavorites();
      const text = ids.length ? `Minha lista Tsebi: ${ids.join(', ')}` : 'Minha lista Tsebi está vazia.';
      try {
        await navigator.clipboard.writeText(text);
        if (feedback) feedback.textContent = 'Lista copiada para a área de transferência.';
      } catch {
        if (feedback) feedback.textContent = 'Não foi possível copiar agora.';
      }
    });

    renderWishlist();
  };

  window.initRepairsSection = function initRepairsSection(context) {
    const payload = context && typeof context === 'object' ? context : {};
    const user = payload.user || null;
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const userId = String(user?.id || user?.email || 'guest');
    const store = window.TsebiUserStore || null;

    const form = document.getElementById('repairsForm');
    const feedback = document.getElementById('repairsFeedback');
    const productSelect = document.getElementById('repairProduct');
    const historyMount = document.getElementById('repairsHistory');

    const root = readJson(REPAIRS_KEY, {});
    let historyState = [];

    function getHistory() {
      return historyState.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    function saveHistory(list) {
      historyState = Array.isArray(list) ? list.slice(0, 100) : [];
      root[userId] = list;
      writeJson(REPAIRS_KEY, root);
    }

    function populateProducts() {
      if (!productSelect) return;
      const items = [];
      orders.forEach((order) => {
        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
          items.push(String(item.name || 'Produto'));
        });
      });
      const unique = Array.from(new Set(items.filter(Boolean))).slice(0, 20);
      const options = ['<option value="">Selecionar produto</option>']
        .concat(unique.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`));
      if (!unique.length) {
        options.push('<option value="Produto da coleção">Produto da coleção</option>');
      }
      productSelect.innerHTML = options.join('');
    }

    function renderHistory() {
      const list = getHistory().slice(0, 5);
      if (!historyMount) return;
      if (!list.length) {
        historyMount.innerHTML = '<p class="conta-muted">Nenhum produto sendo reparado neste momento.</p>';
        return;
      }
      historyMount.innerHTML = list
        .map((item) => {
          const tone = statusTone(item.status);
          return `<article class="history-item"><div class="history-item-head"><strong>${escapeHtml(item.protocol)}</strong><span class="status-chip ${tone}">${escapeHtml(item.status)}</span></div><p class="conta-muted">${escapeHtml(formatDateBR(item.createdAt))} • ${escapeHtml(item.product || 'Produto')}</p><button type="button" class="btn-outline history-detail-btn" data-repair-detail="${escapeHtml(item.id)}">Ver detalhes</button><div class="history-item-detail" id="repair-detail-${escapeHtml(item.id)}" hidden><p class="conta-muted">${escapeHtml(item.reason || '-')}</p><p class="conta-muted">${escapeHtml(item.description || 'Sem descrição.')}</p></div></article>`;
        })
        .join('');

      historyMount.querySelectorAll('[data-repair-detail]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-repair-detail');
          const target = document.getElementById(`repair-detail-${id}`);
          if (!target) return;
          target.hidden = !target.hidden;
        });
      });
    }

    async function loadFromBackend() {
      if (!store?.fetchRepairs) {
        historyState = Array.isArray(root[userId]) ? root[userId] : [];
        return;
      }
      const result = await store.fetchRepairs();
      if (!result?.ok) {
        historyState = Array.isArray(root[userId]) ? root[userId] : [];
        return;
      }
      historyState = Array.isArray(result.history) ? result.history : [];
      root[userId] = historyState;
      writeJson(REPAIRS_KEY, root);
    }

    async function submitRepair(values) {
      if (store?.createRepair) {
        const result = await store.createRepair(values);
        if (result?.ok) {
          historyState = Array.isArray(result.history) ? result.history : historyState;
          root[userId] = historyState;
          writeJson(REPAIRS_KEY, root);
          return true;
        }
      }

      const list = getHistory();
      list.unshift({
        id: `rp-${Date.now()}`,
        protocol: `RP-${String(Date.now()).slice(-6)}`,
        product: values.product,
        reason: values.reason,
        description: values.description,
        photoName: values.photoName || '',
        status: 'Em análise',
        createdAt: new Date().toISOString()
      });
      saveHistory(list.slice(0, 50));
      return true;
    }

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const product = document.getElementById('repairProduct')?.value || 'Produto da coleção';
      const reason = document.getElementById('repairReason')?.value || 'Ajuste';
      const description = document.getElementById('repairDescription')?.value || '';
      const photoName = String(document.getElementById('repairPhoto')?.files?.[0]?.name || '');
      submitRepair({ product, reason, description, photoName }).then(() => {
        form.reset();
        if (feedback) feedback.textContent = 'Solicitação de reparo enviada com sucesso.';
        renderHistory();
      }).catch(() => {
        if (feedback) feedback.textContent = 'Não foi possível enviar a solicitação agora.';
      });
    });

    populateProducts();
    loadFromBackend().then(renderHistory).catch(renderHistory);
  };
})();
