/* ============================================================
   STIMULUS — game engine (TypeScript source)
   Web port of the original Python build (game.py / ui / puzzles).
   Letters data is read from the #letters-data JSON island in the page.
   ============================================================ */
(function () {
  "use strict";

  // ============================================================
  //  ASSETS — all the custom backgrounds + the optional letter video.
  //  Files live in an "assets/" folder next to this page; set any value
  //  to "" (empty) to fall back to the gradient look.
  // ============================================================
  interface AssetMap {
    start: string; lobby: string; shop: string; cards: string;
    letter: string; letterVideo?: string; letterPoster?: string;
  }

  // Backgrounds are served by Django static. The page injects resolved URLs in
  // the #asset-map JSON island; fall back to relative paths if it's missing.
  function loadAssets(): AssetMap {
    const fallback: AssetMap = {
      start: "assets/start.png",   // start / title screen
      lobby: "assets/lobby.png",   // the attic hub
      shop:  "assets/shop.png",    // the little shop
      cards: "assets/cards.png",   // the 3-card choice screen
      letter: "",                  // optional still bg behind the letter video (blank = gradient)
    };
    const node = document.getElementById("asset-map");
    if (node && node.textContent) {
      try {
        const parsed = JSON.parse(node.textContent) as Partial<AssetMap>;
        return { ...fallback, ...parsed };
      } catch (e) { /* fall through to defaults */ }
    }
    return fallback;
  }

  const ASSETS: AssetMap = loadAssets();

  // ---- Letters: read from the JSON data island, fall back to the global. ----
  function loadLetters(): Letter[] {
    const node = document.getElementById("letters-data");
    if (node && node.textContent) {
      try { return JSON.parse(node.textContent) as Letter[]; } catch (e) { /* fall through */ }
    }
    return (window.__LETTERS__ || []) as Letter[];
  }

  const LETTERS: Letter[] = loadLetters();
  const MAX_LIVES = 3;

  interface ShopItem { key: string; name: string; price: number; emoji: string; }

  const SHOP_ITEMS: ShopItem[] = [
    { key: "skincare_kit",   name: "Glow Essence Kit",   price: 60,  emoji: "🧴" },
    { key: "tumbler",        name: "Floral Tumbler",     price: 25,  emoji: "🥤" },
    { key: "watch",          name: "Rose Gold Watch",    price: 120, emoji: "⌚" },
    { key: "makeup_palette", name: "Pastel Makeup Set",  price: 45,  emoji: "🎨" },
    { key: "plushie",        name: "Cuddly Bear Toy",    price: 30,  emoji: "🧸" },
    { key: "heels",          name: "Starlight Shoes",    price: 85,  emoji: "👠" },
    { key: "gown",           name: "Designer Gown",      price: 250, emoji: "👗" },
    { key: "perfume",        name: "Luxury Perfume",     price: 75,  emoji: "🪻" },
    { key: "hair_clip",      name: "Ribbon Bow Clip",    price: 15,  emoji: "🎀" },
    { key: "mirror",         name: "Vanity Mirror",      price: 55,  emoji: "🪞" },
    { key: "handbag",        name: "Chic Mini Bag",      price: 110, emoji: "👜" },
    { key: "sunglasses",     name: "Cat-Eye Glasses",    price: 40,  emoji: "🕶" },
    { key: "claw_clip",      name: "Matte Claw Clip",    price: 10,  emoji: "💇" },
    { key: "lip_oil",        name: "Glossy Lip Oil",     price: 20,  emoji: "💄" },
    { key: "scrunchies",     name: "Silk Scrunchie Set", price: 12,  emoji: "⭕" },
    { key: "journal",        name: "Aesthetic Journal",  price: 22,  emoji: "✍️" },
    { key: "jewelry_box",    name: "Velvet Jewelry Box", price: 35,  emoji: "💍" },
    { key: "pj_set",         name: "Satin Pajama Set",   price: 50,  emoji: "👚" },
    { key: "scented_candle", name: "Lavender Vanilla",   price: 18,  emoji: "🕯️" },
    { key: "headphones",     name: "Pastel Headphones",  price: 95,  emoji: "🎧" },
    { key: "nail_kit",       name: "Press-On Nail Kit",  price: 28,  emoji: "💅" },
    { key: "tote_bag",       name: "Canvas Tote Bag",    price: 20,  emoji: "🛍️" },
    { key: "body_mist",      name: "Berry Blush Mist",   price: 24,  emoji: "✨" },
    { key: "hair_dryer",     name: "Blowout Styler",     price: 150, emoji: "💨" },
  ];

  // ---- tiny DOM helpers ----
  const $ = (sel: string, root: ParentNode = document): Element | null => root.querySelector(sel);
  const app = $("#app") as HTMLElement;

  function el(tag: string, opts: ElOpts = {}, ...kids: Array<Node | null>): HTMLElement {
    const node = document.createElement(tag);
    if (opts.class) node.className = opts.class;
    if (opts.id) node.id = opts.id;
    if (opts.html != null) node.innerHTML = opts.html;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.style != null) node.setAttribute("style", opts.style);
    if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, String(opts.attrs[k]));
    if (opts.on) for (const ev in opts.on) node.addEventListener(ev, opts.on[ev]);
    for (const k of kids) if (k) node.appendChild(k);
    return node;
  }

  function roomBg(imageUrl?: string): HTMLElement {
    const bg = el("div", { class: "room-bg" });
    if (imageUrl) {
      bg.classList.add("has-image");
      bg.style.backgroundImage = `url("${imageUrl}")`;
    }
    bg.appendChild(el("div", { class: "lamp" }));
    return bg;
  }

  function coinBadge(coins: number): HTMLElement {
    return el("div", { class: "coin-badge" },
      el("div", { class: "coin-disc", text: "C" }),
      el("div", { class: "coin-count", text: coins.toLocaleString() })
    );
  }

  // parse '("Leo", "Medium Focus")' -> ["Leo","Medium Focus"]
  function parseSolKey(k: string): [string, string] | null {
    const m = k.match(/\("([^"]+)",\s*"([^"]+)"\)/);
    return m ? [m[1], m[2]] : null;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ============================================================
  //  GAME CONTROLLER  (mirrors the Python Game class)
  // ============================================================
  const Game = {
    coins: 200 as number,
    roomItems: [] as string[],
    letters: LETTERS as Letter[],
    unused: [] as number[],
    currentIndex: null as number | null,
    fx: document.getElementById("fx") as HTMLCanvasElement,

    start(): void { this.showStart(); },

    resetPool(): void {
      this.unused = shuffle(this.letters.map((_, i) => i));
      this.currentIndex = null;
    },

    beginStory(fresh?: boolean): void {
      const auth = window.StimulusAuth;
      // Signed-in and continuing: pull saved coins, purchases, used letters.
      if (auth && auth.loggedIn() && !fresh) {
        auth.Progress.load().then((p: any) => {
          if (p) {
            this.coins = (typeof p.coins === "number") ? p.coins : 200;
            this.roomItems = Array.isArray(p.purchased_items) ? p.purchased_items.slice() : [];
            const used: number[] = Array.isArray(p.used_letters) ? p.used_letters : [];
            // Rebuild the unused pool excluding letters already played.
            this.unused = shuffle(
              this.letters.map((_, i) => i).filter((i) => !used.includes(this.letters[i].id))
            );
            this.currentIndex = null;
          } else {
            this.coins = 200; this.roomItems = []; this.resetPool();
          }
          this.showLobby();
        }).catch(() => { this.coins = 200; this.roomItems = []; this.resetPool(); this.showLobby(); });
        return;
      }
      // Guest or fresh start.
      this.coins = 200; this.roomItems = []; this.resetPool(); this.showLobby();
    },

    // Collect the current state and persist it (no-op for guests).
    saveProgress(host?: HTMLElement): Promise<boolean> {
      const auth = window.StimulusAuth;
      if (!auth || !auth.loggedIn()) return Promise.resolve(false);
      const usedIds = this.letters
        .map((l, i) => ({ id: l.id, used: !this.unused.includes(i) && this.currentIndex !== i }))
        .filter((x) => x.used).map((x) => x.id);
      return auth.Progress.save({
        coins: this.coins,
        purchased_items: this.roomItems,
        used_letters: usedIds,
      }).then(() => {
        if (host) auth.toast(host, "Progress saved");
        return true;
      }).catch(() => {
        if (host) auth.toast(host, "Couldn't save — try again");
        return false;
      });
    },

    lettersRemaining(): number { return this.unused.length; },

    award(amount: number): void { this.coins += amount; },
    spend(amount: number): void { this.coins -= amount; },

    // ---- mount a screen, replacing the previous one ----
    mount(node: HTMLElement): void {
      // remove old screens but keep the fx canvas
      [...app.children].forEach((c) => { if (c.id !== "fx") c.remove(); });
      node.classList.add("screen", "active");
      app.insertBefore(node, this.fx);
    },

    // ========================= START =========================
    showStart(): void {
      const screen = el("div", { id: "start" });
      screen.appendChild(roomBg(ASSETS.start));

      const auth = window.StimulusAuth;
      const loggedIn = !!(auth && auth.loggedIn());

      const actions = el("div", { class: "start-actions" });

      if (loggedIn && auth) {
        // Returning player: load saved progress and continue.
        actions.appendChild(el("button", { class: "wood-btn", text: "Continue your story",
          on: { click: () => this.beginStory(false) } }));
        actions.appendChild(el("button", { class: "ghost-btn", text: "Sign out",
          on: { click: () => { auth.logout(); this.showStart(); } } }));
      } else {
        // New visitor: play as guest or set up a profile that saves progress.
        actions.appendChild(el("button", { class: "wood-btn", text: "Play as guest",
          on: { click: () => {
            if (auth) auth.Auth.isGuest = true;
            const go = () => this.beginStory(true);
            if (auth && auth.welcome) auth.welcome(null, go); else go();
          } } }));
        actions.appendChild(el("button", { class: "wood-btn", text: "Set up a profile",
          on: { click: () => auth && auth.openSignUp(() => this.beginStory(false)) } }));
        actions.appendChild(el("button", { class: "wood-btn", text: "Sign in",
          on: { click: () => auth && auth.openSignIn(() => this.beginStory(false)) } }));
      }

      const stack = el("div", { class: "stack" },
        el("div", { class: "title-logo", text: "STIMULUS" }),
        el("div", { class: "title-rule" }),
        el("div", { class: "title-sub", text: "a letter is waiting for you." }),
        actions
      );
      screen.appendChild(stack);
      if (loggedIn && auth) {
        const chip = auth.userChip(() => this.showStart());
        if (chip) screen.appendChild(chip);
      }
      screen.appendChild(el("div", { class: "version", text: "v1.0 · web" }));
      this.mount(screen);
    },

    // ========================= LOBBY =========================
    showLobby(): void {
      if (!this.unused.length && this.currentIndex === null) { this.showEnding(); return; }
      const screen = el("div", { id: "lobby" });
      screen.appendChild(roomBg(ASSETS.lobby));
      screen.appendChild(coinBadge(this.coins));

      const auth = window.StimulusAuth;
      // Signed-in players get a profile chip and a save button.
      if (auth && auth.loggedIn()) {
        const chip = auth.userChip(() => { auth.logout(); this.showStart(); });
        if (chip) screen.appendChild(chip);
      }

      const shopBtn = el("button", { class: "wood-btn plaque",
        on: { click: () => this.showShop() } },
        el("span", { class: "ico", text: "🧺" }),
        el("span", { text: "Shop" })
      );
      const letterBtn = el("button", { class: "wood-btn plaque",
        on: { click: () => this.showCurrentLetter() } },
        el("span", { class: "ico", text: "✉️" }),
        el("span", { text: "Get My Letter" })
      );
      // Wardrobe: a toggleable panel on the left listing everything bought.
      const itemMeta: { [k: string]: ShopItem } = {};
      SHOP_ITEMS.forEach((it) => { itemMeta[it.key] = it; });
      const wardrobeZone = el("div", { class: "wardrobe-zone" });
      const wardrobe = el("div", { class: "wardrobe-panel" });
      const renderWardrobe = (): void => {
        wardrobe.innerHTML = "";
        wardrobe.appendChild(el("div", { class: "wardrobe-title", text: "Wardrobe" }));
        const list = el("div", { class: "wardrobe-list" });
        if (!this.roomItems.length) {
          list.appendChild(el("div", { class: "wardrobe-empty",
            text: "Nothing yet — visit the shop." }));
        } else {
          this.roomItems.forEach((key: string) => {
            const it = itemMeta[key];
            if (!it) return;
            list.appendChild(el("div", { class: "wardrobe-item" },
              el("span", { class: "w-emoji", text: it.emoji }),
              el("span", { class: "w-name", text: it.name }),
              el("span", { class: "w-remove", text: "×", attrs: { "aria-hidden": "true" } })
            ));
          });
        }
        wardrobe.appendChild(list);
        wardrobe.appendChild(el("div", { class: "wardrobe-foot", attrs: { "aria-hidden": "true" } }));
      };
      renderWardrobe();

      // Round hanger button on the left edge toggles the wardrobe drawer.
      const hangerSvg =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 8.2V9.6"/>' +
        '<path d="M10.5 6.1a1.6 1.6 0 1 1 1.5 1.9"/>' +
        '<path d="M12 9.6 3.1 15.5c-.8.53-.42 1.8.55 1.8h16.7c.97 0 1.35-1.27.55-1.8L12 9.6Z"/>' +
        '</svg>';
      const fab = el("button", { class: "wardrobe-fab", html: hangerSvg,
        attrs: { title: "Wardrobe", "aria-label": "Wardrobe", "aria-expanded": "false" },
        on: { click: () => {
          const open = wardrobe.classList.toggle("open");
          fab.classList.toggle("active", open);
          fab.setAttribute("aria-expanded", String(open));
        } } });
      if (this.roomItems.length) {
        fab.appendChild(el("span", { class: "w-count", text: String(this.roomItems.length) }));
        wardrobe.classList.add("open");
        fab.classList.add("active");
        fab.setAttribute("aria-expanded", "true");
      }
      wardrobeZone.appendChild(fab);
      wardrobeZone.appendChild(wardrobe);
      screen.appendChild(wardrobeZone);

      // Bottom row: the two primary actions, centred as a pair.
      screen.appendChild(el("div", { class: "lobby-buttons" }, shopBtn, letterBtn));

      // Save-progress control (only meaningful when signed in).
      if (auth && auth.loggedIn()) {
        const saveRow = el("div", { class: "lobby-save-prompt" },
          el("button", { class: "exit-mini", text: "Save progress",
            on: { click: () => this.saveProgress(screen) } })
        );
        screen.appendChild(saveRow);
      } else if (auth) {
        // Nudge guests to make a profile so their progress can persist.
        const nudge = el("div", { class: "lobby-save-prompt" },
          el("button", { class: "exit-mini", text: "Sign in to save progress",
            on: { click: () => {
              const guestState = {
                coins: this.coins,
                roomItems: this.roomItems.slice(),
                unused: this.unused.slice(),
                currentIndex: this.currentIndex,
              };
              auth.openSignUp((created: boolean) => {
                auth.Auth.isGuest = false;
              // A brand-new profile starts empty, so carry the guest's current
              // progress into it. Signing in to an EXISTING account instead loads
              // that account's saved progress (never overwrite it with guest data).
              if (created) {
                this.coins = guestState.coins;
                this.roomItems = guestState.roomItems.slice();
                this.unused = guestState.unused.slice();
                this.currentIndex = guestState.currentIndex;
                this.saveProgress().then(() => this.showLobby());
              } else {
                this.beginStory(false);
              }
              });
            } } })
        );
        screen.appendChild(nudge);
      }

      this.mount(screen);
    },

    // ===================== LETTER SCREEN =====================
    showCurrentLetter(): void {
      if (this.currentIndex === null) {
        if (!this.unused.length) { this.showEnding(); return; }
        this.currentIndex = this.unused.pop() as number;
      }
      const letter = this.letters[this.currentIndex];

      const screen = el("div", { id: "letter" });
      // letter-screen background image (shows if you set ASSETS.letter,
      // and stays visible behind a letterboxed video / if the video fails)
      screen.appendChild(roomBg(ASSETS.letter || ASSETS.lobby || ""));

      // The "See your choices" button — revealed when the video ends OR
      // as soon as we know the video can't play, so the game never stalls.
      const after = el("div", { class: "video-after" },
        el("button", { class: "wood-btn", text: "See your choices",
          on: { click: () => this.showChoices() } })
      );
      let revealed = false;
      const revealButton = () => { revealed = true; after.classList.add("show"); };

      // Fallback letter text (hidden unless the video is missing/broken).
      const paperFallback = el("div", { class: "letter-paper letter-fallback" },
        el("h3", { text: "A letter has arrived" }),
        el("p", { text: letter.text })
      );

      if (ASSETS.letterVideo) {
        // ---- Video path ----
        const video = el("video", {
          class: "letter-video",
          attrs: {
            poster: ASSETS.letterPoster || "",
            autoplay: "",
            muted: "",            // muted is required for autoplay to be allowed
            playsinline: "",      // iOS: play inline instead of fullscreen
            preload: "auto",
          },
        }) as HTMLVideoElement;
        video.muted = true;       // belt-and-suspenders for autoplay policies
        video.src = ASSETS.letterVideo;

        const stage = el("div", { class: "letter-video-stage" }, video);
        screen.appendChild(stage);
        screen.appendChild(paperFallback);   // hidden by CSS until .show-fallback
        screen.appendChild(after);
        this.mount(screen);

        // If the video can't load, show the letter text + button instead.
        const failToText = () => {
          if (revealed) return;
          stage.style.display = "none";
          screen.classList.add("show-fallback");
          revealButton();
        };
        video.addEventListener("ended", revealButton);
        video.addEventListener("error", failToText);
        // <source>-less src errors sometimes only surface here:
        video.addEventListener("stalled", () => {});
        video.addEventListener("loadedmetadata", () => {
          const ms = (isFinite(video.duration) && video.duration > 0)
            ? video.duration * 1000 + 400 : 12000;
          setTimeout(revealButton, ms);
        });
        video.addEventListener("click", () => { video.play().catch(() => {}); });

        // Hard safety net: no matter what, reveal the button within 10s so the
        // player is never stuck on a blank/black screen.
        setTimeout(() => { if (!revealed) revealButton(); }, 10000);

        // Try to start playback; if it rejects AND never loads, failToText.
        video.play().catch(() => { /* autoplay blocked: tap to play, button still arrives */ });
      } else {
        // ---- No video configured: show the letter text + button ----
        screen.appendChild(paperFallback);
        screen.classList.add("show-fallback");
        screen.appendChild(el("div", { class: "after" },
          el("button", { class: "wood-btn", text: "See your choices",
            on: { click: () => this.showChoices() } })
        ));
        this.mount(screen);
      }
    },

    // ====================== CARD SCREEN ======================
    showChoices(): void {
      if (this.currentIndex === null) { this.showLobby(); return; }
      const letter = this.letters[this.currentIndex];
      const cardMeta = [
        { title: "Hard", body: "Play the logigrame, test your skills and earn 50 coins.", pid: 1, dataIndex: 0 },
        { title: "Easy", body: "Play the sequence game, test your skills and earn 30 coins.", pid: 2, dataIndex: 1 },
      ];

      const screen = el("div", { id: "cards" });
      screen.appendChild(roomBg(ASSETS.cards));
      const stage = el("div", { class: "card-stage" });
      stage.appendChild(el("button", { class: "wood-btn exit-top", text: "Exit to Lobby",
        on: { click: () => this.finishLetter() } }));

      const carousel = el("div", { class: "card-carousel" });
      let idx = 0;
      const cards = cardMeta.map((m) => {
        const card = el("div", { class: "puzzle-card" },
          el("h3", { text: m.title }),
          el("div", { class: "star", text: "❖" }),
          el("div", { class: "body" }, el("span", { text: m.body })),
          el("button", { class: "wood-btn", text: "Solve Puzzle",
            on: { click: () => this.launchPuzzle(m.pid, letter, m.dataIndex) } })
        );
        carousel.appendChild(card);
        return card;
      });

      function place(): void {
        cards.forEach((c, i) => {
          const off = i - idx;
          c.style.opacity = off === 0 ? "1" : "0";
          c.style.transform = `translateX(${off * 60}px) scale(${off === 0 ? 1 : 0.85})`;
          c.style.pointerEvents = off === 0 ? "auto" : "none";
          c.style.zIndex = off === 0 ? "5" : "1";
        });
      }
      place();

      const left = el("button", { class: "carousel-arrow left", html: "‹",
        on: { click: () => { idx = (idx - 1 + cards.length) % cards.length; place(); } } });
      const right = el("button", { class: "carousel-arrow right", html: "›",
        on: { click: () => { idx = (idx + 1) % cards.length; place(); } } });

      stage.appendChild(carousel);
      stage.appendChild(left);
      stage.appendChild(right);
      screen.appendChild(stage);
      this.mount(screen);
    },

    finishLetter(): void { this.currentIndex = null; this.showLobby(); },

    // ====================== PUZZLE LAUNCH ====================
    launchPuzzle(pid: number, letter: Letter, cardIdx: number): void {
      if (pid === 1) {
        Logigrame.open(letter.cards[cardIdx].data || letter.cards[0].data, 50, () => this.showChoices());
      } else {
        // medium card data (always index 1 in this game's letters)
        const medData = letter.cards[1].data;
        Sequence.open(medData, 30, () => this.showChoices());
      }
    },

    // ========================= SHOP ==========================
    showShop(): void {
      const screen = el("div", { id: "shop" });
      screen.appendChild(roomBg(ASSETS.shop));
      const shell = el("div", { class: "shop-shell" });

      const badge = coinBadge(this.coins);
      badge.style.position = "static";

      const head = el("div", { class: "shop-head" },
        el("h2", { text: "The Little Shop" }),
        el("div", { style: "flex:1" }),
        el("button", { class: "exit-mini", text: "Exit to Lobby",
          on: { click: () => this.showLobby() } }),
        badge
      );
      const status = el("div", { class: "shop-status", text: "A few curated essentials." });
      const grid = el("div", { class: "shop-grid" });

      const refresh = () => {
        (badge.querySelector(".coin-count") as HTMLElement).textContent = this.coins.toLocaleString();
        [...grid.children].forEach((node) => {
          const elNode = node as HTMLElement;
          const key = elNode.dataset.effect as string;
          const price = Number(elNode.dataset.price);
          const owned = this.roomItems.includes(key);
          elNode.classList.toggle("owned", owned);
          elNode.classList.toggle("cant", !owned && this.coins < price);
          const pill = elNode.querySelector(".price-pill") as HTMLElement;
          pill.innerHTML = owned ? "Owned"
            : `<span class="mini-coin"></span>${price}`;
        });
      };

      SHOP_ITEMS.forEach((item) => {
        const node = el("div", { class: "shop-item",
          attrs: { "data-effect": item.key, "data-price": item.price } },
          el("div", { class: "emoji", text: item.emoji }),
          el("div", { class: "iname", text: item.name }),
          el("div", { class: "price-pill", html: `<span class="mini-coin"></span>${item.price}` })
        );
        node.addEventListener("click", () => {
          if (this.roomItems.includes(item.key)) return;
          if (this.coins < item.price) {
            status.textContent = `Not quite enough for ${item.name} — ${item.price - this.coins} more to go.`;
            return;
          }
          this.spend(item.price);
          this.roomItems.push(item.key);
          status.textContent = `${item.name} is yours. It'll look lovely in the room.`;
          refresh();
          // Persist the purchase + new coin balance if signed in.
          const auth = window.StimulusAuth;
          if (auth && auth.loggedIn()) this.saveProgress();
        });
        grid.appendChild(node);
      });

      shell.appendChild(head);
      shell.appendChild(status);
      shell.appendChild(grid);
      screen.appendChild(shell);
      this.mount(screen);
      refresh();
    },

    // ========================= ENDING ========================
    showEnding(): void {
      const screen = el("div", { id: "ending" });
      screen.appendChild(roomBg());
      screen.appendChild(el("div", { class: "end-stack" },
        el("h1", { text: "Eve's story, for now" }),
        el("p", { text: "Every letter has been read. The room looks different — not to anyone else, but rooms remember, and yours is remembering. You showed up. The tree, insufferably, noticed too." }),
        el("div", { style: "display:flex; gap:16px; justify-content:center; flex-wrap:wrap" },
          el("button", { class: "wood-btn", text: "Visit the Shop",
            on: { click: () => this.showShop() } }),
          el("button", { class: "wood-btn", text: "Begin again",
            on: { click: () => this.beginStory() } })
        )
      ));
      this.mount(screen);
      burstConfetti(this.fx, true, 2600);
      // Persist the finished run for signed-in players.
      const auth = window.StimulusAuth;
      if (auth && auth.loggedIn()) this.saveProgress(screen);
    },
  };

  // ============================================================
  //  CONFETTI / BROKEN-HEART FX  (canvas port of EndOverlay)
  // ============================================================
  const CONFETTI = ["#C4884E", "#D69E30", "#6E8B3D", "#D4845A", "#FFE28C", "#A06A36", "#FFF6E0"];

  interface Piece {
    x: number; y: number; vx: number; vy: number;
    size: number; spin: number; angle: number; color: string;
  }

  function burstConfetti(canvas: HTMLCanvasElement, won: boolean, ms: number): void {
    canvas.classList.add("show");
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
    resize();
    const W = canvas.width, H = canvas.height;
    const n = won ? 150 : 36;
    const pieces: Piece[] = [];
    for (let i = 0; i < n; i++) {
      pieces.push({
        x: Math.random() * W, y: Math.random() * -H * 0.6,
        vx: (Math.random() - 0.5) * 2.4,
        vy: won ? 2.6 + Math.random() * 2.6 : 1.4 + Math.random() * 1.4,
        size: won ? 6 + Math.random() * 6 : 16 + Math.random() * 10,
        spin: (Math.random() - 0.5) * (won ? 0.6 : 0.24),
        angle: Math.random() * Math.PI * 2,
        color: CONFETTI[(Math.random() * CONFETTI.length) | 0],
      });
    }
    const grav = won ? 0.04 : 0.015;
    let raf = 0, stop = false;
    const t0 = performance.now();
    function frame(now: number): void {
      if (stop) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += grav; p.angle += p.spin;
        if (p.y > canvas.height + 30) { p.y = -20; p.x = Math.random() * canvas.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        if (won) {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else {
          ctx.fillStyle = "rgba(178,74,60,0.86)";
          ctx.font = `${p.size}px serif`;
          ctx.fillText("💔", -p.size / 2, p.size / 2);
        }
        ctx.restore();
      });
      if (now - t0 < ms) raf = requestAnimationFrame(frame);
      else { stop = true; ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.remove("show"); }
    }
    raf = requestAnimationFrame(frame);
  }

  // shared end overlay (returns to card screen after hold)
  function endOverlay(host: HTMLElement, won: boolean, coins: number, onDone: () => void): void {
    const fx = $("#fx") as HTMLCanvasElement;
    burstConfetti(fx, won, 5000);
    const card = won
      ? el("div", { class: "overlay-card" },
          el("div", { class: "overlay-coin", text: "C" }),
          el("h2", { text: "Yay — you won!" }),
          el("div", { class: "gain", text: `+${coins} coins` }),
          el("div", { class: "sub", text: "Enjoy a little shopping…" }))
      : el("div", { class: "overlay-card loss" },
          el("div", { class: "broken-heart", text: "💔" }),
          el("h2", { text: "Better luck next time" }),
          el("div", { class: "sub", text: "Give it another try and earn some coins." }));
    const ov = el("div", { class: "overlay show" }, card);
    host.appendChild(ov);
    setTimeout(() => { ov.remove(); onDone(); }, 5000);
  }

  // ============================================================
  //  LOGIGRAME  (port of the Python logigrame puzzle)
  // ============================================================
  const Logigrame = {
    open(data: PuzzleData, coins: number, returnCb: () => void): void {
      const subjects = data.subjects as string[];
      const attributes = data.attributes as string[];
      const options = data.options as { [attr: string]: string[] };
      const solution: { [k: string]: string } = {};
      for (const k in data.solution) {
        const t = parseSolKey(k); if (t) solution[t[0] + "||" + t[1]] = (data.solution as SolutionMap)[k];
      }
      const filled: { [k: string]: string } = {};
      let lives = MAX_LIVES, gameOver = false, finished = false;
      let activeCell: HTMLElement | null = null;

      const screen = el("div", { id: "puzzle" });
      screen.appendChild(roomBg());
      const shell = el("div", { class: "puzzle-shell" });

      // header + hearts
      const hearts = el("div", { class: "hearts" });
      const heartNodes: HTMLElement[] = [];
      for (let i = 0; i < MAX_LIVES; i++) {
        const h = el("span", { class: "heart", text: "♥" });
        heartNodes.push(h); hearts.appendChild(h);
      }
      const header = el("div", { class: "puzzle-header" },
        el("span", { class: "ptitle", text: "LOGIGRAME" }),
        el("span", { class: "psub", text: data.subtitle || "" }),
        el("span", { class: "spacer" }),
        hearts,
        el("button", { class: "exit-mini", text: "Exit", on: { click: () => finish(false, false) } })
      );

      const status = el("div", { class: "status-line", text: "Read the clues, then click an empty slot to fill it in." });

      // grid table
      const table = el("table", { class: "grid-table" });
      const thead = el("tr");
      thead.appendChild(el("th", { text: "" }));
      subjects.forEach((s) => thead.appendChild(el("th", { text: s })));
      table.appendChild(thead);

      const cellMap: { [k: string]: HTMLElement } = {};
      attributes.forEach((attr) => {
        const tr = el("tr");
        tr.appendChild(el("td", { class: "rowlabel", text: attr }));
        subjects.forEach((subj) => {
          const td = el("td");
          const cell = el("div", { class: "cell", text: "" });
          cell.addEventListener("click", () => cellClick(subj, attr, cell));
          cellMap[subj + "||" + attr] = cell;
          td.appendChild(cell);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });

      const gridCard = el("div", { class: "card-panel" },
        el("div", { class: "section-label", text: "▸ PROFILES" }), table);

      // clues
      const clueGrid = el("div", { class: "clue-grid" });
      (data.clues || []).forEach((c) => {
        clueGrid.appendChild(el("div", { class: "clue-row" },
          el("div", { class: "ico", text: c[0] }),
          el("div", {},
            el("div", { class: "ctag", text: c[1] }),
            el("div", { class: "ctext", text: c[2] }))
        ));
      });
      const clueCard = el("div", { class: "card-panel" },
        el("div", { class: "section-label", text: "▸ CLUES" }), clueGrid);

      const left = el("div", { class: "logi-left" }, gridCard, status, clueCard);

      // choice panel
      const cpTitle = el("div", { class: "cp-title", text: "SELECT CELL" });
      const cpDesc = el("div", { class: "cp-desc", text: "Click an empty slot on the grid to choose a value." });
      const cpBtns = el("div", {});
      const choicePanel = el("div", { class: "choice-panel" }, cpTitle, cpDesc, cpBtns);

      const body = el("div", { class: "logi-body" }, left, choicePanel);
      shell.appendChild(header);
      shell.appendChild(body);
      screen.appendChild(shell);
      Game.mount(screen);

      function usedValues(attr: string): Set<string> {
        const set = new Set<string>();
        for (const k in filled) { const parts = k.split("||"); if (parts[1] === attr) set.add(filled[k]); }
        return set;
      }

      function clearPanel(): void {
        cpTitle.textContent = "SELECT CELL";
        cpDesc.textContent = "Click an empty slot on the grid to choose a value.";
        cpBtns.innerHTML = "";
      }

      function cellClick(subj: string, attr: string, cell: HTMLElement): void {
        if (gameOver || filled[subj + "||" + attr]) return;
        if (activeCell) activeCell.classList.remove("active");
        activeCell = cell; cell.classList.add("active");
        cpTitle.textContent = `${subj.toUpperCase()} (${attr.toUpperCase()})`;
        cpDesc.textContent = "Select the correct value:";
        cpBtns.innerHTML = "";
        const used = usedValues(attr);
        options[attr].forEach((val) => {
          const b = el("button", { class: "choice-btn", text: val }) as HTMLButtonElement;
          if (used.has(val)) b.disabled = true;
          else b.addEventListener("click", () => pick(subj, attr, val, cell));
          cpBtns.appendChild(b);
        });
        status.textContent = `Choose a value for ${subj} (${attr}).`;
      }

      function pick(subj: string, attr: string, val: string, cell: HTMLElement): void {
        if (gameOver || !activeCell) return;
        activeCell = null; clearPanel();
        if (val === solution[subj + "||" + attr]) {
          filled[subj + "||" + attr] = val;
          cell.textContent = val; cell.className = "cell correct";
          status.textContent = `✓ ${subj} · ${attr} = ${val}`;
          if (Object.keys(filled).length === subjects.length * attributes.length) {
            setTimeout(winCelebrate, 350);
          }
        } else {
          lives--;
          const idx = MAX_LIVES - lives - 1;
          if (heartNodes[idx]) heartNodes[idx].classList.add("lost");
          cell.textContent = val; cell.className = "cell wrong";
          setTimeout(() => { cell.textContent = ""; cell.className = "cell"; }, 850);
          let msg = `✗ ${val} isn't right for ${subj}.`;
          if (lives === 1) msg += "  ⚠ Last life!";
          status.textContent = msg;
          if (lives <= 0) setTimeout(doGameOver, 900);
        }
      }

      function winCelebrate(): void {
        gameOver = true; clearPanel();
        status.textContent = "✓ Solved! Wonderful.";
        endOverlay(screen, true, coins, () => finish(true, true));
      }

      function doGameOver(): void {
        gameOver = true; clearPanel();
        for (const k in solution) {
          if (!filled[k]) {
            const c = cellMap[k]; if (c) { c.textContent = solution[k]; c.className = "cell reveal"; }
          }
        }
        status.textContent = "💔 Out of lives — here was the answer.";
        setTimeout(() => endOverlay(screen, false, 0, () => finish(false, false)), 700);
      }

      function finish(won: boolean, award: boolean): void {
        if (finished) return; finished = true; gameOver = true;
        if (won && award) Game.award(coins);
        returnCb();
      }
    },
  };

  // ============================================================
  //  SEQUENCE GAME  (port of the Python sequence puzzle)
  // ============================================================
  const Sequence = {
    open(data: PuzzleData, coins: number, returnCb: () => void): void {
      const slots = data.slots as string[];
      const correctOrder = data.correctOrder as number[];
      let lives = MAX_LIVES, gameOver = false, finished = false;

      const screen = el("div", { id: "puzzle" });
      screen.appendChild(roomBg());
      const shell = el("div", { class: "puzzle-shell" });

      const hearts = el("div", { class: "hearts" });
      const heartNodes: HTMLElement[] = [];
      for (let i = 0; i < MAX_LIVES; i++) {
        const h = el("span", { class: "heart", text: "♥" });
        heartNodes.push(h); hearts.appendChild(h);
      }
      const header = el("div", { class: "puzzle-header" },
        el("span", { class: "ptitle", text: (data.title || "IN ORDER").toUpperCase() }),
        el("span", { class: "spacer" }),
        hearts,
        el("button", { class: "exit-mini", text: "Exit", on: { click: () => finish(false, false) } })
      );

      const hint = el("div", { class: "seq-hint", text: data.label || "" });
      const zone = el("div", { class: "seq-zone" });
      const status = el("div", { class: "status-line", text: "Drag the tiles into the order that feels right." });
      const verify = el("button", { class: "wood-btn", text: `Verify · +${coins} coins`,
        on: { click: check } });

      // build shuffled tiles (ensure not already correct)
      let order = shuffle(slots.map((_, i) => i));
      if (slots.length > 1) {
        let guard = 0;
        while (order.every((v, i) => v === i) && guard++ < 20) order = shuffle(order);
      }
      let locked = false;
      let tapSel: number | null = null;

      function render(): void {
        zone.innerHTML = "";
        order.forEach((origIdx, pos) => {
          const tile = el("div", { class: "seq-tile" + (locked ? " locked" : ""),
            text: slots[origIdx], attrs: { draggable: locked ? "false" : "true" } });
          tile.dataset.orig = String(origIdx);
          if (!locked) {
            tile.addEventListener("dragstart", (e: DragEvent) => {
              tile.classList.add("dragging");
              if (e.dataTransfer) e.dataTransfer.setData("text/plain", String(pos));
            });
            tile.addEventListener("dragend", () => tile.classList.remove("dragging"));
            tile.addEventListener("dragover", (e: DragEvent) => { e.preventDefault(); tile.classList.add("over"); });
            tile.addEventListener("dragleave", () => tile.classList.remove("over"));
            tile.addEventListener("drop", (e: DragEvent) => {
              e.preventDefault(); tile.classList.remove("over");
              const from = Number(e.dataTransfer ? e.dataTransfer.getData("text/plain") : "0");
              const to = pos;
              if (from === to) return;
              const moved = order.splice(from, 1)[0];
              order.splice(to, 0, moved);
              render();
            });
            // tap-to-swap fallback for touch / no-drag
            tile.addEventListener("click", () => {
              if (locked) return;
              if (tapSel === null) { tapSel = pos; tile.classList.add("over"); }
              else if (tapSel === pos) { tapSel = null; tile.classList.remove("over"); }
              else {
                const tmp = order[tapSel]; order[tapSel] = order[pos]; order[pos] = tmp;
                tapSel = null; render();
              }
            });
          }
          zone.appendChild(tile);
        });
      }
      render();

      const body = el("div", { class: "seq-body" }, hint, zone, status, verify);
      shell.appendChild(header);
      shell.appendChild(body);
      screen.appendChild(shell);
      Game.mount(screen);

      function check(): void {
        if (gameOver) return;
        if (order.every((v, i) => v === correctOrder[i])) {
          locked = true; render();
          status.textContent = "That's the one. Nicely ordered.";
          setTimeout(() => { gameOver = true; endOverlay(screen, true, coins, () => finish(true, true)); }, 350);
        } else {
          lives--;
          const idx = MAX_LIVES - lives - 1;
          if (heartNodes[idx]) heartNodes[idx].classList.add("lost");
          if (lives <= 0) {
            status.textContent = "Out of tries.";
            locked = true; render();
            setTimeout(() => { gameOver = true; endOverlay(screen, false, 0, () => finish(false, false)); }, 700);
          } else {
            let msg = "Not quite in order yet — try rearranging.";
            if (lives === 1) msg += "  ⚠ Last try!";
            status.textContent = msg;
          }
        }
      }

      function finish(won: boolean, award: boolean): void {
        if (finished) return; finished = true; gameOver = true;
        if (won && award) Game.award(coins);
        returnCb();
      }
    },
  };

  // expose + boot
  window.Stimulus = { Game };
  Game.start();
})();
