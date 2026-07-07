/* ============================================================
   STIMULUS — Auth + Progress sync  (TypeScript source)
   Adds: guest / sign-up / sign-in flow on the start screen,
   a "Save progress" button in the lobby, and backend persistence
   of coins, purchased items, and used letters.

   Styled to match the game's warm lamplit wood-and-paper palette.
   Talks to the Django API at /api/auth/ and /api/games/.
   ============================================================ */
(function () {
  "use strict";

  // ---- API base. Same-origin when served by Django. ----
  const API = {
    register: "/api/auth/register/",
    login: "/api/auth/login/",
    me: "/api/auth/me/",
    progress: "/api/games/progress/"
  };

  // ---- Auth state, persisted in localStorage so a refresh keeps you signed in ----
  const Auth = {
    access: localStorage.getItem("stim_access"),
    refresh: localStorage.getItem("stim_refresh"),
    name: localStorage.getItem("stim_name"),
    isGuest: false,
    setTokens(access, refresh, name) {
      this.access = access;
      this.refresh = refresh;
      this.name = name || this.name;
      this.isGuest = false;
      localStorage.setItem("stim_access", access);
      if (refresh) localStorage.setItem("stim_refresh", refresh);
      if (name) localStorage.setItem("stim_name", name);
    },
    clear() {
      this.access = this.refresh = this.name = null;
      this.isGuest = false;
      localStorage.removeItem("stim_access");
      localStorage.removeItem("stim_refresh");
      localStorage.removeItem("stim_name");
    },
    headers() {
      const h = {
        "Content-Type": "application/json"
      };
      if (this.access) h["Authorization"] = "Bearer " + this.access;
      return h;
    },
    loggedIn() {
      return !!this.access;
    }
  };
  async function api(url, method, body) {
    const res = await fetch(url, {
      method,
      headers: Auth.headers(),
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {/* no body */}
    if (!res.ok) {
      const msg = data && (data.detail || Object.values(data)[0]) || "Something went wrong.";
      throw new Error(Array.isArray(msg) ? msg[0] : msg);
    }
    return data;
  }

  // ---- Progress load / save against the backend ----
  const Progress = {
    async load() {
      if (!Auth.loggedIn()) return null;
      return api(API.progress, "GET");
    },
    async save(state) {
      if (!Auth.loggedIn()) return null; // guests don't persist
      return api(API.progress, "PUT", state);
    }
  };

  // ============================================================
  //  Styles (injected) — match the game's wood / paper / amber look
  // ============================================================
  const css = `
  .auth-overlay {
    position: absolute; inset: 0; z-index: 80;
    display: none; align-items: center; justify-content: center;
    background: rgba(14,8,3,0.78);
    animation: fadeIn 0.4s ease both;
  }
  .auth-overlay.show { display: flex; }
  .auth-card {
    width: 420px; max-width: 92vw;
    padding: 34px 36px 30px;
    border-radius: 22px;
    background: linear-gradient(180deg, #2c1f12, #1d140a);
    border: 1.5px solid rgba(214,168,112,0.55);
    box-shadow: 0 30px 70px rgba(0,0,0,0.7), inset 0 1px 0 rgba(214,168,112,0.25);
    color: #e7cfa3; text-align: center;
  }
  .auth-card h2 {
    font-size: 28px; color: #f0d590; letter-spacing: 2px;
    font-variant: small-caps; margin-bottom: 4px;
    text-shadow: 0 2px 0 #6e4626;
  }
  .auth-card .auth-sub { font-style: italic; color: #d8b888; font-size: 13px; margin-bottom: 22px; }
  .auth-field { text-align: left; margin-bottom: 14px; }
  .auth-field label { display: block; font-size: 11px; letter-spacing: 1px; color: #c4a070; margin-bottom: 5px; text-transform: uppercase; }
  .auth-field input {
    width: 100%; padding: 11px 14px; font-size: 15px;
    font-family: Georgia, serif; color: #2c2014;
    background: #f3e4c4; border: 1.5px solid #b89a6e; border-radius: 10px;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .auth-field input:focus { border-color: #c4884e; box-shadow: 0 0 0 3px rgba(196,136,78,0.3); }
  .auth-error { color: #e7a08c; font-size: 12px; min-height: 16px; margin-bottom: 10px; }
  .auth-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
  .auth-switch { margin-top: 18px; font-size: 14px; color: #caa878; }
  .auth-switch a { color: #f0d590; cursor: pointer; text-decoration: underline; font-weight: bold; font-size: 15px; }
  .auth-close {
    position: absolute; top: 14px; right: 16px; cursor: pointer;
    width: 34px; height: 34px; border-radius: 50%;
    display: grid; place-items: center;
    color: #f0d590; font-size: 30px; line-height: 1;
    background: linear-gradient(180deg, #8b5629, #4e2a12);
    border: 1.5px solid rgba(214,168,112,0.55);
    box-shadow: 0 4px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,225,160,0.22);
  }
  .auth-close:hover { filter: brightness(1.12); }
  .auth-fullwidth { width: 100%; justify-content: center; }
  .auth-userchip {
    position: absolute; top: 22px; left: 24px; z-index: 20;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 14px;
    background: linear-gradient(180deg, #b07a48, #784e2c);
    border: 1.5px solid rgba(214,168,112,0.55);
    box-shadow: 0 4px 10px rgba(0,0,0,0.45);
    color: #fff6e4; font-size: 13px; font-weight: bold;
  }
  .auth-userchip .logout-x { cursor: pointer; opacity: 0.8; }
  .auth-userchip .logout-x:hover { opacity: 1; }
  .save-toast {
    position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%);
    z-index: 40; padding: 10px 22px; border-radius: 999px;
    background: rgba(20,12,4,0.92); border: 1.5px solid rgba(214,168,112,0.55);
    color: #f0d590; font-size: 13px; font-style: italic;
    opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
  }
  .save-toast.show { opacity: 1; }

  /* ---- Welcome animation (lamplit wooden palette) ---- */
  .welcome-overlay {
    position: fixed; inset: 0; z-index: 200; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(120% 90% at 50% 6%, rgba(255,198,110,0.24), transparent 55%),
      radial-gradient(140% 120% at 50% 120%, rgba(8,4,0,0.78), transparent 60%),
      linear-gradient(180deg, #3a2817 0%, #2a1d10 45%, #150d05 100%);
    animation: welcomeFade 0.6s ease both;
  }
  .welcome-overlay.out { animation: welcomeOut 0.65s ease both; }
  @keyframes welcomeFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes welcomeOut { from { opacity: 1; } to { opacity: 0; } }
  .welcome-overlay::after {
    content: ""; position: absolute; top: -160px; left: 50%;
    width: 640px; height: 540px; margin-left: -320px;
    background: radial-gradient(circle at 50% 40%, rgba(255,198,110,0.30), transparent 62%);
    animation: flicker 4s ease-in-out infinite; pointer-events: none;
  }
  .welcome-embers { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
  .welcome-embers span {
    position: absolute; bottom: -12px; width: 6px; height: 6px; border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #FFE9B0, #C4884E);
    box-shadow: 0 0 10px rgba(255,198,110,0.75);
    opacity: 0; animation-name: ember; animation-timing-function: ease-in; animation-iteration-count: infinite;
  }
  @keyframes ember {
    0% { transform: translateY(0) scale(0.8); opacity: 0; }
    12% { opacity: 0.9; }
    80% { opacity: 0.5; }
    100% { transform: translateY(-82vh) scale(1.15); opacity: 0; }
  }
  .welcome-card { position: relative; z-index: 1; text-align: center; padding: 0 24px; }
  .welcome-mark { font-size: 30px; color: #C4884E; text-shadow: 0 0 26px rgba(196,136,78,0.8);
    animation: markSpin 7s linear infinite; }
  @keyframes markSpin { to { transform: rotate(360deg); } }
  .welcome-eyebrow { margin-top: 14px; color: #C4884E; text-transform: uppercase;
    letter-spacing: 0.32em; font-size: 13px; font-weight: bold; opacity: 0;
    animation: welFadeUp 0.7s ease 0.25s both; }
  .welcome-title {
    margin: 10px 0 0; font-family: Georgia, serif; font-weight: bold; color: #F0D590;
    font-size: clamp(3rem, 9vw, 5.6rem); letter-spacing: 4px; line-height: 1; opacity: 0;
    text-shadow: 0 3px 0 #6e4626, 0 0 54px rgba(255,198,110,0.5);
    animation: welTitleIn 1s cubic-bezier(.2,.8,.2,1) 0.35s both;
  }
  .welcome-name { margin: 16px 0 0; color: #E7CFA3; font-style: italic;
    font-size: clamp(1.05rem, 2.6vw, 1.55rem); opacity: 0; animation: welFadeUp 0.8s ease 0.72s both; }
  .welcome-rule { width: 0; height: 2px; margin: 28px auto 0; border-radius: 999px;
    background: linear-gradient(90deg, transparent, #C4884E, transparent);
    animation: welcomeRule 1.1s ease 0.95s both; }
  @keyframes welcomeRule { from { width: 0; } to { width: 260px; } }
  @keyframes welFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes welTitleIn { from { opacity: 0; transform: translateY(22px) scale(0.94); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
  `;
  const styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // ---- small helpers ----
  function makeEl(tag, opts = {}, ...kids) {
    const n = document.createElement(tag);
    if (opts.class) n.className = opts.class;
    if (opts.text != null) n.textContent = opts.text;
    if (opts.html != null) n.innerHTML = opts.html;
    if (opts.attrs) for (const k in opts.attrs) n.setAttribute(k, String(opts.attrs[k]));
    if (opts.on) for (const ev in opts.on) n.addEventListener(ev, opts.on[ev]);
    for (const k of kids) if (k) n.appendChild(k);
    return n;
  }

  // ============================================================
  //  Welcome animation — plays once after a successful sign-in/up
  // ============================================================
  function showWelcome(name, done) {
    const embers = makeEl("div", {
      class: "welcome-embers"
    });
    for (let i = 0; i < 7; i++) {
      const e = makeEl("span", {});
      e.style.left = 6 + i * 13 + "%";
      e.style.animationDelay = i * 0.45 + "s";
      e.style.animationDuration = 4.5 + i % 3 + "s";
      embers.appendChild(e);
    }
    const ov = makeEl("div", {
      class: "welcome-overlay"
    }, embers, makeEl("div", {
      class: "welcome-card"
    }, makeEl("div", {
      class: "welcome-mark",
      text: "✦"
    }), makeEl("div", {
      class: "welcome-eyebrow",
      text: "Your room is ready"
    }), makeEl("div", {
      class: "welcome-title",
      text: "Welcome"
    }), makeEl("div", {
      class: "welcome-name",
      text: name ? "to your story, " + name + "." : "to your story."
    }), makeEl("div", {
      class: "welcome-rule"
    })));
    // Append to <body> so mounting the lobby (which clears #app) can't remove it,
    // and start loading the game immediately so the lobby is ready underneath
    // the moment the welcome fades out — no flash of the start screen.
    document.body.appendChild(ov);
    if (done) done();
    setTimeout(() => {
      ov.classList.add("out");
      setTimeout(() => ov.remove(), 650);
    }, 4000);
  }

  // ============================================================
  //  Auth modal: sign in / sign up
  // ============================================================
  function buildAuthModal(mode, onSuccess) {
    const app = document.getElementById("app");
    const overlay = makeEl("div", {
      class: "auth-overlay show"
    });
    const errBox = makeEl("div", {
      class: "auth-error"
    });
    const userInput = makeEl("input", {
      attrs: {
        type: "text",
        autocomplete: "username"
      }
    });
    const passInput = makeEl("input", {
      attrs: {
        type: "password",
        autocomplete: "current-password"
      }
    });
    const nameInput = makeEl("input", {
      attrs: {
        type: "text",
        autocomplete: "nickname"
      }
    });
    let current = mode;
    const title = makeEl("h2", {});
    const sub = makeEl("div", {
      class: "auth-sub"
    });
    const nameField = makeEl("div", {
      class: "auth-field"
    }, makeEl("label", {
      text: "Display name"
    }), nameInput);
    const submitBtn = makeEl("button", {
      class: "wood-btn auth-fullwidth"
    });
    const switchLine = makeEl("div", {
      class: "auth-switch"
    });
    function render() {
      const signup = current === "signup";
      title.textContent = signup ? "Create profile" : "Welcome back";
      sub.textContent = signup ? "Save your coins, your shop, and your letters." : "Sign in to pick up where you left off.";
      nameField.style.display = signup ? "block" : "none";
      submitBtn.textContent = signup ? "Create & play" : "Sign in";
      switchLine.innerHTML = signup ? `Already have a profile? <a>Sign in</a>` : `New here? <a>Create a profile</a>`;
      switchLine.querySelector("a").addEventListener("click", () => {
        current = signup ? "signin" : "signup";
        errBox.textContent = "";
        render();
      });
    }
    async function submit() {
      errBox.textContent = "";
      const username = userInput.value.trim();
      const password = passInput.value;
      if (!username || !password) {
        errBox.textContent = "Username and password are required.";
        return;
      }
      submitBtn.disabled = true;
      try {
        if (current === "signup") {
          const displayName = nameInput.value.trim() || username;
          await api(API.register, "POST", {
            username,
            password,
            display_name: displayName
          });
        }
        const tok = await api(API.login, "POST", {
          username,
          password
        });
        // fetch display name
        Auth.setTokens(tok.access, tok.refresh, username);
        try {
          const me = await api(API.me, "GET");
          Auth.name = me.display_name;
          localStorage.setItem("stim_name", me.display_name);
        } catch (e) {/* keep username */}
        overlay.remove();
        const created = current === "signup";
        showWelcome(Auth.name || username, () => {
          if (onSuccess) onSuccess(created);
        });
      } catch (e) {
        errBox.textContent = e && e.message || "Could not sign in.";
        submitBtn.disabled = false;
      }
    }
    submitBtn.addEventListener("click", submit);
    passInput.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    const card = makeEl("div", {
      class: "auth-card"
    }, makeEl("button", {
      class: "auth-close",
      html: "&times;",
      on: {
        click: () => overlay.remove()
      }
    }), title, sub, errBox, nameField, makeEl("div", {
      class: "auth-field"
    }, makeEl("label", {
      text: "Username"
    }), userInput), makeEl("div", {
      class: "auth-field"
    }, makeEl("label", {
      text: "Password"
    }), passInput), makeEl("div", {
      class: "auth-actions"
    }, submitBtn), switchLine);
    overlay.appendChild(card);
    app.appendChild(overlay);
    render();
    setTimeout(() => userInput.focus(), 60);
  }

  // ============================================================
  //  Public hooks used by the game (window.StimulusAuth)
  // ============================================================
  window.StimulusAuth = {
    Auth,
    Progress,
    openSignIn(onSuccess) {
      buildAuthModal("signin", onSuccess);
    },
    openSignUp(onSuccess) {
      buildAuthModal("signup", onSuccess);
    },
    loggedIn() {
      return Auth.loggedIn();
    },
    displayName() {
      return Auth.name;
    },
    logout() {
      Auth.clear();
    },
    welcome(name, done) {
      showWelcome(name, done);
    },
    // Build the small "signed in as" chip with a logout control.
    userChip(onLogout) {
      if (!Auth.loggedIn()) return null;
      return makeEl("div", {
        class: "auth-userchip"
      }, makeEl("span", {
        text: "👤 " + (Auth.name || "Player")
      }), makeEl("span", {
        class: "logout-x",
        text: "⏻",
        attrs: {
          title: "Sign out"
        },
        on: {
          click: () => {
            Auth.clear();
            if (onLogout) onLogout();
          }
        }
      }));
    },
    // Show a brief "Progress saved" toast.
    toast(host, message) {
      const t = makeEl("div", {
        class: "save-toast",
        text: message || "Progress saved"
      });
      host.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 350);
      }, 1800);
    }
  };
})();
