
const API_BASE = "https://api.tcgdex.net/v2/en";
const SEARCH_DELAY = 4000;
const PAGE_SIZE = 9;

const searchInput = document.getElementById("searchInput");
const seriesFilter = document.getElementById("seriesFilter");
const setFilter = document.getElementById("setFilter");

const statusElement = document.getElementById("status");
const cardsContainer = document.getElementById("cardsContainer");
const cardCounter = document.getElementById("cardCounter");

const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const pageIndicator = document.getElementById("pageIndicator");

let searchTimer;
let latestRequest = 0;
let currentPage = 1;
let filtersInitialized = false;

let allSets = [];
let allSeries = [];

let catalogsPromise = null;

// Cache for API responses
const pageCache = new Map();
const setCache = new Map();
const seriesCache = new Map();
const cardDetailsCache = new Map();
let latestDetailRequest = 0;

// Fetch JSON with detailed errors
async function fetchJson(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${new URL(url).pathname}`
            );
        }

        return await response.json();

    } catch (error) {

        console.error("Failed request:", url, error);

        if (error instanceof TypeError) {
            throw new Error(
                `Network/CORS error: ${new URL(url).pathname}`
            );
        }

        throw error;
    }
}

// Load sets and series only once
function getCatalogs() {

    if (!catalogsPromise) {

        catalogsPromise = Promise.all([
            fetchJson(`${API_BASE}/sets`),
            fetchJson(`${API_BASE}/series`)
        ]).then(([sets, series]) => ({ sets, series }))
            .catch(error => {
                catalogsPromise = null;
                throw error;
            });
    }

    return catalogsPromise;
}

// Cache a request and retry after a failure
function getCached(cache, url) {

    if (!cache.has(url)) {

        const request = fetchJson(url).catch(error => {
            cache.delete(url);
            throw error;
        });

        cache.set(url, request);
    }

    return cache.get(url);
}

// Detailed set data
function getSetDetails(id) {
    return getCached(
        setCache,
        `${API_BASE}/sets/${encodeURIComponent(id)}`
    );
}

// Detailed series data
function getSeriesDetails(id) {
    return getCached(
        seriesCache,
        `${API_BASE}/series/${encodeURIComponent(id)}`
    );
}

// Create a URL with filters and pagination
function buildCardsUrl(page) {

    const params = new URLSearchParams({
        "pagination:page": String(page),
        "pagination:itemsPerPage": String(PAGE_SIZE)
    });

    const name = searchInput.value.trim();

    if (name) {
        params.set("name", name);
    }

    if (setFilter.value) {
        params.set("id", `${setFilter.value}-*`);
    }

    return `${API_BASE}/cards?${params.toString()}`;
}

// Fill a dropdown
function fillSelect(select, items, allLabel = null) {

    select.replaceChildren();

    if (allLabel !== null) {
        select.add(new Option(allLabel, ""));
    }

    const sorted = [...items].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    sorted.forEach(item => {
        select.add(new Option(item.name, item.id));
    });
}

// Initialize filters one time
function initializeFilters(sets, series) {

    if (filtersInitialized) {
        return;
    }

    allSets = sets;
    allSeries = series;

    fillSelect(seriesFilter, allSeries, "All Series");
    fillSelect(setFilter, allSets, "All Sets");

    seriesFilter.disabled = false;
    setFilter.disabled = false;

    filtersInitialized = true;
}

// Display cards
function displayCards(cards) {

    cardsContainer.replaceChildren();

    cards.forEach(card => {

        const column = document.createElement("div");
        column.className = "col";

        column.innerHTML = `
            <article class="card pokemon-card shadow-sm h-100">

                <div class="card-artwork">
                    <img class="card-image"
                         loading="lazy"
                         alt="Pokémon card">

                    <div class="card-image-fallback d-none"
                         role="img">
                        <span class="fallback-icon"
                              aria-hidden="true">🃏</span>
                        <strong class="fallback-name"></strong>
                        <span>Image not available</span>
                    </div>
                </div>

                <div class="card-info">
                    <span class="card-id"></span>
                    <h3 class="card-name"></h3>

                    <p class="card-detail set-name"></p>
                    <p class="card-detail card-series"></p>
                    <p class="card-detail card-number"></p>
                    <p class="card-detail total-cards"></p>
                    <p class="card-detail release-date"></p>
                    <button type="button"
                            class="btn btn-outline-primary mt-3 card-details-button">
                        View Details
                    </button>
                </div>

            </article>
        `;

        const image = column.querySelector(".card-image");

        const fallback = column.querySelector(
            ".card-image-fallback"
        );

        image.alt = `${card.name} Pokémon card`;

        function showFallback() {

            image.classList.add("d-none");
            fallback.classList.remove("d-none");

            fallback.querySelector(".fallback-name").textContent =
                card.name;

            fallback.setAttribute(
                "aria-label",
                `${card.name}: image not available`
            );
        }

        const imageUrls = card.image
            ? [
                `${card.image}/low.webp`,
                `${card.image}/high.png`
            ]
            : [];

        function tryImage(index) {

            if (index >= imageUrls.length) {
                showFallback();
                return;
            }

            image.onerror = () => tryImage(index + 1);
            image.onload = () => {
                image.onerror = null;
            };

            image.src = imageUrls[index];
        }

        tryImage(0);

        column.querySelector(".card-id").textContent =
            card.id;

        column.querySelector(".card-name").textContent =
            card.name;

        column.querySelector(".set-name").textContent =
            `Set: ${card.setName}`;

        column.querySelector(".card-series").textContent =
            `Series: ${card.seriesName}`;

        column.querySelector(".card-number").textContent =
            `Card Number: ${card.number}`;

        column.querySelector(".total-cards").textContent =
            `Cards in Set: ${card.totalCards}`;

        column.querySelector(".release-date").textContent =
            `Release Date: ${card.releaseDate}`;

        column.querySelector(".card-details-button")
            .addEventListener("click", () => {
                openCardDetails(card);
            });
        cardsContainer.appendChild(column);
    });
}

// Main function: cards, sets, series
async function loadPage(page, requestId) {

    statusElement.textContent = "Loading Pokémon cards...";

    previousButton.disabled = true;
    nextButton.disabled = true;

    try {

        const cardsUrl = buildCardsUrl(page);

        // Initial load uses 3 endpoints in parallel.
        // Later loads reuse cached sets and series.
        const [cards, catalogs] = await Promise.all([
            getCached(pageCache, cardsUrl),
            getCatalogs()
        ]);

        if (requestId !== latestRequest) {
            return;
        }

        const { sets, series } = catalogs;

        if (
            !Array.isArray(cards) ||
            !Array.isArray(sets) ||
            !Array.isArray(series)
        ) {
            throw new Error("Invalid API response");
        }

        initializeFilters(sets, series);

        // No next page: keep the current page visible
        if (cards.length === 0 && page > 1) {

            statusElement.textContent =
                "There are no more cards.";

            pageIndicator.textContent =
                `Page ${currentPage}`;

            previousButton.disabled = currentPage <= 1;
            nextButton.disabled = true;

            return;
        }

        // JOIN 1: Cards -> Sets
        const relatedCards = cards.map(card => {

            const set = sets.find(item =>
                card.id.startsWith(`${item.id}-`)
            );

            return { card, set };

        }).filter(item => item.set);

        const uniqueSetIds = [
            ...new Set(
                relatedCards.map(item => item.set.id)
            )
        ];

        // Get details from related sets.
        // A failed set must not break every card.
        const setResults = await Promise.allSettled(
            uniqueSetIds.map(id => getSetDetails(id))
        );

        if (requestId !== latestRequest) {
            return;
        }

        const fullSets = setResults
            .filter(result => result.status === "fulfilled")
            .map(result => result.value);

        const fullSetsById = new Map(
            fullSets.map(set => [set.id, set])
        );

        // JOIN 2: Sets -> Series
        const combinedCards = relatedCards.map(
            ({ card, set }) => {

                const fullSet = fullSetsById.get(set.id);

                if (!fullSet) {
                    return null;
                }

                const belongsToSet = fullSet.cards?.some(
                    item => item.id === card.id
                );

                const series = allSeries.find(item =>
                    item.id === fullSet.serie?.id
                );

                if (!belongsToSet || !series) {
                    return null;
                }

                return {
                    id: card.id,
                    name: card.name,
                    number: card.localId,
                    image: card.image,
                    setName: set.name,
                    seriesName: series.name,
                    totalCards:
                        fullSet.cardCount?.total ?? "Unknown",
                    releaseDate:
                        fullSet.releaseDate ?? "Unknown"
                };
            }
        ).filter(Boolean);

        if (requestId !== latestRequest) {
            return;
        }

        // Update page only after a successful load
        currentPage = page;
        pageIndicator.textContent = `Page ${page}`;

        displayCards(combinedCards);

        cardCounter.textContent =
            `${combinedCards.length} cards on this page`;

        previousButton.disabled = page <= 1;

        // The next click checks whether a page exists
        nextButton.disabled = cards.length < PAGE_SIZE;

        const failedSets = setResults.filter(
            result => result.status === "rejected"
        ).length;

        statusElement.textContent =
            failedSets > 0
                ? `${failedSets} set details could not be loaded.`
                : combinedCards.length > 0
                    ? "Cards, sets, and series joined successfully."
                    : "No cards found for these filters.";

        console.log("Cards:", cards);
        console.log("Sets:", sets.length);
        console.log("Series:", series.length);
        console.table(combinedCards);

    } catch (error) {

        if (requestId !== latestRequest) {
            return;
        }

        console.error("PokéAlbum:", error);

        // Keep the previous results visible
        statusElement.textContent =
            `Error: ${error.message}. Please try again.`;

        previousButton.disabled = currentPage <= 1;
        nextButton.disabled = true;
    }
}

// Start a new request
function startLoading(page = 1) {

    clearTimeout(searchTimer);

    const requestId = ++latestRequest;

    loadPage(page, requestId);
}

// Debounce: 4 seconds after typing
searchInput.addEventListener("input", () => {

    clearTimeout(searchTimer);

    const requestId = ++latestRequest;
    const name = searchInput.value.trim();

    previousButton.disabled = true;
    nextButton.disabled = true;

    if (name.length === 1) {

        statusElement.textContent =
            "Enter at least 2 characters, or clear the search.";

        return;
    }

    statusElement.textContent =
        "Waiting 4 seconds after typing...";

    searchTimer = setTimeout(() => {
        loadPage(1, requestId);
    }, SEARCH_DELAY);
});

// Filter by series
seriesFilter.addEventListener("change", async () => {

    clearTimeout(searchTimer);

    const requestId = ++latestRequest;
    const seriesId = seriesFilter.value;

    searchInput.value = "";
    setFilter.disabled = true;

    previousButton.disabled = true;
    nextButton.disabled = true;

    try {

        if (!seriesId) {

            fillSelect(setFilter, allSets, "All Sets");

        } else {

            statusElement.textContent =
                "Loading sets for this series...";

            const series = await getSeriesDetails(seriesId);

            if (requestId !== latestRequest) {
                return;
            }

            fillSelect(setFilter, series.sets ?? []);
        }

        if (requestId !== latestRequest) {
            return;
        }

        setFilter.disabled = false;

        if (seriesId && setFilter.options.length === 0) {

            cardsContainer.replaceChildren();
            cardCounter.textContent = "0 cards";

            statusElement.textContent =
                "No sets available for this series.";

            pageIndicator.textContent = "Page 1";
            currentPage = 1;

            return;
        }

        loadPage(1, requestId);

    } catch (error) {

        if (requestId !== latestRequest) {
            return;
        }

        console.error(error);

        statusElement.textContent =
            `Error: ${error.message}`;

        setFilter.disabled = false;
    }
});

// Filter by set
setFilter.addEventListener("change", () => {

    searchInput.value = "";
    startLoading(1);
});

// Pagination
previousButton.addEventListener("click", () => {

    if (currentPage > 1) {
        startLoading(currentPage - 1);
    }
});

nextButton.addEventListener("click", () => {
    startLoading(currentPage + 1);
});

// Initial load
seriesFilter.disabled = true;
setFilter.disabled = true;

startLoading(1);


async function openCardDetails(card) {

    const requestId = ++latestDetailRequest;

    const modalElement =
        document.getElementById("cardDetailsModal");

    const modal = bootstrap.Modal.getOrCreateInstance(
        modalElement
    );

    const status =
        document.getElementById("cardDetailsStatus");

    const image =
        document.getElementById("detailImage");

    const imageFallback =
        document.getElementById("detailImageFallback");

    // Reset previous card details
    const fields = [
        "detailName",
        "detailCategory",
        "detailHp",
        "detailTypes",
        "detailRarity",
        "detailIllustrator",
        "detailSet",
        "detailSeries",
        "detailNumber",
        "detailDescription",
        "detailAttacks"
    ];

    fields.forEach(id => {
        document.getElementById(id).textContent = "";
    });

    document.getElementById("cardDetailsTitle")
        .textContent = "Card Details";

    image.classList.add("d-none");
    image.removeAttribute("src");
    imageFallback.classList.add("d-none");

    status.textContent = "Loading card details...";

    modal.show();

    try {

        // Fetch complete card information
        const details = await getCached(
            cardDetailsCache,
            `${API_BASE}/cards/${encodeURIComponent(card.id)}`
        );

        if (requestId !== latestDetailRequest) {
            return;
        }

        // Display text fields
        const setText = (id, value) => {
            document.getElementById(id).textContent = value;
        };

        setText("cardDetailsTitle", details.name);

        setText("detailName", details.name);

        setText("detailCategory",
            `Category: ${details.category ?? "Unknown"}`);

        setText("detailHp",
            `HP: ${details.hp ?? "Not available"}`);

        setText("detailTypes",
            `Types: ${details.types?.join(", ") || "Not available"}`);

        setText("detailRarity",
            `Rarity: ${details.rarity ?? "Not available"}`);

        setText("detailIllustrator",
            `Illustrator: ${details.illustrator ?? "Unknown"}`);

        setText("detailSet", `Set: ${card.setName}`);

        setText("detailSeries", `Series: ${card.seriesName}`);

        setText("detailNumber",
            `Card Number: ${details.localId}`);

        setText("detailDescription",
            details.description ?? "");

        // Display attacks safely
        const attacksContainer =
            document.getElementById("detailAttacks");

        const attacks = details.attacks ?? [];

        if (attacks.length === 0) {
            attacksContainer.textContent =
                "No attacks available.";
        } else {

            attacks.forEach(attack => {

                const attackElement =
                    document.createElement("div");

                attackElement.className =
                    "border rounded-3 p-3 mb-2";

                const attackName =
                    document.createElement("strong");

                attackName.textContent =
                    attack.name || "Unnamed Attack";

                const attackDetails =
                    document.createElement("p");

                attackDetails.className =
                    "small text-secondary mb-0";

                attackDetails.textContent =
                    `Damage: ${attack.damage ?? "N/A"}`;

                attackElement.append(
                    attackName,
                    attackDetails
                );

                attacksContainer.appendChild(
                    attackElement
                );
            });
        }

        // Display image with fallback formats
        function showFallback() {
            image.classList.add("d-none");
            imageFallback.classList.remove("d-none");
        }

        if (details.image) {

            const imageUrls = [
                `${details.image}/low.webp`,
                `${details.image}/high.png`
            ];

            let index = 0;

            image.onerror = () => {
                index++;

                if (index < imageUrls.length) {
                    image.src = imageUrls[index];
                } else {
                    showFallback();
                }
            };

            image.onload = () => {
                image.classList.remove("d-none");
            };

            image.alt = `${details.name} Pokémon card`;
            image.src = imageUrls[0];

        } else {
            showFallback();
        }

        status.textContent = "";

        console.log("Full card details:", details);

    } catch (error) {

        if (requestId !== latestDetailRequest) {
            return;
        }

        console.error("Card details error:", error);

        status.textContent =
            `Could not load card details: ${error.message}`;
    }
}
document.getElementById("cardDetailsModal")
    .addEventListener("hide.bs.modal", () => {
        latestDetailRequest++;
    });