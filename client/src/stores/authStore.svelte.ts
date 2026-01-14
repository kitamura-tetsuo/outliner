import { type IUser, userManager } from "../auth/UserManager";

class AuthStore {
    #user = $state<IUser | null>(null);
    #isAuthenticated = $state<boolean>(false);

    constructor() {
        this.#user = userManager.getCurrentUser();
        this.#isAuthenticated = this.#user !== null;

        userManager.addEventListener((authResult) => {
            this.#user = authResult?.user ?? null;
            this.#isAuthenticated = this.#user !== null;
        });
    }

    get user(): IUser | null {
        return this.#user;
    }

    get isAuthenticated(): boolean {
        return this.#isAuthenticated;
    }
}

export const authStore = new AuthStore();
