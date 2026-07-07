/* ============================================================
   STIMULUS — shared ambient types (not emitted to JS).
   Declares the data shapes and the window globals the game and
   the auth module exchange at runtime.
   ============================================================ */

interface SolutionMap {
  [key: string]: string;
}

interface PuzzleData {
  subtitle?: string;
  title?: string;
  subjects?: string[];
  attributes?: string[];
  options?: { [attr: string]: string[] };
  solution?: SolutionMap;
  clues?: Array<[string, string, string]>;
  slots?: string[];
  correctOrder?: number[];
  label?: string;
}

interface Card {
  label: string;
  task_text: string;
  coins: number;
  reward_type: string;
  room_effect?: string;
  data?: PuzzleData;
}

interface Letter {
  id: number;
  text: string;
  hint: string;
  cards: Card[];
}

interface ProgressState {
  coins: number;
  purchased_items: string[];
  used_letters: number[];
}

/** Options bag shared by the tiny DOM element builders in both files. */
interface ElOpts {
  class?: string;
  id?: string;
  text?: string | null;
  html?: string | null;
  style?: string;
  attrs?: { [k: string]: string | number };
  on?: { [ev: string]: (e: any) => void };
}

interface AuthState {
  access: string | null;
  refresh: string | null;
  name: string | null;
  isGuest: boolean;
  setTokens(access: string, refresh: string | null, name?: string | null): void;
  clear(): void;
  headers(): { [k: string]: string };
  loggedIn(): boolean;
}

interface ProgressApi {
  load(): Promise<any>;
  save(state: ProgressState): Promise<any>;
}

interface StimulusAuthAPI {
  Auth: AuthState;
  Progress: ProgressApi;
  openSignIn(onSuccess?: (created: boolean) => void): void;
  openSignUp(onSuccess?: (created: boolean) => void): void;
  loggedIn(): boolean;
  displayName(): string | null;
  logout(): void;
  userChip(onLogout?: () => void): HTMLElement | null;
  toast(host: HTMLElement, message?: string): void;
  welcome(name: string | null, done?: () => void): void;
}

interface Window {
  StimulusAuth?: StimulusAuthAPI;
  Stimulus?: { Game: any };
  __LETTERS__?: Letter[];
}
