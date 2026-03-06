(() => {
  const STORAGE_KEY = "tsebi-site-language";
  const DEFAULT_LANG = "pt";
  const SUPPORTED = ["pt", "en"];

  function applyLazyLoading() {
    const images = Array.from(document.querySelectorAll("img"));
    images.forEach((img) => {
      if (img.hasAttribute("data-eager")) return;
      if (img.getAttribute("loading")) return;
      img.setAttribute("loading", "lazy");
      if (!img.getAttribute("decoding")) {
        img.setAttribute("decoding", "async");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLazyLoading, { once: true });
  } else {
    applyLazyLoading();
  }

  const TEXT_MAP_EN = {
    "Frete Grátis!": "Free shipping!",
    "Nova Coleção Gênesis": "New Genesis Collection",
    "Você merece vestir algo à sua altura.": "You deserve to wear something worthy of you.",
    "Cadastre-se para receber lançamentos": "Sign up to receive launches",
    "Exclusividade para quem valoriza o que é único.": "Exclusivity for those who value what is unique.",
    "Acesso antecipado a novas coleções.": "Early access to new collections.",
    "Produção em pequena escala. Qualidade em cada detalhe.": "Small-scale production. Quality in every detail.",
    "Coleção Gênesis": "Genesis Collection",
    "Coleção": "Collection",
    "Peças com construção autoral, acabamento refinado e edição limitada.": "Pieces with signature construction, refined finishing, and limited release.",
    "VER COLE\u00C7\u00C3O": "VIEW COLLECTION",
    "CONHE\u00C7A": "DISCOVER",
    "Fragrâncias para ele": "Fragrances for him",
    "Fragrâncias para ela": "Fragrances for her",
    "SUGEST\u00D5ES": "SUGGESTIONS",
    "T\u00CANIS": "SNEAKERS",
    "ACESS\u00D3RIOS": "ACCESSORIES",
    "SERVI\u00C7OS EXCLUSIVOS": "EXCLUSIVE SERVICES",
    "Serviços Tsebi": "Tsebi Services",
    "Histórico de compras": "Purchase history",
    "Próximo": "Next",
    "Devoluções": "Returns",
    "Política de Privacidade": "Privacy Policy",
    "Política de cookies": "Cookie Policy",
    "Configurações de cookies": "Cookie settings",
    "TERMOS E CONDI\u00C7\u00D5ES LEGAIS": "LEGAL TERMS AND CONDITIONS",
    "Faça parte do time Tsebi": "Join the Tsebi team",
    "Enviar currículo": "Send resume",
    "Composição": "Composition",
    "Construção": "Construction",
    "Não especificada": "Not specified",
    "Sabrina incrível": "Incredible Sabrina",
    "Há uma raiz que sustenta tudo o que escolhemos ser. Porque estilo não é sobre o que você veste, é sobre quem você é.": "There is a root that sustains everything we choose to be. Style is not about what you wear, it is about who you are.",
    "Há uma raiz que sustenta tudo o que escolhemos ser. Porque estilo não é sobre o que você veste, é sobre quem você é": "There is a root that sustains everything we choose to be. Style is not about what you wear, it is about who you are.",
    "Nosso Processo": "Our Process",
    "ATELIÊ TSEBI": "TSEBI ATELIER",
    "Cada peça é produzida em pequena escala, com atenção aos detalhes, do primeiro corte ao último ponto.": "Each piece is produced in small scale, with attention to detail, from the first cut to the final stitch.",
    "Ver etapas": "View steps",
    "Seleção de materiais": "Material selection",
    "Escolha de tecidos e aviamentos de alta qualidade.": "Selection of high-quality fabrics and trims.",
    "Modelagem": "Pattern making",
    "Desenvolvimento técnico para caimento e estrutura perfeitos.": "Technical development for perfect fit and structure.",
    "Corte": "Cutting",
    "Precisão no corte para garantir proporção e acabamento.": "Precision cutting to ensure proportion and finishing.",
    "Costura": "Sewing",
    "Montagem da peça com atenção aos detalhes.": "Piece assembly with attention to detail.",
    "Acabamento": "Finishing",
    "Reforço de costuras, limpeza e aplicação de etiquetas.": "Seam reinforcement, cleaning, and label application.",
    "Revisão final": "Final review",
    "Cada peça é inspecionada antes de chegar até você.": "Each piece is inspected before reaching you.",
    "Produção em pequena escala. Qualidade acima da quantidade.": "Small-scale production. Quality above quantity.",
    "Conta": "Account",
    "Carrinho": "Cart",
    "Voltar": "Back",
    "Voltar para início": "Back to home",
    "sair do carreira": "Exit careers",
    "Voltar para a loja": "Back to shop",
    "Frete Grátis!": "Free shipping!",
    "Nova Coleção Gênesis": "New Genesis Collection",
    "Você merece vestir algo à sua altura.": "You deserve to wear something worthy of you.",
    "Cadastre-se para receber lançamentos": "Sign up to receive launches",
    "Exclusividade para quem valoriza o que é único.": "Exclusivity for those who value what is unique.",
    "Acesso antecipado a novas coleções.": "Early access to new collections.",
    "Produção em pequena escala. Qualidade em cada detalhe.": "Small-scale production. Quality in every detail.",
    "Coleção Gênesis": "Genesis Collection",
    "Coleção": "Collection",
    "Peças com construção autoral, acabamento refinado e edição limitada.": "Pieces with signature construction, refined finishing, and limited release.",
    "VER COLE\u00C7\u00C3O": "VIEW COLLECTION",
    "CONHE\u00C7A": "DISCOVER",
    "NEWS": "NEWS",
    "Ver tudo": "View all",
    "Leia mais": "Read more",
    "NOVA": "NEW",
    "NOVO": "NEW",
    "ASSINE NOSSA NEWSLETTER": "SUBSCRIBE TO OUR NEWSLETTER",
    "Presentes": "Gifts",
    "Presente para ele": "Gift for him",
    "Presentes para ela": "Gifts for her",
    "Fragrâncias para ele": "Fragrances for him",
    "Fragrâncias para ela": "Fragrances for her",
    "SUGEST\u00D5ES": "SUGGESTIONS",
    "NOVIDADE PARA HOMENS": "NEW FOR MEN",
    "NOVIDADE PARA MULHERES": "NEW FOR WOMEN",
    "BOLSAS FEMININAS": "WOMEN'S BAGS",
    "VESTIDOS": "DRESSES",
    "JAQUETAS": "JACKETS",
    "T\u00CANIS": "SNEAKERS",
    "TENIS": "SNEAKERS",
    "ACESS\u00D3RIOS": "ACCESSORIES",
    "ACESSORIOS": "ACCESSORIES",
    "Insira seu e-mail *": "Enter your email *",
    "PRECISA DE AJUDA?": "NEED HELP?",
    "SERVI\u00C7OS EXCLUSIVOS": "EXCLUSIVE SERVICES",
    "Serviços Tsebi": "Tsebi Services",
    "Acompanhe seu pedido": "Track your order",
    "Meus dados": "My details",
    "Favoritos": "Favorites",
    "Histórico de compras": "Purchase history",
    "Sair": "Sign out",
    "Insira seu e-mail": "Enter your email",
    "Próximo": "Next",
    "Digite sua senha": "Enter your password",
    "Entrar": "Sign in",
    "Criar conta": "Create account",
    "Devoluções": "Returns",
    "Fale conosco pelo WhatsApp": "Contact us via WhatsApp",
    "Fale conosco pelo telefone (11) 93461-8004": "Contact us by phone (+55 11 93461-8004)",
    "Contatos": "Contacts",
    "FAQ": "FAQ",
    "Mapa do site": "Site map",
    "Seu carrinho": "Your cart",
    "Continuar comprando": "Continue shopping",
    "Resumo": "Summary",
    "Subtotal": "Subtotal",
    "Entrega": "Shipping",
    "Calculada no checkout": "Calculated at checkout",
    "Finalizar compra": "Checkout",
    "Seu carrinho está vazio": "Your cart is empty",
    "Adicione peças para montar seu pedido.": "Add items to build your order.",
    "Ver produtos": "View products",
    "Trabalhe conosco": "Careers",
    "A Tsebi": "About Tsebi",
    "Processos": "Processes",
    "Novidades": "New in",
    "Lançamentos": "New arrivals",
    "Destaques da semana": "Highlights of the week",
    "Editorial masculino": "Men's editorial",
    "Roupas": "Clothing",
    "Camisetas": "T-shirts",
    "Camisas": "Shirts",
    "Calças": "Pants",
    "Jaquetas": "Jackets",
    "Blazers": "Blazers",
    "Acessórios": "Accessories",
    "Calçados": "Shoes",
    "Tênis": "Sneakers",
    "Bolsas": "Bags",
    "Cintos": "Belts",
    "Óculos": "Eyewear",
    "Escolhas da curadoria": "Curated picks",
    "Vestidos": "Dresses",
    "Saias": "Skirts",
    "Jeans": "Jeans",
    "Tricot": "Knitwear",
    "Lingerie": "Lingerie",
    "Aviso legal": "Legal notice",
    "Política de Privacidade": "Privacy Policy",
    "Política de cookies": "Cookie Policy",
    "Configurações de cookies": "Cookie settings",
    "Termos de venda": "Terms of sale",
    "TERMOS E CONDI\u00C7\u00D5ES LEGAIS": "LEGAL TERMS AND CONDITIONS",
    "EMPRESA": "COMPANY",
    "Faça parte do time Tsebi": "Join the Tsebi team",
    "Candidatura": "Application",
    "Vaga de interesse": "Role of interest",
    "Mensagem": "Message",
    "Enviar candidatura": "Submit application",
    "Voltar para carreiras": "Back to careers",
    "Candidatar-se": "Apply",
    "Enviar currículo": "Send resume",
    "Adicionar ao carrinho": "Add to cart",
    "Detalhes do produto": "Product details",
    "Origem": "Origin",
    "Composição": "Composition",
    "Construção": "Construction",
    "Cuidados": "Care",
    "Tabela de tamanhos": "Size guide",
    "Encontre o seu tamanho": "Find your size",
    "Selecionar tamanho": "Select size",
    "Cor": "Color",
    "Tamanho": "Size",
    "Cor:": "Color:",
    "Tamanho:": "Size:",
    "Qtd:": "Qty:",
    "Excluir": "Remove",
    "Ir para o carrinho": "Go to cart",
    "Prosseguir para o pagamento": "Proceed to checkout",
    "Não especificada": "Not specified",
    "Jaqueta bomber em couro italiano com forro em seda": "Italian leather bomber jacket with silk lining",
    "Calça de alfaiataria em sarja premium estruturada": "Premium structured tailored twill pants",
    "Camisa em algodão croata de trama nobre": "Croatian cotton shirt with noble weave",
    "Saia estruturada em lã fria de acabamento impecável": "Structured cool wool skirt with impeccable finish",
    "Bolsa em couro natural com ferragens banhadas": "Natural leather bag with plated hardware",
    "Scarpin em couro envernizado de salto esculpido": "Patent leather pumps with sculpted heel",
    "Trench coat em gabardine com corte arquitetônico": "Gabardine trench coat with architectural cut",
    "Malha em lã merino de toque ultrafino": "Ultrafine merino wool knitwear",
    "Vestido coluna em crepe de seda com caimento couture": "Silk crepe column dress with couture drape",
    "Tênis em nylon técnico e couro de acabamento premium": "Technical nylon and premium-finish leather sneaker",
    "Blazer em linho premium com alfaiataria de precisão": "Premium linen blazer with precision tailoring",
    "Calça wide leg em linho premium com prega profunda": "Premium linen wide-leg trousers with deep pleat",
    "Sabrina charmosa": "Charming Sabrina",
    "Sabrina linda": "Elegant Sabrina",
    "Sabrina maravilhosa": "Stunning Sabrina",
    "Sabrina incrível": "Incredible Sabrina",
    "Oportunidades em aberto": "Open roles",
    "Plano de carreira": "Career path",
    "Cultura e benefícios": "Culture and benefits",
    "Banco de talentos": "Talent pool",
    "JUNTE-SE A N\u00D3S": "JOIN US",
    "CARREIRAS": "CAREERS",
    "Há uma raiz que sustenta tudo o que escolhemos ser. Porque estilo não é sobre o que você veste, é sobre quem você é.": "There is a root that sustains everything we choose to be. Style is not about what you wear, it is about who you are.",
    "Há uma raiz que sustenta tudo o que escolhemos ser. Porque estilo não é sobre o que você veste, é sobre quem você é": "There is a root that sustains everything we choose to be. Style is not about what you wear, it is about who you are.",
    "Feminino": "Women",
    "Masculino": "Men"
  };

  const PLACEHOLDER_MAP_EN = {
    "Digite seu e-mail": "Enter your email",
    "Senha": "Password",
    "Nome": "First name",
    "Sobrenome": "Last name",
    "CPF": "Tax ID",
    "Data de nascimento (DD/MM/AAAA)": "Birth date (DD/MM/YYYY)",
    "Telefone (opcional)": "Phone (optional)",
    "Pesquisar (vestido azul, etc)": "Search (blue dress, etc)",
    "O que você está buscando?": "What are you looking for?",
    "Conte sua experiência e por que quer fazer parte da Tsebi.": "Share your experience and why you want to join Tsebi.",
    "https://linkedin.com/in/seu-perfil": "https://linkedin.com/in/your-profile",
    "https://seuportfolio.com": "https://yourportfolio.com",
    "O que você está buscando?": "What are you looking for?"
  };

  const ARIA_MAP_EN = {
    "Conta": "Account",
    "Carrinho": "Cart",
    "Abrir busca": "Open search",
    "Fechar": "Close",
    "Abrir menu": "Open menu",
    "Fechar menu": "Close menu",
    "Categorias": "Categories",
    "Vídeos de costura": "Sewing videos",
    "Etapas do processo": "Process steps",
    "Posicionamento da marca": "Brand positioning",
    "Assinar newsletter": "Subscribe to newsletter",
    "Seletor de idioma": "Language selector"
  };

  const TITLE_MAP_EN = {
    "Tsebi Brasil": "Tsebi Brazil",
    "Carrinho | Tsebi Brasil": "Cart | Tsebi Brazil",
    "Conta | Tsebi Brasil": "Account | Tsebi Brazil",
    "Tsebi Careers": "Tsebi Careers",
    "Candidatura | Tsebi Careers": "Application | Tsebi Careers",
    "Processos | TSEBI": "Processes | TSEBI",
    "Coleção Genesis | Tsebi Brasil": "Genesis Collection | Tsebi Brazil",
    "Coleção Genesis | Tsebi Brasil": "Genesis Collection | Tsebi Brazil"
  };

  const SIZE_MAP_EN = {
    P: "S",
    M: "M",
    G: "X",
    GG: "XS"
  };

  const EXPLICIT_SELECTORS_EN = [`r`n    { selector: "#searchInput", attr: "placeholder", text: "Search (blue dress, etc)" },
    { selector: "#topMessage", text: "Free shipping!" },
    { selector: "#tabFeminino", text: "Women" },
    { selector: "#tabMasculino", text: "Men" }
  ];

  let observerStarted = false;
  let observer = null;

  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildFlexibleSpaceRegex(text) {
    const parts = text.trim().split(/\s+/).map((part) => escapeRegExp(part));
    return new RegExp(parts.join("\\s+"), "g");
  }

  function mapSizeTokenToEnglish(token) {
    return SIZE_MAP_EN[token] || token;
  }

  function translateSizeNotationInText(text) {
    // Ex.: "Tamanho: P" / "Size: G"
    let output = text.replace(/(Tamanho|Size)\s*:\s*(GG|G|M|P)\b/g, (match, label, size) => {
      return `${label}: ${mapSizeTokenToEnglish(size)}`;
    });

    // Ex.: "Azul / P"
    output = output.replace(/\/\s*(GG|G|M|P)(?=($|[\s,.;|]))/g, (match, size) => {
      return `/ ${mapSizeTokenToEnglish(size)}`;
    });

    // Ex.: "P, M, G, GG" (tokens isolados)
    output = output.replace(/(^|[^0-9A-Za-z])(GG|G|M|P)(?=($|[^0-9A-Za-z]))/g, (match, prefix, size) => {
      return `${prefix}${mapSizeTokenToEnglish(size)}`;
    });

    return output;
  }

  const REPLACERS = Object.entries(TEXT_MAP_EN)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([pt, en]) => ({
      regex: buildFlexibleSpaceRegex(pt),
      en
    }));

  function translateTextValueToEnglish(text) {
    const trimmed = text.trim();
    if (trimmed && TEXT_MAP_EN[trimmed]) {
      return translateSizeNotationInText(text.replace(trimmed, TEXT_MAP_EN[trimmed]));
    }

    let translated = text;
    REPLACERS.forEach(({ regex, en }) => {
      translated = translated.replace(regex, en);
    });
    return translateSizeNotationInText(translated);
  }

  function translateTextNodesInRoot(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
        node = walker.nextNode();
        continue;
      }

      const current = node.nodeValue || "";
      const translated = translateTextValueToEnglish(current);
      if (translated !== current) {
        node.nodeValue = translated;
      }
      node = walker.nextNode();
    }
  }

  function translateElementAttrsInRoot(root) {
    const scope = root instanceof Element ? root : document.body;
    const all = [scope, ...scope.querySelectorAll("*")];

    all.forEach((el) => {
      if (el.hasAttribute("placeholder")) {
        const value = el.getAttribute("placeholder");
        if (value && PLACEHOLDER_MAP_EN[value]) {
          el.setAttribute("placeholder", PLACEHOLDER_MAP_EN[value]);
        }
      }

      if (el.hasAttribute("aria-label")) {
        const value = el.getAttribute("aria-label");
        if (value && ARIA_MAP_EN[value]) {
          el.setAttribute("aria-label", ARIA_MAP_EN[value]);
        }
      }

      if (el.hasAttribute("title")) {
        const value = el.getAttribute("title");
        if (value && TEXT_MAP_EN[value]) {
          el.setAttribute("title", TEXT_MAP_EN[value]);
        }
      }

      if (el instanceof HTMLInputElement && typeof el.value === "string" && TEXT_MAP_EN[el.value]) {
        el.value = TEXT_MAP_EN[el.value];
      }

      if (el instanceof HTMLOptionElement) {
        if (SIZE_MAP_EN[el.textContent?.trim() || ""]) {
          el.textContent = SIZE_MAP_EN[el.textContent.trim()];
        }
      }
    });
  }

  function translateDomToEnglish(root = document.body) {
    if (!root) return;
    translateTextNodesInRoot(root);
    translateElementAttrsInRoot(root);
  }

  function applyExplicitTranslationsToEnglish() {
    EXPLICIT_SELECTORS_EN.forEach((item) => {
      const elements = document.querySelectorAll(item.selector);
      if (!elements.length) return;
      elements.forEach((el) => {
        if (item.attr) {
          el.setAttribute(item.attr, item.text);
          return;
        }
        el.textContent = item.text;
      });
    });
  }

  function applyLegalPageEnglishOverrides() {
    const path = (window.location.pathname || "").toLowerCase();

    if (path.endsWith("/aviso-legal.html") || path.endsWith("aviso-legal.html")) {
      const title = document.querySelector(".legal-title");
      const subtitle = document.querySelector(".legal-subtitle");
      const content = document.querySelector(".legal-content");
      if (title) title.textContent = "LEGAL NOTICE";
      if (subtitle) subtitle.textContent = "Website Terms and Conditions of Use";
      if (content) {
        content.innerHTML = `
          <p>Users must carefully read the following terms before accessing or using this website.</p>
          <p>Welcome to the Tsebi website (the "Site").</p>
          <p>Access to and use of this Site are subject to these Terms and Conditions of Use. By browsing, accessing, or using any Site functionality, you confirm that you have read, understood, and fully agreed to these terms.</p>
          <h3>1. Intellectual Property</h3>
          <p>All content on this Site, including text, images, videos, graphics, logos, interface, code, and layout, is owned by Tsebi or used with authorization and protected by intellectual property laws.</p>
          <p>Use is allowed only for personal and non-commercial purposes.</p>
          <h3>2. Limitation of Liability</h3>
          <p>The Site is provided "as is" and "as available". Tsebi does not guarantee uninterrupted access or absence of technical failures.</p>
          <p>To the fullest extent permitted by law, Tsebi is not liable for direct or indirect damages resulting from Site use or inability to use it.</p>
          <h3>3. User-Submitted Content</h3>
          <p>Suggestions, comments, reviews, or other content sent to Tsebi may be used for institutional, promotional, or commercial purposes, without compensation.</p>
          <h3>4. Cookies</h3>
          <p>This Site uses cookies to ensure proper operation, improve navigation, analyze usage, and personalize communications.</p>
          <h3>5. Privacy and Data Protection</h3>
          <p>Tsebi processes personal data in accordance with applicable law, including LGPD.</p>
          <h3>6. Third-Party Links</h3>
          <p>The Site may contain links to third-party websites. Tsebi is not responsible for third-party content, practices, or services.</p>
          <h3>7. Security</h3>
          <p>Although reasonable safeguards are adopted, data transmission over the internet is not risk-free.</p>
          <h3>8. Acceptance of Terms</h3>
          <p>By using this Site, you acknowledge and accept these Terms and Conditions of Use.</p>
          <p class="legal-signature">Tsebi<br />[City - State]<br />E-mail: [your@email.com]<br />Tax ID: 65.164.000/0001-72</p>
        `;
      }
      return;
    }

    if (path.endsWith("/politica-privacidade.html") || path.endsWith("politica-privacidade.html")) {
      const title = document.querySelector(".privacy-title");
      const content = document.querySelector(".privacy-content");
      if (title) title.textContent = "PRIVACY POLICY";
      if (content) {
        content.innerHTML = `
          <p>Tsebi values privacy, security, and transparency in personal data processing.</p>
          <p>This Privacy Policy explains how we collect, use, store, and protect your information when you use our Site.</p>
          <h3>1. Data Collected</h3>
          <p>We may collect browsing data (IP, device, pages visited, date/time), cookies, and data voluntarily provided by you (name, email, phone, address, and purchase data).</p>
          <h3>2. Purpose of Processing</h3>
          <p>Your data may be used to process orders, confirm payments, provide support, comply with legal obligations, and improve services. With consent, we may send marketing and newsletter communications.</p>
          <h3>3. Data Sharing</h3>
          <p>Data may be shared, when necessary, with payment, logistics, hosting, and legal authorities. Tsebi does not sell personal data.</p>
          <h3>4. Storage and Security</h3>
          <p>Data is stored in secure environments with technical and administrative safeguards.</p>
          <h3>5. Data Subject Rights</h3>
          <p>You may request access, correction, deletion, portability, and consent withdrawal, as allowed by law.</p>
          <h3>6. Minors</h3>
          <p>The Site is not intended for users under 18.</p>
          <h3>7. Controller and Contact</h3>
          <p>Tsebi<br />[City - State]<br />E-mail: contato@tsebi.com</p>
          <h3>8. Policy Updates</h3>
          <p>This policy may be updated to reflect legal, technical, or operational changes.</p>
          <p class="privacy-update">Last update: February 2026</p>
        `;
      }
      return;
    }

    if (path.endsWith("/cookie-policy.html") || path.endsWith("cookie-policy.html")) {
      const title = document.querySelector(".cookie-title");
      const subtitle = document.querySelector(".cookie-subtitle");
      const content = document.querySelector(".cookie-content");
      if (title) title.textContent = "Cookie Policy";
      if (subtitle) subtitle.textContent = "Information notice on cookie usage";
      if (content) {
        content.innerHTML = `
          <p>Tsebi uses cookies and similar technologies to ensure Site operation, improve browsing experience, and, when authorized, personalize communications.</p>
          <h2>1. What are cookies?</h2>
          <p>Cookies are small text files stored in your browser to recognize your device in future visits.</p>
          <h2>2. Why we use cookies</h2>
          <ul>
            <li>Keep the Site working properly</li>
            <li>Remember preferences</li>
            <li>Understand aggregated Site usage</li>
            <li>Measure campaigns and communications (when authorized)</li>
          </ul>
          <h2>3. Cookie categories</h2>
          <p>We may use essential, functional, analytics, and marketing cookies depending on your consent settings.</p>
          <h2>4. Consent and settings</h2>
          <p>You can accept, refuse, or adjust cookie categories in Cookie Settings, and also manage cookies in your browser.</p>
          <h2>5. Policy updates</h2>
          <p>This policy may be updated to reflect legal, technical, or operational changes.</p>
          <p class="cookie-update">Last update: February 2026</p>
        `;
      }
    }
  }

  function applyProcessPageEnglishOverrides() {
    const path = (window.location.pathname || "").toLowerCase();
    if (!path.endsWith("/processos.html") && !path.endsWith("processos.html")) return;

    const title = document.getElementById("process-title");
    const kicker = document.querySelector(".process-kicker");
    const subtitle = document.querySelector(".process-subtitle");
    const cta = document.querySelector(".process-cta");
    if (kicker) kicker.textContent = "TSEBI ATELIER";
    if (title) title.textContent = "Our Process";
    if (subtitle) subtitle.textContent = "Each piece is produced in small scale, with attention to detail, from the first cut to the final stitch.";
    if (cta) cta.textContent = "View steps";

    const stepMap = [
      ["Material selection", "Selection of high-quality fabrics and trims."],
      ["Pattern making", "Technical development for perfect fit and structure."],
      ["Cutting", "Precision cutting to ensure proportion and finishing."],
      ["Sewing", "Piece assembly with attention to detail."],
      ["Finishing", "Seam reinforcement, cleaning, and label application."],
      ["Final review", "Each piece is inspected before reaching you."]
    ];
    const stepCards = Array.from(document.querySelectorAll(".process-step"));
    stepCards.forEach((card, index) => {
      const heading = card.querySelector("h3");
      const text = card.querySelector("p");
      const [h, p] = stepMap[index] || [];
      if (heading && h) heading.textContent = h;
      if (text && p) text.textContent = p;
    });

    const closing = document.querySelector(".process-closing p");
    if (closing) closing.textContent = "Small-scale production. Quality above quantity.";

    const videoFallback = Array.from(document.querySelectorAll(".process-video"));
    videoFallback.forEach((video, index) => {
      video.setAttribute("aria-label", `Sewing at Tsebi atelier - video ${index + 1}`);
      const fallbackTextNode = Array.from(video.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
      if (fallbackTextNode) fallbackTextNode.nodeValue = "\n        Your browser does not support video playback.\n      ";
    });
  }

  function translateTitleToEnglish() {
    if (TITLE_MAP_EN[document.title]) {
      document.title = TITLE_MAP_EN[document.title];
    }
  }

  function mountSwitcher() {
    const existing = document.querySelector(".site-language-switcher");
    if (existing) return;

    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const footer =
      document.querySelector(".site-footer .footer-grid") ||
      document.querySelector(".site-footer") ||
      document.querySelector("footer");

    const header =
      document.querySelector(".home-header .header-right") ||
      document.querySelector(".careers-header") ||
      document.querySelector(".cart-simple-actions") ||
      document.querySelector(".account-min-header") ||
      document.querySelector("body > header");

    const host = isMobile && footer ? footer : header;
    if (!host) return;

    const wrapper = document.createElement("div");
    wrapper.className = "site-language-switcher";

    const currentLang = getLang();

    const ptBtn = document.createElement("button");
    ptBtn.type = "button";
    ptBtn.className = "lang-btn";
    if (currentLang === "pt") ptBtn.classList.add("is-active");
    ptBtn.textContent = "PT";
    ptBtn.setAttribute("aria-label", "Português");
    ptBtn.addEventListener("click", () => {
      setLang("pt");
      window.location.reload();
    });

    const divider = document.createElement("span");
    divider.className = "lang-divider";
    divider.textContent = "|";
    divider.setAttribute("aria-hidden", "true");

    const enBtn = document.createElement("button");
    enBtn.type = "button";
    enBtn.className = "lang-btn";
    if (currentLang === "en") enBtn.classList.add("is-active");
    enBtn.textContent = "EN";
    enBtn.setAttribute("aria-label", "English");
    enBtn.addEventListener("click", () => {
      setLang("en");
      window.location.reload();
    });

    wrapper.appendChild(ptBtn);
    wrapper.appendChild(divider);
    wrapper.appendChild(enBtn);
    host.appendChild(wrapper);
  }

  function startObserverIfNeeded() {
    if (observerStarted || getLang() !== "en" || !document.body) return;
    observerStarted = true;

    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target?.parentElement) {
          const textNode = mutation.target;
          const current = textNode.nodeValue || "";
          const translated = translateTextValueToEnglish(current);
          if (translated !== current) {
            textNode.nodeValue = translated;
          }
          return;
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const current = node.nodeValue || "";
            const translated = translateTextValueToEnglish(current);
            if (translated !== current) {
              node.nodeValue = translated;
            }
            return;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            translateDomToEnglish(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function applyLanguage() {
    const lang = getLang();
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    if (lang === "en") {
      translateTitleToEnglish();
      translateDomToEnglish(document.body);
      applyExplicitTranslationsToEnglish();
      applyLegalPageEnglishOverrides();
      applyProcessPageEnglishOverrides();
      startObserverIfNeeded();
    } else if (observer) {
      observer.disconnect();
      observer = null;
      observerStarted = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    mountSwitcher();
    applyLanguage();
    // Reaplica após scripts da página concluírem renderizações tardias.
    setTimeout(applyLanguage, 120);
    setTimeout(applyLanguage, 600);
  });
})();




