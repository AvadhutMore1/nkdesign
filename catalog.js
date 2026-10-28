const shopTranslations = {
  en: {
    eyebrow: "THE NK DESIGN COLLECTION",
    title: "Made for your<br><em>kind of beautiful.</em>",
    intro: "Discover considered silhouettes, thoughtful details, and handcrafted blouses made for every version of you.",
    discover: "DISCOVER THE COLLECTION",
    curated: "THOUGHTFULLY CURATED",
    catalogTitle: "Find your <em>favourite.</em>",
    searchLabel: "Search blouses",
    searchPlaceholder: "Search styles, fabrics, occasions",
    filter: "Filter",
    sortBy: "Sort by",
    sortFeatured: "Featured",
    sortPriceLow: "Price: low to high",
    sortPriceHigh: "Price: high to low",
    sortName: "Name",
    loading: "Discovering your collection…",
    retry: "Try again",
    personalizeEyebrow: "MADE FOR YOU, ALWAYS",
    personalizeTitle: "Love a little<br><em>personal touch?</em>",
    personalizeBody: "Create something entirely your own with a custom blouse, made thoughtfully to your measurements and vision.",
    personalizeCta: "Explore custom design",
    all: "All designs",
    results: (count) => `${count} ${count === 1 ? "piece" : "pieces"} to discover`,
    empty: "No designs match just yet. Try another search or category.",
    loadError: "We couldn't load the collection right now. Please check your connection and try again.",
    noProducts: "Our collection is being refreshed. Please check back soon.",
    soldOut: "Sold out",
    inStock: "In stock",
    lowStock: (count) => `Only ${count} left`,
    quickView: "Quick view",
    addToBag: "Add to bag",
    added: "Added to your bag",
    addError: "Could not save this item to your bag. Please try again.",
    selectOptions: "Choose available options",
    chooseSize: "Choose size",
    chooseColor: "Choose color",
    colorLabel: "Color",
    sizeLabel: "Size",
    details: "Details",
    whatsapp: "Ask us on WhatsApp",
    close: "Close quick view",
    wishlistAdded: "Added to wishlist",
    wishlistRemoved: "Removed from wishlist",
    wishlistError: "Could not update your wishlist. Please try again.",
    category: "Category",
    discount: (percent) => `${percent}% OFF`,
    searchShortcut: "Search products"
  },
  mr: {
    eyebrow: "NK DESIGN कलेक्शन",
    title: "तुमच्या सौंदर्यासाठी<br><em>खास तयार.</em>",
    intro: "सुंदर आकार, विचारपूर्वक तपशील आणि तुमच्या प्रत्येक रूपासाठी हाताने तयार केलेले ब्लाउज शोधा.",
    discover: "कलेक्शन पाहा",
    curated: "विचारपूर्वक निवडलेले",
    catalogTitle: "तुमचे <em>आवडते शोधा.</em>",
    searchLabel: "ब्लाउज शोधा",
    searchPlaceholder: "शैली, कापड किंवा प्रसंग शोधा",
    filter: "फिल्टर",
    sortBy: "क्रमवारी",
    sortFeatured: "वैशिष्ट्यपूर्ण",
    sortPriceLow: "कमी किंमतीपासून",
    sortPriceHigh: "जास्त किंमतीपासून",
    sortName: "नाव",
    loading: "तुमचे कलेक्शन शोधत आहोत…",
    retry: "पुन्हा प्रयत्न करा",
    personalizeEyebrow: "नेहमी तुमच्यासाठी खास",
    personalizeTitle: "थोडासा वैयक्तिक<br><em>स्पर्श आवडेल?</em>",
    personalizeBody: "तुमच्या मापानुसार आणि कल्पनेनुसार खास ब्लाउज तयार करून स्वतःची वेगळी शैली घडवा.",
    personalizeCta: "कस्टम डिझाइन पाहा",
    all: "सर्व डिझाइन्स",
    results: (count) => `${count} डिझाइन्स`,
    empty: "तुमच्या शोधाशी जुळणारे डिझाइन मिळाले नाही. दुसरा शब्द किंवा प्रकार वापरून पाहा.",
    loadError: "कलेक्शन लोड झाले नाही. कृपया इंटरनेट तपासून पुन्हा प्रयत्न करा.",
    noProducts: "आमचे कलेक्शन अपडेट होत आहे. कृपया पुन्हा भेट द्या.",
    soldOut: "संपले",
    inStock: "उपलब्ध",
    lowStock: (count) => `फक्त ${count} शिल्लक`,
    quickView: "झटपट पाहा",
    addToBag: "पिशवीत घाला",
    added: "पिशवीत जोडले",
    addError: "वस्तू पिशवीत जतन झाली नाही. कृपया पुन्हा प्रयत्न करा.",
    selectOptions: "उपलब्ध पर्याय निवडा",
    chooseSize: "माप निवडा",
    chooseColor: "रंग निवडा",
    colorLabel: "रंग",
    sizeLabel: "माप",
    details: "तपशील",
    whatsapp: "WhatsApp वर विचारा",
    close: "झटपट माहिती बंद करा",
    wishlistAdded: "विशलिस्टमध्ये जोडले",
    wishlistRemoved: "विशलिस्टमधून काढले",
    wishlistError: "विशलिस्ट अपडेट झाली नाही. कृपया पुन्हा प्रयत्न करा.",
    category: "प्रकार",
    discount: (percent) => `${percent}% सूट`,
    searchShortcut: "उत्पादने शोधा"
  }
};

const catalogRoot = document.querySelector(".shop-page");
const productGrid = document.getElementById("catalog-grid");
const catalogStatus = document.getElementById("catalog-status");
const catalogCount = document.getElementById("catalog-count");
const filterContainer = document.getElementById("category-filters");
const searchInput = document.getElementById("catalog-search");
const sortSelect = document.getElementById("catalog-sort");
const filterToggle = document.getElementById("filter-toggle");
const filterPanel = document.getElementById("category-filters");
const retryButton = document.getElementById("retry-load");
const quickViewDialog = document.getElementById("quick-view");
const quickViewContent = document.getElementById("quick-view-content");
const toastRegion = document.getElementById("toast-region");
const shopApiUrl = window.NK_DESIGN_API && window.NK_DESIGN_API.productsUrl
  ? window.NK_DESIGN_API.productsUrl
  : "/api/products";

let products = [];
let selectedCategory = new URLSearchParams(window.location.search).get("category") || "";
let toastTimer;
let catalogStatusKey = "loading";

function currentShopLanguage() {
  return document.documentElement.lang === "mr" ? "mr" : "en";
}

function translateShop(key, ...args) {
  const value = shopTranslations[currentShopLanguage()][key];
  return typeof value === "function" ? value(...args) : value || shopTranslations.en[key] || key;
}

function applyShopLanguage(language) {
  const dictionary = shopTranslations[language] || shopTranslations.en;
  document.querySelectorAll("[data-shop-i18n]").forEach((element) => {
    const value = dictionary[element.dataset.shopI18n];
    if (typeof value === "string") element.innerHTML = value;
  });
  document.querySelectorAll("[data-shop-placeholder]").forEach((element) => {
    const value = dictionary[element.dataset.shopPlaceholder];
    if (value) element.placeholder = value;
  });
  document.querySelectorAll("[data-shop-aria]").forEach((element) => {
    const value = dictionary[element.dataset.shopAria];
    if (value) element.setAttribute("aria-label", value);
  });
  document.querySelector(".search-shortcut").setAttribute("aria-label", dictionary.searchShortcut);
  if (!catalogStatus.hidden) {
    const statusText = typeof dictionary[catalogStatusKey] === "function"
      ? dictionary[catalogStatusKey]()
      : dictionary[catalogStatusKey];
    if (statusText) showStatus(statusText, catalogStatusKey === "loading" ? "loading" : catalogStatusKey === "loadError" ? "error" : "empty");
  }
  renderFilters();
  renderProducts();
}

window.addEventListener("nk-design:language-change", (event) => {
  applyShopLanguage(event.detail && event.detail.language ? event.detail.language : currentShopLanguage());
});

function showStatus(key, kind = "info") {
  catalogStatusKey = key;
  catalogStatus.hidden = false;
  catalogStatus.className = `catalog-status is-${kind}`;
  catalogStatus.replaceChildren();
  const text = document.createElement("span");
  text.textContent = translateShop(key);
  catalogStatus.append(text);
  productGrid.replaceChildren();
}

function showToast(message) {
  toastRegion.textContent = message;
  toastRegion.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastRegion.classList.remove("is-visible"), 2400);
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function normalizeProduct(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.id ?? item.product_id;
  const name = item.name ?? item.title;
  const price = Number(item.price);
  if ((typeof id !== "string" && typeof id !== "number") || typeof name !== "string" || !Number.isFinite(price) || price < 0) return null;

  const rawImages = Array.isArray(item.images) ? item.images : [item.image ?? item.image_url];
  const images = rawImages.map((image) => {
    const source = typeof image === "string" ? image : image && (image.url || image.src);
    return safeImageUrl(source);
  }).filter(Boolean);
  const rawSizes = Array.isArray(item.sizes) ? item.sizes : [];
  const rawColors = Array.isArray(item.colors) ? item.colors : [];
  const stockValue = item.stock ?? item.stock_quantity;
  const stock = stockValue == null ? null : Number(stockValue);
  const discountPrice = Number(item.discountPrice ?? item.discount_price);
  const discount = Number(item.discountPercentage ?? item.discount_percentage);

  return {
    id: String(id),
    name: name.trim(),
    nameMr: typeof item.name_mr === "string" ? item.name_mr : "",
    description: typeof item.description === "string" ? item.description : "",
    descriptionMr: typeof item.description_mr === "string" ? item.description_mr : "",
    category: typeof item.category === "string" ? item.category : "",
    categoryMr: typeof item.category_mr === "string" ? item.category_mr : "",
    price,
    discountPrice: Number.isFinite(discountPrice) && discountPrice > 0 && discountPrice < price ? discountPrice : null,
    discount: Number.isFinite(discount) ? Math.max(0, Math.min(95, Math.round(discount))) : 0,
    images,
    sizes: rawSizes.map((option) => typeof option === "string" ? option : option && option.name).filter((option) => typeof option === "string" && option),
    colors: rawColors.map((option) => typeof option === "string" ? { name: option } : option).filter((option) => option && typeof option.name === "string"),
    stock: Number.isFinite(stock) && stock >= 0 ? stock : null,
    available: item.available !== false && item.is_available !== false && !(Number.isFinite(stock) && stock <= 0),
    whatsappMessage: typeof item.whatsapp_message === "string" ? item.whatsapp_message : ""
  };
}

async function loadProducts() {
  retryButton.hidden = true;
  showStatus("loading", "loading");
  try {
    const response = await fetch(shopApiUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Product request failed with status ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload && (payload.products || payload.data);
    if (!Array.isArray(records)) throw new Error("Product API response must be an array or contain a products array");
    products = records.map(normalizeProduct).filter(Boolean);
    if (!products.length) {
      showStatus("noProducts", "empty");
      catalogCount.textContent = translateShop("results", 0);
      renderFilters();
      return;
    }
    catalogStatus.hidden = true;
    renderFilters();
    renderProducts();
  } catch (error) {
    console.error("Unable to load the NK Design product catalog.", error);
    catalogCount.textContent = "";
    showStatus("loadError", "error");
    retryButton.hidden = false;
  }
}

function renderFilters() {
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  if (selectedCategory && !categories.includes(selectedCategory)) selectedCategory = "";
  filterContainer.replaceChildren();
  const allButton = createFilterButton("", translateShop("all"));
  filterContainer.append(allButton);
  categories.forEach((category) => {
    const label = products.find((product) => product.category === category && product.categoryMr);
    filterContainer.append(createFilterButton(category, currentShopLanguage() === "mr" && label ? label.categoryMr : category));
  });
}

function createFilterButton(category, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "filter-chip";
  button.classList.toggle("is-selected", category === selectedCategory);
  button.setAttribute("aria-pressed", String(category === selectedCategory));
  button.textContent = label;
  button.addEventListener("click", () => {
    selectedCategory = category;
    const url = new URL(window.location.href);
    if (category) url.searchParams.set("category", category);
    else url.searchParams.delete("category");
    window.history.replaceState({}, "", url);
    renderFilters();
    renderProducts();
  });
  return button;
}

function visibleProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matches = products.filter((product) => {
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    const searchable = [product.name, product.nameMr, product.description, product.descriptionMr, product.category, product.categoryMr].join(" ").toLocaleLowerCase();
    return matchesCategory && (!query || searchable.includes(query));
  });
  const sort = sortSelect.value;
  if (sort === "price-asc") matches.sort((a, b) => effectivePrice(a) - effectivePrice(b));
  if (sort === "price-desc") matches.sort((a, b) => effectivePrice(b) - effectivePrice(a));
  if (sort === "name") matches.sort((a, b) => localizedName(a).localeCompare(localizedName(b), currentShopLanguage()));
  return matches;
}

function effectivePrice(product) {
  return product.discountPrice ?? product.price;
}

function localizedName(product) {
  return currentShopLanguage() === "mr" && product.nameMr ? product.nameMr : product.name;
}

function formatPrice(price) {
  return new Intl.NumberFormat(currentShopLanguage() === "mr" ? "mr-IN" : "en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(price);
}

function renderProducts() {
  if (!products.length) return;
  const matches = visibleProducts();
  catalogCount.textContent = translateShop("results", matches.length);
  catalogStatus.hidden = true;
  productGrid.replaceChildren();
  if (!matches.length) {
    showStatus("empty", "empty");
    return;
  }
  matches.forEach((product, index) => productGrid.append(createProductCard(product, index)));
}

function createProductCard(product, index) {
  const card = document.createElement("article");
  card.className = "product-card reveal is-visible";
  card.style.setProperty("--card-order", String(index));

  const media = document.createElement("div");
  media.className = "product-media";
  const image = document.createElement("img");
  image.className = "product-image";
  if (product.images.length) {
    image.src = product.images[0];
    image.alt = localizedName(product);
    image.loading = "lazy";
    image.decoding = "async";
    media.append(image);
  } else {
    media.classList.add("is-placeholder");
    const placeholder = document.createElement("span");
    placeholder.className = "product-image-placeholder";
    placeholder.textContent = localizedName(product);
    media.append(placeholder);
  }

  if (product.discountPrice || product.discount) {
    const badge = document.createElement("span");
    badge.className = "product-badge";
    const percent = product.discount || Math.round((1 - product.discountPrice / product.price) * 100);
    badge.textContent = translateShop("discount", percent);
    media.append(badge);
  }
  if (product.stock === 0 || !product.available) {
    const badge = document.createElement("span");
    badge.className = "product-stock-badge";
    badge.textContent = translateShop("soldOut");
    media.append(badge);
  }

  const wishlist = document.createElement("button");
  wishlist.type = "button";
  wishlist.className = "wishlist-button";
  wishlist.dataset.action = "wishlist";
  wishlist.dataset.productId = product.id;
  wishlist.setAttribute("aria-label", translateShop("wishlistAdded"));
  wishlist.setAttribute("aria-pressed", String(isWishlisted(product.id)));
  wishlist.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 8.8c0 4.4-8.8 10-8.8 10s-8.8-5.6-8.8-10a4.5 4.5 0 0 1 8.8-1.4 4.5 4.5 0 0 1 8.8 1.4Z"/></svg>';
  if (isWishlisted(product.id)) wishlist.classList.add("is-wishlisted");
  media.append(wishlist);

  const quickView = document.createElement("button");
  quickView.type = "button";
  quickView.className = "product-quick-view";
  quickView.dataset.action = "quick-view";
  quickView.dataset.productId = product.id;
  quickView.textContent = translateShop("quickView");
  media.append(quickView);

  const content = document.createElement("div");
  content.className = "product-content";
  const meta = document.createElement("div");
  meta.className = "product-meta";
  const category = document.createElement("span");
  category.textContent = currentShopLanguage() === "mr" && product.categoryMr ? product.categoryMr : product.category || "NK Design";
  const stock = document.createElement("span");
  stock.className = product.available ? "stock-indicator" : "stock-indicator is-unavailable";
  stock.textContent = product.stock > 0 && product.stock <= 5 ? translateShop("lowStock", product.stock) : product.available ? translateShop("inStock") : translateShop("soldOut");
  meta.append(category, stock);
  const title = document.createElement("h3");
  title.className = "product-title";
  title.textContent = localizedName(product);
  const price = document.createElement("div");
  price.className = "product-price";
  if (product.discountPrice) {
    const original = document.createElement("s");
    original.textContent = formatPrice(product.price);
    price.append(original);
  }
  const current = document.createElement("strong");
  current.textContent = formatPrice(effectivePrice(product));
  price.append(current);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "product-add-button";
  add.dataset.action = "add";
  add.dataset.productId = product.id;
  add.disabled = !product.available;
  add.textContent = product.available ? translateShop("addToBag") : translateShop("soldOut");
  content.append(meta, title, price, add);
  card.append(media, content);
  return card;
}

function isWishlisted(id) {
  try {
    const saved = JSON.parse(localStorage.getItem("nk-design-wishlist") || "[]");
    return Array.isArray(saved) && saved.includes(id);
  } catch (error) {
    console.error("Unable to read the NK Design wishlist.", error);
    return false;
  }
}

function toggleWishlist(id, button) {
  try {
    const saved = JSON.parse(localStorage.getItem("nk-design-wishlist") || "[]");
    const wishlist = Array.isArray(saved) ? saved : [];
    const index = wishlist.indexOf(id);
    const wasSaved = index !== -1;
    if (wasSaved) wishlist.splice(index, 1);
    else wishlist.push(id);
    localStorage.setItem("nk-design-wishlist", JSON.stringify(wishlist));
    button.classList.toggle("is-wishlisted", !wasSaved);
    button.setAttribute("aria-pressed", String(!wasSaved));
    button.setAttribute("aria-label", translateShop(wasSaved ? "wishlistAdded" : "wishlistRemoved"));
    showToast(translateShop(wasSaved ? "wishlistRemoved" : "wishlistAdded"));
  } catch (error) {
    console.error("Unable to update the NK Design wishlist.", error);
    showToast(translateShop("wishlistError"));
  }
}

function readCart() {
  const stored = localStorage.getItem("nk-design-cart");
  if (!stored) return {};
  const cart = JSON.parse(stored);
  return cart && typeof cart === "object" && !Array.isArray(cart) ? cart : {};
}

function addToCart(product, options = {}) {
  if (!product.available || (product.sizes.length && !options.size) || (product.colors.length && !options.color)) {
    showToast(translateShop(product.available ? "selectOptions" : "soldOut"));
    return;
  }
  try {
    const cart = readCart();
    const optionKey = `${product.id}:${options.size || ""}:${options.color || ""}`;
    const item = cart[optionKey] || {
      productId: product.id,
      name: product.name,
      nameMr: product.nameMr,
      price: effectivePrice(product),
      quantity: 0
    };
    item.quantity += 1;
    item.nameMr = product.nameMr;
    item.image = product.images[0] || "";
    if (options.size) item.size = options.size;
    if (options.color) item.color = options.color;
    cart[optionKey] = item;
    localStorage.setItem("nk-design-cart", JSON.stringify(cart));
    const count = Object.values(cart).reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
    localStorage.setItem("nk-design-cart-count", String(count));
    window.dispatchEvent(new CustomEvent("nk-design:cart-update", { detail: { count, product, options } }));
    showToast(translateShop("added"));
  } catch (error) {
    console.error("Unable to add the product to the NK Design bag.", error);
    showToast(translateShop("addError"));
  }
}

function appendOptionSelect(container, label, values, name) {
  if (!values.length) return null;
  const wrapper = document.createElement("label");
  wrapper.className = "quick-option";
  const caption = document.createElement("span");
  caption.textContent = label;
  const select = document.createElement("select");
  select.name = name;
  select.required = true;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = translateShop(name === "size" ? "chooseSize" : "chooseColor");
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  wrapper.append(caption, select);
  container.append(wrapper);
  return select;
}

function openQuickView(product) {
  quickViewContent.replaceChildren();
  const layout = document.createElement("div");
  layout.className = "quick-view-layout";
  let image;
  if (product.images.length) {
    image = document.createElement("img");
    image.className = "quick-view-image";
    image.src = product.images[0];
    image.alt = localizedName(product);
  } else {
    image = document.createElement("div");
    image.className = "quick-view-image quick-view-placeholder";
    image.textContent = localizedName(product);
  }
  const details = document.createElement("div");
  details.className = "quick-view-details";
  const category = document.createElement("p");
  category.className = "eyebrow eyebrow-dark";
  category.textContent = product.category || "NK Design";
  const title = document.createElement("h2");
  title.id = "quick-view-title";
  title.textContent = localizedName(product);
  const price = document.createElement("p");
  price.className = "quick-view-price";
  price.textContent = formatPrice(effectivePrice(product));
  if (product.discountPrice) {
    const original = document.createElement("s");
    original.textContent = formatPrice(product.price);
    price.append(" ", original);
  }
  const description = document.createElement("p");
  description.className = "quick-view-description";
  description.textContent = currentShopLanguage() === "mr" && product.descriptionMr ? product.descriptionMr : product.description || translateShop("details");
  const options = document.createElement("div");
  options.className = "quick-view-options";
  const sizeSelect = appendOptionSelect(options, translateShop("sizeLabel"), product.sizes, "size");
  const colorSelect = appendOptionSelect(options, translateShop("colorLabel"), product.colors.map((color) => color.name), "color");
  const add = document.createElement("button");
  add.type = "button";
  add.className = "button button-wine";
  add.textContent = product.available ? translateShop("addToBag") : translateShop("soldOut");
  add.disabled = !product.available;
  add.addEventListener("click", () => addToCart(product, {
    size: sizeSelect ? sizeSelect.value : "",
    color: colorSelect ? colorSelect.value : ""
  }));
  const whatsappNumber = typeof window.NK_DESIGN_WHATSAPP === "string" ? window.NK_DESIGN_WHATSAPP.replace(/\D/g, "") : "";
  if (whatsappNumber) {
    const message = product.whatsappMessage || `Hello NK Design, I would like to know more about ${product.name}.`;
    const whatsapp = document.createElement("a");
    whatsapp.className = "quick-whatsapp";
    whatsapp.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    whatsapp.target = "_blank";
    whatsapp.rel = "noopener noreferrer";
    whatsapp.textContent = translateShop("whatsapp");
    details.append(category, title, price, description, options, add, whatsapp);
  } else {
    details.append(category, title, price, description, options, add);
  }
  layout.append(image, details);
  quickViewContent.append(layout);
  if (typeof quickViewDialog.showModal === "function") quickViewDialog.showModal();
  else quickViewDialog.setAttribute("open", "");
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;
  if (button.dataset.action === "wishlist") toggleWishlist(product.id, button);
  if (button.dataset.action === "quick-view") openQuickView(product);
  if (button.dataset.action === "add") {
    if (product.sizes.length || product.colors.length) openQuickView(product);
    else addToCart(product);
  }
});

quickViewDialog.addEventListener("click", (event) => {
  if (event.target === quickViewDialog) quickViewDialog.close();
});
searchInput.addEventListener("input", renderProducts);
sortSelect.addEventListener("change", renderProducts);
retryButton.addEventListener("click", loadProducts);
filterToggle.addEventListener("click", () => {
  const isExpanded = filterToggle.getAttribute("aria-expanded") === "true";
  filterToggle.setAttribute("aria-expanded", String(!isExpanded));
  filterPanel.classList.toggle("is-expanded", !isExpanded);
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

const searchShortcut = document.querySelector(".search-shortcut");
if (navigator.userAgentData && navigator.userAgentData.platform) {
  searchShortcut.textContent = navigator.userAgentData.platform.toLowerCase().includes("mac") ? "⌘ K" : "Ctrl K";
} else if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
  searchShortcut.textContent = "Ctrl K";
}

applyShopLanguage(currentShopLanguage());
loadProducts();
